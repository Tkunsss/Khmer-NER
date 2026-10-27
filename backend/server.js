require("dotenv").config();

const fs = require("node:fs"),
  path = require("node:path"),
  express = require("express"),
  helmet = require("helmet"),
  cookieParser = require("cookie-parser"),
  rateLimit = require("express-rate-limit"),
  bcrypt = require("bcryptjs"),
  jwt = require("jsonwebtoken"),
  mysql = require("mysql2/promise");
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error("JWT_SECRET is required");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (process.env.RENDER && !process.env.ADMIN_PASSWORD) {
  console.error("ADMIN_PASSWORD is required");
  process.exit(1);
}
let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
} catch (e) {
  console.error("DATABASE_URL must be a valid MySQL connection URI");
  process.exit(1);
}
if (databaseUrl.protocol !== "mysql:") {
  console.error("DATABASE_URL must use the mysql:// scheme");
  process.exit(1);
}
const pool = mysql.createPool({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 3306),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: decodeURIComponent(databaseUrl.pathname.slice(1)),
  charset: "utf8mb4",
  ssl: {
    ca: process.env.MYSQL_CA
      ? process.env.MYSQL_CA.replace(/\\n/g, "\n")
      : fs.readFileSync(path.join(__dirname, "aiven-ca.pem"), "utf8"),
    rejectUnauthorized: true,
  },
  waitForConnections: true,
  connectionLimit: 10,
});
const query = async (executor, sql, params = []) => {
  const [result] = await executor.execute(sql, params);
  return Array.isArray(result)
    ? { rows: result, rowCount: result.length }
    : { rows: [], rowCount: result.affectedRows, insertId: result.insertId };
};
const deleteImportChunks = (executor, uploadId, username) =>
  executor.query(
    "delete from import_chunks where upload_id=? and username=?",
    [uploadId, username],
  );
pool.query = (sql, params) => query(pool, sql, params);
pool.connect = async () => {
  const connection = await pool.getConnection();
  return {
    query: (sql, params) => query(connection, sql, params),
    begin: () => connection.beginTransaction(),
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
    release: () => connection.release(),
  };
};
const app = express();
app.set("trust proxy", 1);
app.use(helmet(), cookieParser(), express.json({ limit: "2mb" }));
const h = (f) => (q, s) =>
  f(q, s).catch((e) => {
    console.error(e);
    s.status(500).json({ error: "Server error" });
  });
const auth = async (q, s, n) => {
  try {
    const t = jwt.verify(q.cookies.sid || "", SECRET),
      r = (
        await pool.query(
          "select username,user_role as role from users where username=?",
          [t.u],
        )
      ).rows[0];
    if (!r) throw 0;
    q.u = { u: r.username, role: r.role };
    n();
  } catch (e) {
    s.status(401).json({ error: "Please sign in again." });
  }
};
const admin = (q, s, n) =>
  q.u.role === "admin" ? n() : s.status(403).json({ error: "Admins only." });
const err = (s, c, m) => s.status(c).json({ error: m });
const rowForOffset = (text, offset) => {
  let row = 1;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\r") {
      row++;
      if (text[i + 1] === "\n") i++;
    } else if (text[i] === "\n") row++;
  }
  return row;
};
const maskUnassignedRows = (text, assignments) => {
  let row = 1;
  return text
    .split(/(\r\n|\r|\n)/)
    .map((part) => {
      if (/^(?:\r\n|\r|\n)$/.test(part)) {
        row++;
        return part;
      }
      return assignments.some(
        (assignment) => row >= assignment.start && row <= assignment.end,
      )
        ? part
        : "•".repeat(part.length);
    })
    .join("");
};
app.use(
  "/api",
  rateLimit({
    windowMs: 9e5,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  (q, s, n) =>
    q.method === "GET" || q.get("x-requested-with") === "khner"
      ? n()
      : err(s, 403, "Blocked request."),
);

app.get("/health", (q, s) => s.send("ok"));
app.set("trust proxy", 1);
const hits = new Map();
app.post(
  "/api/login",
  h(async (q, s) => {
    const { u, p } = q.body || {},
      now = Date.now(),
      a = (hits.get(q.ip) || []).filter((t) => now - t < 9e5);
    if (a.length >= 10)
      return err(s, 429, "Too many failed attempts. Try again in 15 minutes.");
    const r = (await pool.query("select * from users where username=?", [u]))
      .rows[0];
    if (!r || !(await bcrypt.compare(p || "", r.pass))) {
      a.push(now);
      hits.set(q.ip, a);
      return err(s, 401, "Wrong username or password.");
    }
    s.cookie("sid", jwt.sign({ u: r.username }, SECRET, { expiresIn: "12h" }), {
      httpOnly: true,
      secure: !!process.env.RENDER,
      sameSite: "strict",
      maxAge: 432e5,
      path: "/",
    }).json({
      user: { u: r.username, role: r.role },
      weak: p === "admin123" || p.length < 8,
    });
  }),
);
app.post("/api/logout", (q, s) =>
  s.clearCookie("sid", { path: "/" }).json({ ok: 1 }),
);
app.use("/api", auth);
app.get("/api/me", (q, s) => s.json({ user: q.u }));
app.post(
  "/api/password",
  h(async (q, s) => {
    const { old, nw } = q.body || {};
    const r = (
      await pool.query("select pass from users where username=?", [q.u.u])
    ).rows[0];
    if (!r || !(await bcrypt.compare(old || "", r.pass)))
      return err(s, 400, "Current password is wrong.");
    if (!nw || nw.length < 8) return err(s, 400, "Use at least 8 characters.");
    await pool.query("update users set pass=? where username=?", [
      await bcrypt.hash(nw, 10),
      q.u.u,
    ]);
    s.json({ ok: 1 });
  }),
);
app.patch(
  "/api/anns/:id",
  h(async (q, s) => {
    const annotation = (
      await pool.query(
        "select a.doc_id,a.s,d.body,d.assignee from anns a join docs d on d.id=a.doc_id where a.id=?",
        [+q.params.id],
      )
    ).rows[0];
    if (!annotation) return err(s, 404, "Annotation not found.");
    if (q.u.role !== "admin") {
      const assignedRows = await pool.query(
        "select 1 from row_assignments where doc_id=? and username=? limit 1",
        [annotation.doc_id, q.u.u],
      );
      const fullAccess =
        !assignedRows.rowCount &&
        (annotation.assignee === q.u.u ||
          (
            await pool.query(
              "select 1 from doc_assignments where doc_id=? and username=?",
              [annotation.doc_id, q.u.u],
            )
          ).rowCount);
      const row = rowForOffset(annotation.body, annotation.s);
      if (
        !fullAccess &&
        !(
          await pool.query(
            "select 1 from row_assignments where doc_id=? and username=? and row_start<=? and row_end>=?",
            [annotation.doc_id, q.u.u, row, row],
          )
        ).rowCount
      )
        return err(s, 403, "This row is not assigned to you.");
    }
    try {
      await pool.query(
        "update anns set label=? where id=?",
        [q.body.label, +q.params.id],
      );
      s.json({ ok: 1 });
    } catch (e) {
      if (e.code === "ER_NO_REFERENCED_ROW_2")
        return err(s, 400, "Unknown label.");
      throw e;
    }
  }),
);

// users (admin)
app.get(
  "/api/users",
  admin,
  h(async (q, s) =>
    s.json(
      (
        await pool.query(
          "select username u,user_role as role from users order by username",
        )
      ).rows,
    ),
  ),
);
app.post(
  "/api/users",
  admin,
  h(async (q, s) => {
    const { u, p, role } = q.body || {};
    if (
      !/^[\w.-]{3,32}$/.test(u || "") ||
      !p ||
      p.length < 8 ||
      !["admin", "annotator"].includes(role)
    )
      return err(
        s,
        400,
        "Username: 3-32 letters, digits, . _ - and password: at least 8 characters.",
      );
    try {
      await pool.query(
        "insert into users(username,pass,user_role) values(?,?,?)",
        [u, await bcrypt.hash(p, 10), role],
      );
      s.json({ ok: 1 });
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY")
        return err(s, 409, "That username is taken.");
      throw e;
    }
  }),
);
app.delete(
  "/api/users/:u",
  admin,
  h(async (q, s) => {
    if (q.params.u === q.u.u) return err(s, 400, "You cannot delete yourself.");
    await pool.query("delete from users where username=?", [q.params.u]);
    s.json({ ok: 1 });
  }),
);

// labels (all roles)
app.get(
  "/api/labels",
  h(async (q, s) => {
    s.json((await pool.query("select name n,color c from labels order by name")).rows);
  }),
);
app.post(
  "/api/labels",
  admin,
  h(async (q, s) => {
    const n = String(q.body.n || "")
      .trim()
      .toUpperCase();
    if (!n || n.length > 30 || !/^#[0-9a-f]{6}$/i.test(q.body.c || "#888888"))
      return err(s, 400, "Enter a label name (max 30) and a valid color.");
    const r = await pool.query(
      "insert ignore into labels(name,color) values(?,?)",
      [n, q.body.c || "#888"],
    );
    r.rowCount ? s.json({ ok: 1 }) : err(s, 409, "That label already exists.");
  }),
);
app.delete(
  "/api/labels/:n",
  admin,
  h(async (q, s) => {
    try {
      await pool.query("delete from labels where name=?", [q.params.n]);
      s.json({ ok: 1 });
    } catch (e) {
      if (e.code === "ER_ROW_IS_REFERENCED_2")
        return err(
          s,
          409,
          "This label is used by annotations. Remove those first.",
        );
      throw e;
    }
  }),
);

// documents
app.get(
  "/api/docs",
  h(async (q, s) => {
    const a = q.u.role === "admin";
    const docs = await pool.query(
      `select id,title,body,assignee,done,review,note from docs
       ${a ? "" : "where exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?) or assignee=? or exists(select 1 from row_assignments ra where ra.doc_id=docs.id and ra.username=?)"} order by id`,
      a ? [] : [q.u.u,q.u.u,q.u.u],
    );
    const assignments = await pool.query("select doc_id,username from doc_assignments order by username");
    const assignedByDoc = new Map();
    for (const row of assignments.rows) { const k=String(row.doc_id); if(!assignedByDoc.has(k)) assignedByDoc.set(k,[]); assignedByDoc.get(k).push(row.username); }
    const rowAssignments = await pool.query(
      `select doc_id,username,row_start as start,row_end as end from row_assignments
       ${a ? "" : "where username=?"} order by doc_id,row_start`,
      a ? [] : [q.u.u],
    );
    const rowAssignmentsByDoc = new Map();
    for (const row of rowAssignments.rows) {
      const key = String(row.doc_id);
      if (!rowAssignmentsByDoc.has(key)) rowAssignmentsByDoc.set(key, []);
      rowAssignmentsByDoc.get(key).push({
        username: row.username,
        start: row.start,
        end: row.end,
      });
    }
    const annotations = await pool.query(
      `select x.id,x.doc_id,x.s,x.e,x.label l,x.author \`by\`
       from anns x join docs d on d.id=x.doc_id
       ${a ? "" : "where (exists(select 1 from doc_assignments da where da.doc_id=d.id and da.username=?) or d.assignee=? or exists(select 1 from row_assignments ra where ra.doc_id=d.id and ra.username=?))"} order by x.s`,
      a ? [] : [q.u.u,q.u.u,q.u.u],
    );
    const annsByDoc = new Map();
    for (const annotation of annotations.rows) {
      const key = String(annotation.doc_id);
      if (!annsByDoc.has(key)) annsByDoc.set(key, []);
      annsByDoc.get(key).push({
        id: String(annotation.id),
        s: annotation.s,
        e: annotation.e,
        l: annotation.l,
        by: annotation.by,
      });
    }
    if (!a) {
      for (const [docId, anns] of annsByDoc) {
        const doc = docs.rows.find((row) => String(row.id) === docId);
        const assignedRows = (rowAssignmentsByDoc.get(docId) || []).filter(
          (assignment) => assignment.username === q.u.u,
        );
        const fullAccess =
          !assignedRows.length &&
          (doc.assignee === q.u.u ||
            (assignedByDoc.get(docId) || []).includes(q.u.u));
        if (!fullAccess)
          annsByDoc.set(
            docId,
            anns.filter((annotation) => {
              const row = rowForOffset(doc.body, annotation.s);
              return assignedRows.some(
                (assignment) =>
                  assignment.username === q.u.u &&
                  row >= assignment.start &&
                  row <= assignment.end,
              );
            }),
          );
      }
    }
    s.json(
      docs.rows.map((d) => ({
        id: String(d.id),
        title: d.title,
        text:
          !a && rowAssignmentsByDoc.has(String(d.id))
            ? maskUnassignedRows(
                d.body,
                (rowAssignmentsByDoc.get(String(d.id)) || []).filter(
                  (assignment) => assignment.username === q.u.u,
                ),
              )
            : d.body,
        assignees: [...new Set([...(assignedByDoc.get(String(d.id)) || []), ...(d.assignee ? [d.assignee] : [])])],
        as: [...new Set([...(assignedByDoc.get(String(d.id)) || []), ...(d.assignee ? [d.assignee] : [])])].join(", "),
        rowAssignments: rowAssignmentsByDoc.get(String(d.id)) || [],
        done: !!d.done,
        review: d.review,
        note: d.note,
        anns: annsByDoc.get(String(d.id)) || [],
      })),
    );
  }),
);
app.patch(
  "/api/docs/:id",
  h(async (q, s) => {
    const { assignee, done, review, note } = q.body,
      id = +q.params.id,
      ad = q.u.role === "admin";
    if (assignee !== undefined) {
      if (!ad) return err(s, 403, "Admins only.");
      if (assignee !== null && typeof assignee !== "string")
        return err(s, 400, "Choose an annotator or unassign the document.");
      if (assignee) {
        const annotator = await pool.query(
          "select 1 from users where username=? and user_role='annotator'",
          [assignee],
        );
        if (!annotator.rowCount)
          return err(s, 400, "Choose an annotator or unassign the document.");
        if (
          (
            await pool.query(
              "select 1 from row_assignments where doc_id=? and username<>? limit 1",
              [id, assignee],
            )
          ).rowCount
        )
          return err(s, 409, "Rows are already assigned to another annotator.");
      }
      if (
        !(await pool.query("select 1 from docs where id=?", [id])).rowCount
      )
        return err(s, 404, "Document not found.");
      await pool.query("update docs set assignee=? where id=?", [
        assignee || null,
        id,
      ]);
    }
    if (q.body.assignees !== undefined) {
      if (!ad || !Array.isArray(q.body.assignees) || q.body.assignees.some((u) => typeof u !== "string"))
        return err(s, 400, "Choose one or more annotators.");
      const chosen = [...new Set(q.body.assignees)];
      for (const username of chosen) if (!(await pool.query("select 1 from users where username=? and user_role='annotator'", [username])).rowCount)
        return err(s, 400, "Choose valid annotators.");
      if (
        chosen.length &&
        (
          await pool.query(
            `select 1 from row_assignments where doc_id=? and username not in (${chosen.map(() => "?").join(",")}) limit 1`,
            [id, ...chosen],
          )
        ).rowCount
      )
        return err(s, 409, "Rows are already assigned to another annotator.");
      const c = await pool.connect();
      try {
        await c.begin(); await c.query("delete from doc_assignments where doc_id=?", [id]);
        for (const username of chosen) await c.query("insert into doc_assignments(doc_id,username) values(?,?)", [id,username]);
        await c.query("update docs set assignee=null where id=?", [id]); await c.commit();
      } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
    }
    if (q.body.rowAssignment !== undefined) {
      const { username, start, end } = q.body.rowAssignment || {};
      if (
        !ad ||
        typeof username !== "string" ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 1 ||
        end < start
      )
        return err(s, 400, "Choose an annotator and a valid row range.");
      const annotator = await pool.query(
        "select 1 from users where username=? and user_role='annotator'",
        [username],
      );
      if (!annotator.rowCount)
        return err(s, 400, "Choose a valid annotator.");
      const c = await pool.connect();
      try {
        await c.begin();
        const doc = await c.query("select body from docs where id=? for update", [id]);
        if (!doc.rowCount) {
          await c.rollback();
          return err(s, 404, "Document not found.");
        }
        const rowCount = doc.rows[0].body.split(/\r\n|\r|\n/).length;
        if (end > rowCount) {
          await c.rollback();
          return err(s, 400, "The row range exceeds the document.");
        }
        const overlap = await c.query(
          "select username from row_assignments where doc_id=? and row_start<=? and row_end>=? and username<>? union select username from doc_assignments where doc_id=? and username<>? union select assignee as username from docs where id=? and assignee is not null and assignee<>? limit 1",
          [id, end, start, username, id, username, id, username],
        );
        if (overlap.rowCount) {
          await c.rollback();
          return err(s, 409, "Some rows in this range are already assigned to another annotator.");
        }
        await c.query(
          "insert into row_assignments(doc_id,username,row_start,row_end) values(?,?,?,?)",
          [id, username, start, end],
        );
        await c.commit();
      } catch (e) {
        await c.rollback();
        if (e.code === "ER_DUP_ENTRY")
          return err(s, 409, "This row range is already assigned.");
        throw e;
      } finally {
        c.release();
      }
    }
    if (q.body.removeRowAssignment !== undefined) {
      const { username, start, end } = q.body.removeRowAssignment || {};
      if (
        !ad ||
        typeof username !== "string" ||
        !Number.isInteger(start) ||
        !Number.isInteger(end)
      )
        return err(s, 400, "Choose a valid row assignment.");
      await pool.query(
        "delete from row_assignments where doc_id=? and username=? and row_start=? and row_end=?",
        [id, username, start, end],
      );
    }
    if (done !== undefined) {
      const rowLimited =
        !ad &&
        (
          await pool.query(
            "select 1 from row_assignments where doc_id=? and username=? limit 1",
            [id, q.u.u],
          )
        ).rowCount;
      if (
        ad ||
        (!rowLimited &&
          (await pool.query(
            "select 1 from docs d where d.id=? and (d.assignee=? or exists(select 1 from doc_assignments da where da.doc_id=d.id and da.username=?))",
            [id, q.u.u, q.u.u],
          )).rowCount)
      )
        await pool.query(
          "update docs set done=?,review=case when ? then '' else review end where id=?",
          [!!done, !!done, id],
        );
      else return err(s, 403, "Only a document assignee can change document status.");
    }
    if (review !== undefined) {
      if (!ad) return err(s, 403, "Admins only.");
      await pool.query(
        "update docs set review=?,note=?,done=case when ?='returned' then false else done end where id=?",
        [review, note || "", review, id],
      );
    }
    s.json({ ok: 1 });
  }),
);
app.delete(
  "/api/docs/:id",
  h(async (q, s) => {
    const result = await pool.query(
      "delete from docs where id=? and (? or assignee=? or exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?))",
      [+q.params.id, q.u.role === "admin", q.u.u, q.u.u],
    );
    if (!result.rowCount) return err(s, 404, "Document not found.");
    s.json({ ok: 1 });
  }),
);

// annotations
app.post(
  "/api/docs/:id/anns",
  h(async (q, s) => {
    const id = +q.params.id,
      { start: a, end: b, label } = q.body;
    const d = (
      await pool.query("select body,assignee from docs where id=?", [id])
    ).rows[0];
    if (!d)
      return err(s, 404, "Document not found.");
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a < 0 ||
      b <= a ||
      b > d.body.length
    )
      return err(s, 400, "Invalid selection.");
    if (q.u.role !== "admin") {
      const assignedRows = await pool.query(
        "select 1 from row_assignments where doc_id=? and username=? limit 1",
        [id, q.u.u],
      );
      const fullAccess =
        !assignedRows.rowCount &&
        (d.assignee === q.u.u ||
          (
            await pool.query(
              "select 1 from doc_assignments where doc_id=? and username=?",
              [id, q.u.u],
            )
          ).rowCount);
      const startRow = rowForOffset(d.body, a),
        endRow = rowForOffset(d.body, b - 1);
      if (
        !fullAccess &&
        (startRow !== endRow ||
          !(await pool.query(
            "select 1 from row_assignments where doc_id=? and username=? and row_start<=? and row_end>=?",
            [id, q.u.u, startRow, startRow],
          )).rowCount)
      )
        return err(s, 403, "This row is not assigned to you.");
    }
    if (
      (
        await pool.query("select 1 from anns where doc_id=? and ?<e and ?>s", [
          id,
          a,
          b,
        ])
      ).rowCount
    )
      return err(
        s,
        409,
        "That text overlaps an existing entity. Remove it first.",
      );
    try {
      await pool.query(
        "insert into anns(doc_id,s,e,label,author) values(?,?,?,?,?)",
        [id, a, b, label, q.u.u],
      );
      s.json({ ok: 1 });
    } catch (e) {
      if (e.code === "ER_NO_REFERENCED_ROW_2")
        return err(s, 400, "Unknown label.");
      throw e;
    }
  }),
);
app.delete(
  "/api/anns/:id",
  h(async (q, s) => {
    const annotation = (
      await pool.query(
        "select a.doc_id,a.s,d.body,d.assignee from anns a join docs d on d.id=a.doc_id where a.id=?",
        [+q.params.id],
      )
    ).rows[0];
    if (!annotation) return s.json({ ok: 1 });
    if (q.u.role !== "admin") {
      const assignedRows = await pool.query(
        "select 1 from row_assignments where doc_id=? and username=? limit 1",
        [annotation.doc_id, q.u.u],
      );
      const fullAccess =
        !assignedRows.rowCount &&
        (annotation.assignee === q.u.u ||
          (
            await pool.query(
              "select 1 from doc_assignments where doc_id=? and username=?",
              [annotation.doc_id, q.u.u],
            )
          ).rowCount);
      const row = rowForOffset(annotation.body, annotation.s);
      if (
        !fullAccess &&
        !(await pool.query(
          "select 1 from row_assignments where doc_id=? and username=? and row_start<=? and row_end>=?",
          [annotation.doc_id, q.u.u, row, row],
        )).rowCount
      )
        return err(s, 403, "This row is not assigned to you.");
    }
    await pool.query("delete from anns where id=?", [+q.params.id]);
    s.json({ ok: 1 });
  }),
);

// import
app.post(
  "/api/import/chunk",
  h(async (q, s) => {
    const { uploadId, index, chunk } = q.body || {};
    if (
      typeof uploadId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(uploadId) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= 4096 ||
      typeof chunk !== "string" ||
      chunk.length > 1200000
    )
      return err(s, 400, "Invalid import chunk.");
    if (index === 0)
      await pool.query("delete from import_chunks where created_at < now() - interval 1 day");
    await pool.query(
      "insert into import_chunks(upload_id,username,chunk_index,chunk) values(?,?,?,?) on duplicate key update chunk=values(chunk),created_at=current_timestamp",
      [uploadId, q.u.u, index, chunk],
    );
    s.json({ ok: 1 });
  }),
);
app.post(
  "/api/import/finish",
  h(async (q, s) => {
    const { uploadId, chunks, title } = q.body || {};
    if (
      typeof uploadId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(uploadId) ||
      !Number.isInteger(chunks) ||
      chunks < 1 ||
      chunks > 4096
    )
      return err(s, 400, "Invalid import upload.");
    const c = await pool.connect();
    try {
      await c.begin();
      const found = await c.query(
        "select count(*) as n from import_chunks where upload_id=? and username=?",
        [uploadId, q.u.u],
      );
      if (Number(found.rows[0].n) !== chunks) {
        await c.rollback();
        await deleteImportChunks(c, uploadId, q.u.u);
        return err(s, 400, "The upload is incomplete. Please select the file again.");
      }
      const id = (
        await c.query(
          "insert into docs(title,body,assignee,done,note) values(?,?,?,0,'')",
          [String(title || "Untitled").slice(0, 1000), "", q.u.role === "admin" ? null : q.u.u],
        )
      ).insertId;
      for (let start = 0; start < chunks; start += 8) {
        const rows = await c.query(
          "select chunk_index,chunk from import_chunks where upload_id=? and username=? and chunk_index>=? and chunk_index<? order by chunk_index",
          [uploadId, q.u.u, start, Math.min(start + 8, chunks)],
        );
        if (rows.rows.length !== Math.min(8, chunks - start)) {
          await c.rollback();
          await deleteImportChunks(c, uploadId, q.u.u);
          return err(s, 400, "The upload is incomplete. Please select the file again.");
        }
        const text = rows.rows.map((row, offset) => {
          if (row.chunk_index !== start + offset) throw new Error("Invalid import chunk sequence");
          return row.chunk;
        }).join("");
        await c.query("update docs set body=concat(body,?) where id=?", [text, id]);
      }
      await deleteImportChunks(c, uploadId, q.u.u);
      await c.commit();
      s.json({ count: 1 });
    } catch (e) {
      try {
        await c.rollback();
      } catch (rollbackError) {
        console.error("Failed to roll back import transaction", rollbackError);
      }
      try {
        await deleteImportChunks(c, uploadId, q.u.u);
      } catch (cleanupError) {
        console.error("Failed to clean up chunks after import failure", cleanupError);
      }
      throw e;
    } finally {
      c.release();
    }
  }),
);
app.post(
  "/api/import",
  h(async (q, s) => {
    const { labels = [], docs = [] } = q.body,
      u = q.u,
      c = await pool.connect();
    let n = 0;
    try {
      await c.begin();
      for (const l of labels)
        if (l.n && u.role === "admin")
          await c.query("insert ignore into labels(name,color) values(?,?)", [
            l.n,
            l.c || "#888",
          ]);
      for (const d of docs) {
        if (!d.text) continue;
        let as = u.role === "admin" ? d.assignee : u.u;
        if (
          u.role === "admin" &&
          as &&
          !(
            await c.query(
              "select 1 from users where username=? and user_role='annotator'",
              [as],
            )
          ).rowCount
        )
          as = null;
        const id = (
          await c.query(
            "insert into docs(title,body,assignee,done,note) values(?,?,?,?,?)",
            [
              d.title || "Untitled",
              d.text,
              as || null,
              u.role === "admin" && !!d.done,
              "",
            ],
          )
        ).insertId;
        for (const a of d.annotations || []) {
          if (
            !a.label ||
            !Number.isInteger(a.start) ||
            !Number.isInteger(a.end) ||
            a.start < 0 ||
            a.end <= a.start ||
            a.end > d.text.length
          )
            continue;
          await c.query(
            "insert ignore into labels(name,color) values(?,'#888')",
            [a.label],
          );
          await c.query(
            "insert into anns(doc_id,s,e,label,author) values(?,?,?,?,?)",
            [id, a.start, a.end, a.label, a.by || null],
          );
        }
        n++;
      }
      await c.commit();
      s.json({ count: n });
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }),
);

(async () => {
  await pool.query(`create table if not exists users (
    username varchar(32) primary key,
    pass varchar(255) not null,
    user_role varchar(16) not null
  ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci`);
  await pool.query(`create table if not exists labels (
    name varchar(30) primary key,
    color char(7) not null
  ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci`);
  await pool.query(`create table if not exists docs (
    id bigint unsigned not null auto_increment primary key,
    title text not null,
    body longtext not null,
    assignee varchar(32) null,
    done boolean not null default false,
    review varchar(20) not null default '',
    note text not null,
    constraint docs_assignee_fk foreign key (assignee)
      references users(username) on delete set null
  ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci`);
  await pool.query(`create table if not exists doc_assignments (
    doc_id bigint unsigned not null, username varchar(32) not null,
    primary key(doc_id,username),
    constraint doc_assignments_doc_fk foreign key(doc_id) references docs(id) on delete cascade,
    constraint doc_assignments_user_fk foreign key(username) references users(username) on delete cascade
  ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci`);
  await pool.query(`create table if not exists row_assignments (
    doc_id bigint unsigned not null,
    username varchar(32) not null,
    row_start int unsigned not null,
    row_end int unsigned not null,
    primary key(doc_id,username,row_start,row_end),
    index row_assignments_lookup(doc_id,username,row_start,row_end),
    constraint row_assignments_doc_fk foreign key(doc_id) references docs(id) on delete cascade,
    constraint row_assignments_user_fk foreign key(username) references users(username) on delete cascade
  ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci`);
  await pool.query(`create table if not exists import_chunks (
    upload_id char(36) not null,
    username varchar(32) not null,
    chunk_index int unsigned not null,
    chunk longtext not null,
    created_at timestamp not null default current_timestamp on update current_timestamp,
    primary key(upload_id,username,chunk_index),
    index import_chunks_created_at(created_at),
    constraint import_chunks_user_fk foreign key(username) references users(username) on delete cascade
  ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci`);
  await pool.query("insert ignore into doc_assignments(doc_id,username) select id,assignee from docs where assignee is not null");
  await pool.query(`create table if not exists anns (
    id bigint unsigned not null auto_increment primary key,
    doc_id bigint unsigned not null,
    s int not null,
    e int not null,
    label varchar(30) not null,
    author varchar(32) null,
    constraint anns_doc_fk foreign key (doc_id)
      references docs(id) on delete cascade,
    constraint anns_label_fk foreign key (label)
      references labels(name)
  ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci`);
  await pool.query("update users set user_role='admin' where username=?", [
    process.env.ADMIN_USER || "admin",
  ]);
  if (!(await pool.query("select 1 from users")).rowCount)
    await pool.query(
      "insert into users(username,pass,user_role) values(?,?,?)",
      [
        process.env.ADMIN_USER || "admin",
        await bcrypt.hash(process.env.ADMIN_PASSWORD || "admin123", 10),
        "admin",
      ],
    );
  if (!(await pool.query("select 1 from labels")).rowCount)
    await pool.query(
      "insert into labels(name,color) values('PER','#ef4444'),('LOC','#10b981'),('ORG','#3b82f6')",
    );
  app.use((e, q, s, n) => {
    if (e.type === "entity.too.large")
      return err(s, 413, "Request is too large. Large files are uploaded in smaller chunks.");
    n(e);
  });
  app.listen(process.env.PORT || 3000, () => console.log("API ready"));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

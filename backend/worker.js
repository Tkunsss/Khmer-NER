import bcrypt from "bcryptjs";
import { hashPassword, isLegacyBcrypt, verifyPassword } from "./auth.js";
import { createConnection } from "mysql2/promise";

const API_WINDOW_MS = 15 * 60 * 1000;
const API_LIMIT = 600;
const LOGIN_LIMIT = 10;
const BODY_LIMIT = 2 * 1024 * 1024;
const apiHits = new Map();
const loginHits = new Map();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const errorCode = (error) =>
  typeof error?.code === "string" ? error.code : "UNKNOWN";

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
const err = (status, message) => json({ error: message }, status);
const noContent = () => new Response(null, { status: 204 });

function decodeCookie(request, name) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return "";
    }
  }
  return "";
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function jwtKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signToken(username, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(encoder.encode('{"alg":"HS256","typ":"JWT"}'));
  const payload = base64UrlEncode(
    encoder.encode(JSON.stringify({ u: username, iat: now, exp: now + 12 * 60 * 60 })),
  );
  const content = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await jwtKey(secret),
    encoder.encode(content),
  );
  return `${content}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyToken(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(decoder.decode(base64UrlDecode(parts[0])));
    const payload = JSON.parse(decoder.decode(base64UrlDecode(parts[1])));
    if (
      header.alg !== "HS256" ||
      typeof payload.u !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    )
      return null;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await jwtKey(secret),
      base64UrlDecode(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    return valid ? payload : null;
  } catch {
    return null;
  }
}

function consumeLimit(map, key, limit, now) {
  const recent = (map.get(key) || []).filter((time) => now - time < API_WINDOW_MS);
  if (recent.length >= limit) {
    map.set(key, recent);
    return false;
  }
  recent.push(now);
  map.set(key, recent);
  if (map.size > 10000) {
    for (const [storedKey, times] of map) {
      if (!times.some((time) => now - time < API_WINDOW_MS)) map.delete(storedKey);
    }
  }
  return true;
}

function rowForOffset(text, offset) {
  let row = 1;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\r") {
      row++;
      if (text[i + 1] === "\n") i++;
    } else if (text[i] === "\n") row++;
  }
  return row;
}

function maskUnassignedRows(text, assignments) {
  let row = 1;
  let assignmentIndex = 0;
  let position = 0;
  const parts = [];
  while (position < text.length) {
    let lineEnd = text.indexOf("\n", position);
    const crEnd = text.indexOf("\r", position);
    if (lineEnd < 0 || (crEnd >= 0 && crEnd < lineEnd)) lineEnd = crEnd;
    if (lineEnd < 0) lineEnd = text.length;

    while (
      assignmentIndex < assignments.length &&
      assignments[assignmentIndex].end < row
    )
      assignmentIndex++;
    const assignment = assignments[assignmentIndex];
    parts.push(
      assignment && row >= assignment.start && row <= assignment.end
        ? text.slice(position, lineEnd)
        : "•".repeat(lineEnd - position),
    );
    if (lineEnd === text.length) break;

    if (text[lineEnd] === "\r" && text[lineEnd + 1] === "\n") {
      parts.push("\r\n");
      position = lineEnd + 2;
    } else {
      parts.push(text[lineEnd]);
      position = lineEnd + 1;
    }
    row++;
  }
  return parts.join("");
}

async function execute(connection, sql, params = []) {
  const [result] = await connection.query(sql, params);
  return Array.isArray(result)
    ? { rows: result, rowCount: result.length }
    : { rows: [], rowCount: result.affectedRows, insertId: result.insertId };
}

async function deleteImportChunks(connection, uploadId, username) {
  return execute(
    connection,
    "delete from import_chunks where upload_id=? and username=?",
    [uploadId, username],
  );
}

function parsePath(pathname) {
  try {
    return pathname.split("/").map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
}

async function readBody(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > BODY_LIMIT) return { error: "too-large" };
  const text = await request.text();
  if (encoder.encode(text).byteLength > BODY_LIMIT) return { error: "too-large" };
  try {
    return { body: text ? JSON.parse(text) : {} };
  } catch {
    return { error: "invalid-json" };
  }
}

function cookieHeaders(token) {
  return {
    "set-cookie": `sid=${encodeURIComponent(token)}; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=Strict`,
  };
}

function clearedCookieHeaders() {
  return { "set-cookie": "sid=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict" };
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const allowedOrigin = env.ALLOWED_ORIGIN;
  if (!origin || !allowedOrigin || origin !== allowedOrigin) return {};
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "Content-Type, X-Requested-With",
    vary: "Origin",
  };
}

async function matchesHealthCheckToken(expected, provided) {
  const [expectedHash, providedHash] = await Promise.all(
    [expected, provided].map((value) =>
      crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
  const expectedBytes = new Uint8Array(expectedHash);
  const providedBytes = new Uint8Array(providedHash);
  let difference = 0;
  for (let i = 0; i < expectedBytes.length; i++)
    difference |= expectedBytes[i] ^ providedBytes[i];
  return difference === 0;
}

async function handleApi(request, env, connection, body, user) {
  const method = request.method;
  const path = parsePath(new URL(request.url).pathname);
  if (!path) return err(400, "Invalid path.");
  const parts = path;
  const username = user.u;
  const isAdmin = user.role === "admin";

  if (method === "GET" && parts.length === 3 && parts[2] === "me")
    return json({ user });

  if (method === "POST" && parts.length === 3 && parts[2] === "password") {
    const { old, nw } = body || {};
    const result = await execute(
      connection,
      "select pass from users where username=?",
      [username],
    );
    const current = result.rows[0];
    const currentPassword = typeof old === "string" ? old : "";
    let currentPasswordValid =
      current && (await verifyPassword(currentPassword, current.pass));
    if (
      !currentPasswordValid &&
      current &&
      isLegacyBcrypt(current.pass)
    ) {
      currentPasswordValid = await bcrypt.compare(currentPassword, current.pass);
    }
    if (!currentPasswordValid)
      return err(400, "Current password is wrong.");
    if (typeof nw !== "string" || nw.length < 8)
      return err(400, "Use at least 8 characters.");
    await execute(connection, "update users set pass=? where username=?", [
      await hashPassword(nw),
      username,
    ]);
    return json({ ok: 1 });
  }

  if (method === "PATCH" && parts.length === 4 && parts[2] === "anns") {
    const id = +parts[3];
    const annotation = (
      await execute(
        connection,
        "select a.doc_id,a.s,d.body,d.assignee from anns a join docs d on d.id=a.doc_id where a.id=?",
        [id],
      )
    ).rows[0];
    if (!annotation) return err(404, "Annotation not found.");
    if (!isAdmin) {
      const assignedRows = await execute(
        connection,
        "select 1 from row_assignments where doc_id=? and username=? limit 1",
        [annotation.doc_id, username],
      );
      const fullAccess =
        !assignedRows.rowCount &&
        (annotation.assignee === username ||
          (
            await execute(
              connection,
              "select 1 from doc_assignments where doc_id=? and username=?",
              [annotation.doc_id, username],
            )
          ).rowCount);
      const row = rowForOffset(annotation.body, annotation.s);
      if (
        !fullAccess &&
        !(
          await execute(
            connection,
            "select 1 from row_assignments where doc_id=? and username=? and row_start<=? and row_end>=?",
            [annotation.doc_id, username, row, row],
          )
        ).rowCount
      )
        return err(403, "This row is not assigned to you.");
    }
    try {
      await execute(connection, "update anns set label=? where id=?", [
        body.label,
        id,
      ]);
      return json({ ok: 1 });
    } catch (error) {
      if (error.code === "ER_NO_REFERENCED_ROW_2") return err(400, "Unknown label.");
      throw error;
    }
  }

  if (parts.length === 3 && parts[2] === "users") {
    if (!isAdmin) return err(403, "Admins only.");
    if (method === "GET") {
      return json(
        (
          await execute(
            connection,
            "select username u,user_role as role from users order by username",
          )
        ).rows,
      );
    }
    if (method === "POST") {
      const { u, p, role } = body || {};
      if (
        !/^[\w.-]{3,32}$/.test(u || "") ||
        typeof p !== "string" ||
        p.length < 8 ||
        !["admin", "annotator"].includes(role)
      )
        return err(
          400,
          "Username: 3-32 letters, digits, . _ - and password: at least 8 characters.",
        );
      try {
        await execute(
          connection,
          "insert into users(username,pass,user_role) values(?,?,?)",
          [u, await hashPassword(p), role],
        );
        return json({ ok: 1 });
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY")
          return err(409, "That username is taken.");
        throw error;
      }
    }
  }

  if (method === "DELETE" && parts.length === 4 && parts[2] === "users") {
    if (!isAdmin) return err(403, "Admins only.");
    if (parts[3] === username) return err(400, "You cannot delete yourself.");
    await execute(connection, "delete from users where username=?", [parts[3]]);
    return json({ ok: 1 });
  }

  if (parts.length === 3 && parts[2] === "labels") {
    if (method === "GET") {
      return json(
        (await execute(connection, "select name n,color c from labels order by name")).rows,
      );
    }
    if (method === "POST") {
      if (!isAdmin) return err(403, "Admins only.");
      const name = String(body.n || "").trim().toUpperCase();
      if (!name || name.length > 30 || !/^#[0-9a-f]{6}$/i.test(body.c || "#888888"))
        return err(400, "Enter a label name (max 30) and a valid color.");
      const result = await execute(
        connection,
        "insert ignore into labels(name,color) values(?,?)",
        [name, body.c || "#888"],
      );
      return result.rowCount
        ? json({ ok: 1 })
        : err(409, "That label already exists.");
    }
  }

  if (method === "DELETE" && parts.length === 4 && parts[2] === "labels") {
    if (!isAdmin) return err(403, "Admins only.");
    try {
      await execute(connection, "delete from labels where name=?", [parts[3]]);
      return json({ ok: 1 });
    } catch (error) {
      if (error.code === "ER_ROW_IS_REFERENCED_2")
        return err(409, "This label is used by annotations. Remove those first.");
      throw error;
    }
  }

  if (method === "GET" && parts.length === 3 && parts[2] === "docs") {
    const startedAt = performance.now();
    const docs = await execute(
      connection,
      `select id,title,body,assignee,done,review,note from docs
       ${isAdmin ? "" : "where exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?) or assignee=? or exists(select 1 from row_assignments ra where ra.doc_id=docs.id and ra.username=?)"} order by id`,
      isAdmin ? [] : [username, username, username],
    );
    const docsAt = performance.now();
    const assignments = await execute(
      connection,
      "select doc_id,username from doc_assignments order by username",
    );
    const assignmentsAt = performance.now();
    const assignedByDoc = new Map();
    for (const row of assignments.rows) {
      const key = String(row.doc_id);
      if (!assignedByDoc.has(key)) assignedByDoc.set(key, []);
      assignedByDoc.get(key).push(row.username);
    }
    const rowAssignments = await execute(
      connection,
      `select doc_id,username,row_start as start,row_end as end from row_assignments
       ${isAdmin ? "" : "where username=?"} order by doc_id,row_start`,
      isAdmin ? [] : [username],
    );
    const rowAssignmentsAt = performance.now();
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
    const annotations = await execute(
      connection,
      `select x.id,x.doc_id,x.s,x.e,x.label l,x.author \`by\`
       from anns x join docs d on d.id=x.doc_id
       ${isAdmin ? "" : "where (exists(select 1 from doc_assignments da where da.doc_id=d.id and da.username=?) or d.assignee=? or exists(select 1 from row_assignments ra where ra.doc_id=d.id and ra.username=?))"} order by x.s`,
      isAdmin ? [] : [username, username, username],
    );
    const annotationsAt = performance.now();
    const annsByDoc = new Map();
    const docsById = new Map(
      docs.rows.map((doc) => [String(doc.id), doc]),
    );
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
    if (!isAdmin) {
      for (const [docId, anns] of annsByDoc) {
        const doc = docsById.get(docId);
        const assignedRows = rowAssignmentsByDoc.get(docId) || [];
        const fullAccess =
          !assignedRows.length &&
          (doc.assignee === username ||
            (assignedByDoc.get(docId) || []).includes(username));
        if (!fullAccess) {
          let position = 0;
          let row = 1;
          let assignmentIndex = 0;
          const visibleAnnotations = [];
          for (const annotation of anns) {
            while (position < annotation.s) {
              if (doc.body[position] === "\r") {
                row++;
                if (doc.body[position + 1] === "\n") position++;
              } else if (doc.body[position] === "\n") row++;
              position++;
            }
            while (
              assignmentIndex < assignedRows.length &&
              assignedRows[assignmentIndex].end < row
            )
              assignmentIndex++;
            const assignment = assignedRows[assignmentIndex];
            if (assignment && row >= assignment.start && row <= assignment.end)
              visibleAnnotations.push(annotation);
          }
          annsByDoc.set(docId, visibleAnnotations);
        }
      }
    }
    let totalChars = 0;
    const result = docs.rows.map((doc) => {
      totalChars += doc.body.length;
      const assignees = [
        ...new Set([
          ...(assignedByDoc.get(String(doc.id)) || []),
          ...(doc.assignee ? [doc.assignee] : []),
        ]),
      ];
      return {
        id: String(doc.id),
        title: doc.title,
        text:
          !isAdmin && rowAssignmentsByDoc.has(String(doc.id))
            ? maskUnassignedRows(
                doc.body,
                (rowAssignmentsByDoc.get(String(doc.id)) || []).filter(
                  (assignment) => assignment.username === username,
                ),
              )
            : doc.body,
        assignees,
        as: assignees.join(", "),
        rowAssignments: rowAssignmentsByDoc.get(String(doc.id)) || [],
        done: !!doc.done,
        review: doc.review,
        note: doc.note,
        anns: annsByDoc.get(String(doc.id)) || [],
      };
    });
    const processedAt = performance.now();
    const serialized = JSON.stringify(result);
    const responseBody = encoder.encode(serialized);
    const serializedAt = performance.now();
    const responseBytes = responseBody.byteLength;
    console.log("api/docs phases", {
      dbDocsMs: Math.round(docsAt - startedAt),
      dbAssignmentsMs: Math.round(assignmentsAt - docsAt),
      dbRowAssignmentsMs: Math.round(rowAssignmentsAt - assignmentsAt),
      dbAnnotationsMs: Math.round(annotationsAt - rowAssignmentsAt),
      processingMs: Math.round(processedAt - annotationsAt),
      serializeMs: Math.round(serializedAt - processedAt),
      docCount: docs.rows.length,
      annCount: annotations.rows.length,
      totalChars,
      responseBytes,
      isAdmin,
    });
    return new Response(responseBody, {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  if (method === "PATCH" && parts.length === 4 && parts[2] === "docs") {
    const { assignee, done, review, note } = body;
    const id = +parts[3];
    if (assignee !== undefined) {
      if (!isAdmin) return err(403, "Admins only.");
      if (assignee !== null && typeof assignee !== "string")
        return err(400, "Choose an annotator or unassign the document.");
      if (assignee) {
        const annotator = await execute(
          connection,
          "select 1 from users where username=? and user_role='annotator'",
          [assignee],
        );
        if (!annotator.rowCount)
          return err(400, "Choose an annotator or unassign the document.");
        if (
          (
            await execute(
              connection,
              "select 1 from row_assignments where doc_id=? and username<>? limit 1",
              [id, assignee],
            )
          ).rowCount
        )
          return err(409, "Rows are already assigned to another annotator.");
      }
      if (!(await execute(connection, "select 1 from docs where id=?", [id])).rowCount)
        return err(404, "Document not found.");
      await execute(connection, "update docs set assignee=? where id=?", [
        assignee || null,
        id,
      ]);
    }
    if (body.assignees !== undefined) {
      if (
        !isAdmin ||
        !Array.isArray(body.assignees) ||
        body.assignees.some((value) => typeof value !== "string")
      )
        return err(400, "Choose one or more annotators.");
      const chosen = [...new Set(body.assignees)];
      for (const name of chosen) {
        if (
          !(
            await execute(
              connection,
              "select 1 from users where username=? and user_role='annotator'",
              [name],
            )
          ).rowCount
        )
          return err(400, "Choose valid annotators.");
      }
      if (
        chosen.length &&
        (
          await execute(
            connection,
            `select 1 from row_assignments where doc_id=? and username not in (${chosen.map(() => "?").join(",")}) limit 1`,
            [id, ...chosen],
          )
        ).rowCount
      )
        return err(409, "Rows are already assigned to another annotator.");
      await connection.beginTransaction();
      try {
        await execute(connection, "delete from doc_assignments where doc_id=?", [id]);
        for (const name of chosen)
          await execute(
            connection,
            "insert into doc_assignments(doc_id,username) values(?,?)",
            [id, name],
          );
        await execute(connection, "update docs set assignee=null where id=?", [id]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    if (body.rowAssignment !== undefined) {
      const { username: assignedUser, start, end } = body.rowAssignment || {};
      if (
        !isAdmin ||
        typeof assignedUser !== "string" ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 1 ||
        end < start
      )
        return err(400, "Choose an annotator and a valid row range.");
      const annotator = await execute(
        connection,
        "select 1 from users where username=? and user_role='annotator'",
        [assignedUser],
      );
      if (!annotator.rowCount) return err(400, "Choose a valid annotator.");
      await connection.beginTransaction();
      try {
        const doc = await execute(connection, "select body from docs where id=? for update", [id]);
        if (!doc.rowCount) {
          await connection.rollback();
          return err(404, "Document not found.");
        }
        const rowCount = doc.rows[0].body.split(/\r\n|\r|\n/).length;
        if (end > rowCount) {
          await connection.rollback();
          return err(400, "The row range exceeds the document.");
        }
        const overlap = await execute(
          connection,
          "select username from row_assignments where doc_id=? and row_start<=? and row_end>=? and username<>? union select username from doc_assignments where doc_id=? and username<>? union select assignee as username from docs where id=? and assignee is not null and assignee<>? limit 1",
          [id, end, start, assignedUser, id, assignedUser, id, assignedUser],
        );
        if (overlap.rowCount) {
          await connection.rollback();
          return err(409, "Some rows in this range are already assigned to another annotator.");
        }
        await execute(
          connection,
          "insert into row_assignments(doc_id,username,row_start,row_end) values(?,?,?,?)",
          [id, assignedUser, start, end],
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        if (error.code === "ER_DUP_ENTRY")
          return err(409, "This row range is already assigned.");
        throw error;
      }
    }
    if (body.removeRowAssignment !== undefined) {
      const { username: assignedUser, start, end } = body.removeRowAssignment || {};
      if (
        !isAdmin ||
        typeof assignedUser !== "string" ||
        !Number.isInteger(start) ||
        !Number.isInteger(end)
      )
        return err(400, "Choose a valid row assignment.");
      await execute(
        connection,
        "delete from row_assignments where doc_id=? and username=? and row_start=? and row_end=?",
        [id, assignedUser, start, end],
      );
    }
    if (done !== undefined) {
      const rowLimited =
        !isAdmin &&
        (
          await execute(
            connection,
            "select 1 from row_assignments where doc_id=? and username=? limit 1",
            [id, username],
          )
        ).rowCount;
      if (
        isAdmin ||
        (!rowLimited &&
          (
            await execute(
              connection,
              "select 1 from docs d where d.id=? and (d.assignee=? or exists(select 1 from doc_assignments da where da.doc_id=d.id and da.username=?))",
              [id, username, username],
            )
          ).rowCount)
      )
        await execute(
          connection,
          "update docs set done=?,review=case when ? then '' else review end where id=?",
          [!!done, !!done, id],
        );
      else
        return err(403, "Only a document assignee can change document status.");
    }
    if (review !== undefined) {
      if (!isAdmin) return err(403, "Admins only.");
      await execute(
        connection,
        "update docs set review=?,note=?,done=case when ?='returned' then false else done end where id=?",
        [review, note || "", review, id],
      );
    }
    return json({ ok: 1 });
  }

  if (method === "DELETE" && parts.length === 4 && parts[2] === "docs") {
    const result = await execute(
      connection,
      "delete from docs where id=? and (? or assignee=? or exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?))",
      [+parts[3], isAdmin, username, username],
    );
    if (!result.rowCount) return err(404, "Document not found.");
    return json({ ok: 1 });
  }

  if (
    method === "POST" &&
    parts.length === 5 &&
    parts[2] === "docs" &&
    parts[4] === "anns"
  ) {
    const id = +parts[3];
    const { start: startOffset, end: endOffset, label } = body;
    const doc = (
      await execute(connection, "select body,assignee from docs where id=?", [id])
    ).rows[0];
    if (!doc) return err(404, "Document not found.");
    if (
      !Number.isInteger(startOffset) ||
      !Number.isInteger(endOffset) ||
      startOffset < 0 ||
      endOffset <= startOffset ||
      endOffset > doc.body.length
    )
      return err(400, "Invalid selection.");
    if (!isAdmin) {
      const assignedRows = await execute(
        connection,
        "select 1 from row_assignments where doc_id=? and username=? limit 1",
        [id, username],
      );
      const fullAccess =
        !assignedRows.rowCount &&
        (doc.assignee === username ||
          (
            await execute(
              connection,
              "select 1 from doc_assignments where doc_id=? and username=?",
              [id, username],
            )
          ).rowCount);
      const startRow = rowForOffset(doc.body, startOffset);
      const endRow = rowForOffset(doc.body, endOffset - 1);
      if (
        !fullAccess &&
        (startRow !== endRow ||
          !(await execute(
            connection,
            "select 1 from row_assignments where doc_id=? and username=? and row_start<=? and row_end>=?",
            [id, username, startRow, startRow],
          )).rowCount)
      )
        return err(403, "This row is not assigned to you.");
    }
    if (
      (
        await execute(connection, "select 1 from anns where doc_id=? and ?<e and ?>s", [
          id,
          startOffset,
          endOffset,
        ])
      ).rowCount
    )
      return err(409, "That text overlaps an existing entity. Remove it first.");
    try {
      await execute(
        connection,
        "insert into anns(doc_id,s,e,label,author) values(?,?,?,?,?)",
        [id, startOffset, endOffset, label, username],
      );
      return json({ ok: 1 });
    } catch (error) {
      if (error.code === "ER_NO_REFERENCED_ROW_2") return err(400, "Unknown label.");
      throw error;
    }
  }

  if (method === "DELETE" && parts.length === 4 && parts[2] === "anns") {
    const id = +parts[3];
    const annotation = (
      await execute(
        connection,
        "select a.doc_id,a.s,d.body,d.assignee from anns a join docs d on d.id=a.doc_id where a.id=?",
        [id],
      )
    ).rows[0];
    if (!annotation) return json({ ok: 1 });
    if (!isAdmin) {
      const assignedRows = await execute(
        connection,
        "select 1 from row_assignments where doc_id=? and username=? limit 1",
        [annotation.doc_id, username],
      );
      const fullAccess =
        !assignedRows.rowCount &&
        (annotation.assignee === username ||
          (
            await execute(
              connection,
              "select 1 from doc_assignments where doc_id=? and username=?",
              [annotation.doc_id, username],
            )
          ).rowCount);
      const row = rowForOffset(annotation.body, annotation.s);
      if (
        !fullAccess &&
        !(await execute(
          connection,
          "select 1 from row_assignments where doc_id=? and username=? and row_start<=? and row_end>=?",
          [annotation.doc_id, username, row, row],
        )).rowCount
      )
        return err(403, "This row is not assigned to you.");
    }
    await execute(connection, "delete from anns where id=?", [id]);
    return json({ ok: 1 });
  }

  if (method === "POST" && parts.length === 4 && parts[2] === "import" && parts[3] === "chunk") {
    const { uploadId, index, chunk } = body || {};
    if (
      typeof uploadId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(uploadId) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= 4096 ||
      typeof chunk !== "string" ||
      chunk.length > 1200000
    )
      return err(400, "Invalid import chunk.");
    if (index === 0)
      await execute(
        connection,
        "delete from import_chunks where created_at < now() - interval 1 day",
      );
    await execute(
      connection,
      "insert into import_chunks(upload_id,username,chunk_index,chunk) values(?,?,?,?) on duplicate key update chunk=values(chunk),created_at=current_timestamp",
      [uploadId, username, index, chunk],
    );
    return json({ ok: 1 });
  }

  if (method === "POST" && parts.length === 4 && parts[2] === "import" && parts[3] === "finish") {
    const { uploadId, chunks, title } = body || {};
    if (
      typeof uploadId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(uploadId) ||
      !Number.isInteger(chunks) ||
      chunks < 1 ||
      chunks > 4096
    )
      return err(400, "Invalid import upload.");
    await connection.beginTransaction();
    try {
      const found = await execute(
        connection,
        "select count(*) as n,min(chunk_index) as first_index,max(chunk_index) as last_index,coalesce(sum(octet_length(chunk)),0) as byte_count from import_chunks where upload_id=? and username=?",
        [uploadId, username],
      );
      const upload = found.rows[0];
      if (
        Number(upload.n) !== chunks ||
        Number(upload.first_index) !== 0 ||
        Number(upload.last_index) !== chunks - 1
      ) {
        await connection.rollback();
        await deleteImportChunks(connection, uploadId, username);
        return err(400, "The upload is incomplete. Please select the file again.");
      }
      const inserted = await execute(
        connection,
        "insert into docs(title,body,assignee,done,note) values(?,?,?,0,'')",
        [
          String(title || "Untitled").slice(0, 1000),
          "",
          isAdmin ? null : username,
        ],
      );
      const id = inserted.insertId;
      await execute(connection, "set session group_concat_max_len=4294967295");
      await execute(
        connection,
        "update docs set body=(select group_concat(chunk order by chunk_index separator '') from import_chunks where upload_id=? and username=?) where id=?",
        [uploadId, username, id],
      );
      const imported = await execute(
        connection,
        "select octet_length(body) as byte_count from docs where id=?",
        [id],
      );
      if (Number(imported.rows[0].byte_count) !== Number(upload.byte_count))
        throw new Error("Imported document content was truncated");
      await deleteImportChunks(connection, uploadId, username);
      await connection.commit();
      return json({ count: 1 });
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Failed to roll back import transaction", {
          code: errorCode(rollbackError),
        });
      }
      try {
        await deleteImportChunks(connection, uploadId, username);
      } catch (cleanupError) {
        console.error("Failed to clean up chunks after import failure", {
          code: errorCode(cleanupError),
        });
      }
      throw error;
    }
  }

  if (method === "POST" && parts.length === 3 && parts[2] === "import") {
    const { labels = [], docs = [] } = body;
    let count = 0;
    await connection.beginTransaction();
    try {
      for (const label of labels)
        if (label.n && isAdmin)
          await execute(connection, "insert ignore into labels(name,color) values(?,?)", [
            label.n,
            label.c || "#888",
          ]);
      for (const doc of docs) {
        if (!doc.text) continue;
        let assignee = isAdmin ? doc.assignee : username;
        if (
          isAdmin &&
          assignee &&
          !(
            await execute(
              connection,
              "select 1 from users where username=? and user_role='annotator'",
              [assignee],
            )
          ).rowCount
        )
          assignee = null;
        const inserted = await execute(
          connection,
          "insert into docs(title,body,assignee,done,note) values(?,?,?,?,?)",
          [
            doc.title || "Untitled",
            doc.text,
            assignee || null,
            isAdmin && !!doc.done,
            "",
          ],
        );
        for (const annotation of doc.annotations || []) {
          if (
            !annotation.label ||
            !Number.isInteger(annotation.start) ||
            !Number.isInteger(annotation.end) ||
            annotation.start < 0 ||
            annotation.end <= annotation.start ||
            annotation.end > doc.text.length
          )
            continue;
          await execute(connection, "insert ignore into labels(name,color) values(?,'#888')", [
            annotation.label,
          ]);
          await execute(
            connection,
            "insert into anns(doc_id,s,e,label,author) values(?,?,?,?,?)",
            [
              inserted.insertId,
              annotation.start,
              annotation.end,
              annotation.label,
              annotation.by || null,
            ],
          );
        }
        count++;
      }
      await connection.commit();
      return json({ count });
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  return err(404, "Not found.");
}

export default {
  async fetch(request, env) {
    const headers = {
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
      "cache-control": "no-store",
      ...corsHeaders(request, env),
    };
    const withHeaders = (response) => {
      const responseHeaders = new Headers(response.headers);
      for (const [name, value] of Object.entries(headers))
        if (value) responseHeaders.set(name, value);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    };
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return withHeaders(
        env.ALLOWED_ORIGIN && request.headers.get("origin") === env.ALLOWED_ORIGIN
          ? noContent()
          : err(403, "Origin is not allowed."),
      );
    }
    if (request.method === "GET" && url.pathname === "/health/db") {
      const authorization = request.headers.get("authorization") || "";
      const providedToken = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";
      if (
        !env.HEALTH_CHECK_TOKEN ||
        !(await matchesHealthCheckToken(env.HEALTH_CHECK_TOKEN, providedToken))
      )
        return withHeaders(err(404, "Not found."));

      if (!env.HYPERDRIVE) {
        console.error("Database health check failed: HYPERDRIVE binding is missing");
        return withHeaders(err(503, "Database connection unavailable."));
      }

      let connection;
      try {
        connection = await createConnection({
          host: env.HYPERDRIVE.host,
          user: env.HYPERDRIVE.user,
          password: env.HYPERDRIVE.password,
          database: env.HYPERDRIVE.database,
          port: env.HYPERDRIVE.port,
          charset: "utf8mb4",
          disableEval: true,
        });
        const result = await execute(connection, "select 1 as ok");
        if (Number(result.rows[0]?.ok) !== 1)
          throw new Error("Health query returned an unexpected result");
        return withHeaders(json({ status: "ok" }));
      } catch (error) {
        console.error("Database health check failed", {
          code: errorCode(error),
        });
        return withHeaders(err(503, "Database connection unavailable."));
      } finally {
        if (connection) {
          try {
            await connection.end();
          } catch (error) {
            console.error("Failed to close health-check connection", {
              code: errorCode(error),
            });
          }
        }
      }
    }
    if (request.method === "GET" && url.pathname === "/health")
      return withHeaders(new Response("ok", { headers: { "content-type": "text/plain" } }));
    if (!url.pathname.startsWith("/api/") && url.pathname !== "/api")
      return withHeaders(err(404, "Not found."));

    const now = Date.now();
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (!consumeLimit(apiHits, ip, API_LIMIT, now))
      return withHeaders(err(429, "Too many requests, please try again later."));
    if (
      request.method !== "GET" &&
      request.headers.get("x-requested-with") !== "khner"
    )
      return withHeaders(err(403, "Blocked request."));

    let body = {};
    if (request.method !== "GET" && request.method !== "HEAD") {
      const parsed = await readBody(request);
      if (parsed.error === "too-large")
        return withHeaders(
          err(413, "Request is too large. Large files are uploaded in smaller chunks."),
        );
      if (parsed.error)
        return withHeaders(err(400, "Invalid JSON request body."));
      body = parsed.body;
    }

    if (request.method === "POST" && url.pathname === "/api/login") {
      if (!env.JWT_SECRET) {
        console.error("JWT_SECRET is required");
        return withHeaders(err(500, "Server error"));
      }
      if (!env.HYPERDRIVE) {
        console.error("HYPERDRIVE binding is required");
        return withHeaders(err(500, "Server error"));
      }
      const attempts = loginHits.get(ip) || [];
      const recent = attempts.filter((time) => now - time < API_WINDOW_MS);
      if (recent.length >= LOGIN_LIMIT) {
        loginHits.set(ip, recent);
        return withHeaders(
          err(429, "Too many failed attempts. Try again in 15 minutes."),
        );
      }
      let connection;
      try {
        connection = await createConnection({
          host: env.HYPERDRIVE.host,
          user: env.HYPERDRIVE.user,
          password: env.HYPERDRIVE.password,
          database: env.HYPERDRIVE.database,
          port: env.HYPERDRIVE.port,
          charset: "utf8mb4",
          disableEval: true,
        });
        const { u, p } = body || {};
        const result = await execute(
          connection,
          "select username,pass,user_role as role from users where username=?",
          [u],
        );
        const record = result.rows[0];
        const password = typeof p === "string" ? p : "";
        let valid = record && (await verifyPassword(password, record.pass));
        if (!valid && record && isLegacyBcrypt(record.pass)) {
          valid = await bcrypt.compare(password, record.pass);
          if (valid) {
            await execute(
              connection,
              "update users set pass=? where username=? and pass=?",
              [
                await hashPassword(password),
                record.username,
                record.pass,
              ],
            );
          }
        }
        if (!valid) {
          recent.push(now);
          loginHits.set(ip, recent);
          return withHeaders(err(401, "Wrong username or password."));
        }
        const response = json(
          {
            user: { u: record.username, role: record.role },
            weak: password === "admin123" || password.length < 8,
          },
          200,
          cookieHeaders(await signToken(record.username, env.JWT_SECRET)),
        );
        return withHeaders(response);
      } catch (error) {
        console.error("Login request failed", { code: errorCode(error) });
        return withHeaders(err(500, "Server error"));
      } finally {
        if (connection) {
          try {
            await connection.end();
          } catch (error) {
            console.error("Failed to close Hyperdrive connection", {
              code: errorCode(error),
            });
          }
        }
      }
    }

    if (request.method === "POST" && url.pathname === "/api/logout")
      return withHeaders(json({ ok: 1 }, 200, clearedCookieHeaders()));

    if (!env.JWT_SECRET) {
      console.error("JWT_SECRET is required");
      return withHeaders(err(500, "Server error"));
    }
    if (!env.HYPERDRIVE) {
      console.error("HYPERDRIVE binding is required");
      return withHeaders(err(500, "Server error"));
    }
    const token = await verifyToken(decodeCookie(request, "sid"), env.JWT_SECRET);
    if (!token) return withHeaders(err(401, "Please sign in again."));

    let connection;
    try {
      connection = await createConnection({
        host: env.HYPERDRIVE.host,
        user: env.HYPERDRIVE.user,
        password: env.HYPERDRIVE.password,
        database: env.HYPERDRIVE.database,
        port: env.HYPERDRIVE.port,
        charset: "utf8mb4",
        disableEval: true,
      });
      const currentUser = (
        await execute(
          connection,
          "select username,user_role as role from users where username=?",
          [token.u],
        )
      ).rows[0];
      if (!currentUser) return withHeaders(err(401, "Please sign in again."));
      const response = await handleApi(
        request,
        env,
        connection,
        body,
        { u: currentUser.username, role: currentUser.role },
      );
      return withHeaders(response);
    } catch (error) {
      console.error("API request failed", { code: errorCode(error) });
      return withHeaders(err(500, "Server error"));
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch (error) {
          console.error("Failed to close Hyperdrive connection", {
            code: errorCode(error),
          });
        }
      }
    }
  },
};

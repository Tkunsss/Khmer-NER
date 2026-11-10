import bcrypt from "bcryptjs";
import { hashPassword, isLegacyBcrypt, verifyPassword } from "./auth.js";

const API_WINDOW_MS = 15 * 60 * 1000;
const API_LIMIT = 600;
const LOGIN_LIMIT = 10;
const BODY_LIMIT = 2 * 1024 * 1024;
const apiHits = new Map();
const loginHits = new Map();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const errorCode = (error) =>
  typeof error?.code === "string"
    ? error.code
    : typeof error?.message === "string" &&
        error.message.includes("constraint failed")
      ? "SQLITE_CONSTRAINT"
      : "UNKNOWN";
const isDuplicateError = (error) =>
  errorCode(error) === "ER_DUP_ENTRY" ||
  /unique constraint failed|primary key/i.test(error?.message || "");
const isForeignKeyError = (error) =>
  ["ER_NO_REFERENCED_ROW_2", "ER_ROW_IS_REFERENCED_2"].includes(errorCode(error)) ||
  /foreign key constraint failed/i.test(error?.message || "");

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
  let chunkLength = 0;
  let parts = [];
  const chunks = [];
  const append = (part) => {
    if (!part.length) return;
    parts.push(part);
    chunkLength += part.length;
    if (chunkLength >= 16 * 1024) {
      chunks.push(parts.join(""));
      parts = [];
      chunkLength = 0;
    }
  };
  while (position < text.length) {
    let lineEnd = position;
    while (
      lineEnd < text.length &&
      text[lineEnd] !== "\n" &&
      text[lineEnd] !== "\r"
    )
      lineEnd++;

    while (
      assignmentIndex < assignments.length &&
      assignments[assignmentIndex].end < row
    )
      assignmentIndex++;
    const assignment = assignments[assignmentIndex];
    append(
      assignment && row >= assignment.start && row <= assignment.end
        ? text.slice(position, lineEnd)
        : "•".repeat(lineEnd - position),
    );
    if (lineEnd === text.length) break;

    if (text[lineEnd] === "\r" && text[lineEnd + 1] === "\n") {
      append("\r\n");
      position = lineEnd + 2;
    } else {
      append(text[lineEnd]);
      position = lineEnd + 1;
    }
    row++;
  }
  if (parts.length) chunks.push(parts.join(""));
  return { text: chunks.join(""), rowCount: row };
}

async function execute(database, sql, params = []) {
  const prepared = database.prepare(sql);
  const statement = params.length ? prepared.bind(...params) : prepared;
  if (/^\s*select\b/i.test(sql)) {
    const result = await statement.all();
    return { rows: result.results, rowCount: result.results.length };
  }
  const result = await statement.run();
  return {
    rows: [],
    rowCount: result.meta.changes,
    insertId: result.meta.last_row_id,
  };
}

async function deleteImportChunks(database, uploadId, username) {
  return execute(
    database,
    "delete from import_chunks where upload_id=? and username=?",
    [uploadId, username],
  );
}

const importChunkKey = (username, uploadId, index) =>
  `imports/${encodeURIComponent(username)}/${uploadId}/${String(index).padStart(4, "0")}`;

function documentRowCount(text) {
  return countLineBreaks(text) + 1;
}

function countLineBreaks(text) {
  let lineBreaks = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\r") {
      lineBreaks++;
      if (text[index + 1] === "\n") index++;
    } else if (text[index] === "\n") {
      lineBreaks++;
    }
  }
  return lineBreaks;
}

async function readDocument(bucket, key) {
  const object = await bucket.get(key);
  if (!object) throw new Error("Document body is missing from object storage");
  return object.text();
}

async function cleanupImportObjects(bucket, username, uploadId, chunks) {
  if (chunks.length)
    await bucket.delete(
      chunks.map((chunk) => importChunkKey(username, uploadId, chunk.chunk_index)),
    );
}

function importedDocumentStats(chunks) {
  let byteCount = 0;
  let lineBreaks = 0;
  let previousEndedWithCarriageReturn = false;
  for (const chunk of chunks) {
    byteCount += Number(chunk.byte_count);
    lineBreaks += Number(chunk.line_break_count);
    if (previousEndedWithCarriageReturn && Number(chunk.starts_with_lf))
      lineBreaks--;
    previousEndedWithCarriageReturn = !!Number(chunk.ends_with_cr);
  }
  return { byteCount, rowCount: lineBreaks + 1 };
}

function importedDocumentStream(bucket, username, uploadId, chunks) {
  let chunkIndex = 0;
  let reader;
  return new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          if (!reader) {
            if (chunkIndex >= chunks.length) {
              controller.close();
              return;
            }
            const object = await bucket.get(
              importChunkKey(username, uploadId, chunks[chunkIndex].chunk_index),
            );
            if (!object) throw new Error("An uploaded import chunk is missing");
            reader = object.body.getReader();
          }
          const result = await reader.read();
          if (result.done) {
            reader.releaseLock();
            reader = undefined;
            chunkIndex++;
            continue;
          }
          controller.enqueue(result.value);
          return;
        }
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      if (reader) await reader.cancel(reason);
    },
  });
}

async function putImportedDocument(bucket, key, username, uploadId, chunks, byteCount) {
  const fixedLength = new FixedLengthStream(byteCount);
  await Promise.all([
    bucket.put(key, fixedLength.readable, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    }),
    importedDocumentStream(bucket, username, uploadId, chunks).pipeTo(fixedLength.writable),
  ]);
}

async function storeDocument(bucket, key, text) {
  const byteCount = encoder.encode(text).byteLength;
  const rowCount = documentRowCount(text);
  await bucket.put(key, text, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
  return { bodyKey: key, byteCount, rowCount };
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
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
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

async function handleApi(request, env, connection, body, user, setStage = () => {}) {
  const method = request.method;
  const path = parsePath(new URL(request.url).pathname);
  if (!path) return err(400, "Invalid path.");
  const parts = path;
  const username = user.u;
  const isAdmin = user.role === "admin";

  if (method === "GET" && parts.length === 3 && parts[2] === "me")
    return json({ user });

  if (
    (method === "GET" || method === "PUT") &&
    parts.length === 5 &&
    parts[2] === "docs" &&
    parts[4] === "progress"
  ) {
    const id = Number(parts[3]);
    if (!Number.isSafeInteger(id) || id < 1)
      return err(400, "Invalid document.");
    const doc = (
      await execute(
        connection,
        `select id,assignee,row_count as rowCount from docs
         where id=? ${
           isAdmin
             ? ""
             : "and (exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?) or assignee=? or exists(select 1 from row_assignments ra where ra.doc_id=docs.id and ra.username=?))"
         }`,
        isAdmin ? [id] : [id, username, username, username],
      )
    ).rows[0];
    if (!doc) return err(404, "Document not found.");

    if (method === "GET") {
      const progress = (
        await execute(
          connection,
          "select row_position as saved_row from annotation_progress where doc_id=? and username=?",
          [id, username],
        )
      ).rows[0];
      return json({ row: progress ? Number(progress.saved_row) : null });
    }

    const row = body?.row;
    if (!Number.isInteger(row) || row < 1 || row > Number(doc.rowCount))
      return err(400, "Choose a valid document row.");
    if (!isAdmin) {
      const assignments = await execute(
        connection,
        "select row_start as start,row_end as end from row_assignments where doc_id=? and username=?",
        [id, username],
      );
      const fullAccess =
        !assignments.rowCount &&
        (doc.assignee === username ||
          (
            await execute(
              connection,
              "select 1 from doc_assignments where doc_id=? and username=?",
              [id, username],
            )
          ).rowCount);
      if (
        !fullAccess &&
        !assignments.rows.some(
          (assignment) => row >= assignment.start && row <= assignment.end,
        )
      )
        return err(403, "This row is not assigned to you.");
    }
    await execute(
      connection,
      `insert into annotation_progress(doc_id,username,row_position)
       values(?,?,?)
       on conflict(doc_id,username) do update set
         row_position=excluded.row_position,
         updated_at=current_timestamp`,
      [id, username, row],
    );
    return json({ ok: 1, row });
  }

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
        "select a.doc_id,a.s,d.body_key,d.assignee from anns a join docs d on d.id=a.doc_id where a.id=?",
        [id],
      )
    ).rows[0];
    if (!annotation) return err(404, "Annotation not found.");
    annotation.body = await readDocument(env.DOCS, annotation.body_key);
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
      if (isForeignKeyError(error)) return err(400, "Unknown label.");
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
        if (isDuplicateError(error))
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
        "insert or ignore into labels(name,color) values(?,?)",
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
      if (isForeignKeyError(error))
        return err(409, "This label is used by annotations. Remove those first.");
      throw error;
    }
  }

  if (method === "GET" && parts.length === 3 && parts[2] === "docs") {
    const docs = await execute(
      connection,
      `select id,title,body_key,assignee,done,review,note,row_count as rowCount,
              (select count(*) from anns x where x.doc_id=docs.id) as annCount
       from docs
       ${isAdmin ? "" : "where exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?) or assignee=? or exists(select 1 from row_assignments ra where ra.doc_id=docs.id and ra.username=?)"} order by id`,
      isAdmin ? [] : [username, username, username],
    );
    const assignments = await execute(
      connection,
      "select doc_id,username from doc_assignments order by username",
    );
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
    const progressRows = await execute(
      connection,
      `select doc_id,username,row_position as saved_row from annotation_progress
       ${isAdmin ? "" : "where username=?"}`,
      isAdmin ? [] : [username],
    );
    const progressByDoc = new Map();
    for (const progress of progressRows.rows) {
      const key = String(progress.doc_id);
      if (!progressByDoc.has(key)) progressByDoc.set(key, {});
      progressByDoc.get(key)[progress.username] = Number(progress.saved_row);
    }
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
    const highlightedAnnotations = await execute(
      connection,
      `select doc_id,s,author from anns
       ${isAdmin ? "" : "where author=?"} order by doc_id,s`,
      isAdmin ? [] : [username],
    );
    const annotationsByDoc = new Map();
    for (const annotation of highlightedAnnotations.rows) {
      const key = String(annotation.doc_id);
      if (!annotationsByDoc.has(key)) annotationsByDoc.set(key, []);
      annotationsByDoc.get(key).push(annotation);
    }
    const highlightedRowsByDoc = new Map();
    const annotatedDocs = docs.rows.filter((doc) =>
      annotationsByDoc.has(String(doc.id)),
    );
    let nextAnnotatedDoc = 0;
    const loadHighlightedRows = async () => {
      while (nextAnnotatedDoc < annotatedDocs.length) {
        const doc = annotatedDocs[nextAnnotatedDoc++];
        const annotations = annotationsByDoc.get(String(doc.id));
        const text = await readDocument(env.DOCS, doc.body_key);
        const rowsByUser = new Map();
        let position = 0;
        let row = 1;
        for (const annotation of annotations) {
          while (position < annotation.s) {
            if (text[position] === "\r") {
              row++;
              if (text[position + 1] === "\n") position++;
            } else if (text[position] === "\n") {
              row++;
            }
            position++;
          }
          if (!rowsByUser.has(annotation.author))
            rowsByUser.set(annotation.author, new Set());
          rowsByUser.get(annotation.author).add(row);
        }
        highlightedRowsByDoc.set(
          String(doc.id),
          Object.fromEntries(
            [...rowsByUser].map(([author, rows]) => [author, [...rows]]),
          ),
        );
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(4, annotatedDocs.length) },
        () => loadHighlightedRows(),
      ),
    );
    const result = docs.rows.map((doc) => {
      const docId = String(doc.id);
      const rowLimited = !isAdmin && rowAssignmentsByDoc.has(docId);
      const assignees = [
        ...new Set([
          ...(assignedByDoc.get(docId) || []),
          ...(doc.assignee ? [doc.assignee] : []),
        ]),
      ];
      return {
        id: docId,
        title: doc.title,
        assignees,
        as: assignees.join(", "),
        rowAssignments: rowAssignmentsByDoc.get(docId) || [],
        progressByUser: progressByDoc.get(docId) || {},
        highlightedRowsByUser: highlightedRowsByDoc.get(docId) || {},
        rowCount: Number(doc.rowCount),
        annCount: rowLimited ? null : Number(doc.annCount),
        done: !!doc.done,
        review: doc.review,
        note: doc.note,
      };
    });
    return json(result);
  }

  if (
    method === "GET" &&
    parts.length === 5 &&
    parts[2] === "docs" &&
    parts[4] === "row-count"
  ) {
    const id = Number(parts[3]);
    if (!Number.isSafeInteger(id) || id < 1)
      return err(400, "Invalid document.");
    const result = await execute(
      connection,
      `select row_count as rowCount from docs
       where id=? ${
         isAdmin
           ? ""
           : "and (exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?) or assignee=? or exists(select 1 from row_assignments ra where ra.doc_id=docs.id and ra.username=?))"
       }`,
      isAdmin ? [id] : [id, username, username, username],
    );
    if (!result.rows.length) return err(404, "Document not found.");
    return json({ rowCount: Number(result.rows[0].rowCount) });
  }

  if (method === "GET" && parts.length === 4 && parts[2] === "docs") {
    const id = Number(parts[3]);
    if (!Number.isSafeInteger(id) || id < 1) return err(400, "Invalid document.");
    setStage("document detail lookup");
    const doc = (
      await execute(
        connection,
        `select id,title,body_key,assignee,done,review,note,
                row_count as rowCount
         from docs
         where id=? ${
           isAdmin
             ? ""
             : "and (exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?) or assignee=? or exists(select 1 from row_assignments ra where ra.doc_id=docs.id and ra.username=?))"
         }`,
        isAdmin ? [id] : [id, username, username, username],
      )
    ).rows[0];
    if (!doc) return err(404, "Document not found.");
    doc.body = await readDocument(env.DOCS, doc.body_key);

    setStage("document assignments lookup");
    const assignments = await execute(
      connection,
      "select username from doc_assignments where doc_id=? order by username",
      [id],
    );
    const assignees = [
      ...new Set([
        ...assignments.rows.map((row) => row.username),
        ...(doc.assignee ? [doc.assignee] : []),
      ]),
    ];
    setStage("document row assignments lookup");
    const rowAssignments = await execute(
      connection,
      `select username,row_start as start,row_end as end from row_assignments
       where doc_id=? ${isAdmin ? "" : "and username=?"} order by row_start`,
      isAdmin ? [id] : [id, username],
    );
    const assignedRows = rowAssignments.rows;
    setStage("document annotations lookup");
    const annotations = await execute(
      connection,
      "select id,s,e,label l,author `by` from anns where doc_id=? order by s",
      [id],
    );
    let visibleAnnotations = annotations.rows;
    if (!isAdmin) {
      const fullAccess =
        !assignedRows.length &&
        (doc.assignee === username ||
          assignments.rows.some((row) => row.username === username));
      if (!fullAccess) {
        let position = 0;
        let row = 1;
        let assignmentIndex = 0;
        let nextLineBreak = null;
        let nextLineEnd = 0;
        visibleAnnotations = [];
        for (const annotation of annotations.rows) {
          while (position < annotation.s) {
            if (nextLineBreak === null) {
              const lineFeed = doc.body.indexOf("\n", position);
              const carriageReturn = doc.body.indexOf("\r", position);
              nextLineBreak =
                lineFeed < 0 ||
                (carriageReturn >= 0 && carriageReturn < lineFeed)
                  ? carriageReturn
                  : lineFeed;
              nextLineEnd =
                nextLineBreak < 0
                  ? doc.body.length
                  : nextLineBreak +
                    (doc.body[nextLineBreak] === "\r" &&
                    doc.body[nextLineBreak + 1] === "\n"
                      ? 2
                      : 1);
            }
            if (nextLineBreak < 0 || nextLineBreak >= annotation.s) {
              position = annotation.s;
              break;
            }
            position = nextLineEnd;
            nextLineBreak = null;
            row++;
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
      }
    }

    setStage("document response construction");
    const maskedDocument =
      !isAdmin && assignedRows.length
        ? maskUnassignedRows(doc.body, assignedRows)
        : null;
    return json({
      id: String(doc.id),
      title: doc.title,
      text: maskedDocument ? maskedDocument.text : doc.body,
      assignees,
      as: assignees.join(", "),
      rowAssignments: assignedRows,
      rowCount: Number(maskedDocument?.rowCount ?? doc.rowCount),
      done: !!doc.done,
      review: doc.review,
      note: doc.note,
      anns: visibleAnnotations.map((annotation) => ({
        id: String(annotation.id),
        s: annotation.s,
        e: annotation.e,
        l: annotation.l,
        by: annotation.by,
      })),
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
      const statements = [
        connection.prepare("delete from doc_assignments where doc_id=?").bind(id),
        ...chosen.map((name) =>
          connection
            .prepare("insert into doc_assignments(doc_id,username) values(?,?)")
            .bind(id, name),
        ),
        connection.prepare("update docs set assignee=null where id=?").bind(id),
      ];
      await connection.batch(statements);
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
      try {
        const doc = await execute(
          connection,
          "select row_count as rowCount from docs where id=?",
          [id],
        );
        if (!doc.rowCount) return err(404, "Document not found.");
        const rowCount = Number(doc.rows[0].rowCount);
        if (end > rowCount) return err(400, "The row range exceeds the document.");
        const overlap = await execute(
          connection,
          "select username from row_assignments where doc_id=? and row_start<=? and row_end>=? and username<>? union select username from doc_assignments where doc_id=? and username<>? union select assignee as username from docs where id=? and assignee is not null and assignee<>? limit 1",
          [id, end, start, assignedUser, id, assignedUser, id, assignedUser],
        );
        if (overlap.rowCount)
          return err(409, "Some rows in this range are already assigned to another annotator.");
        const inserted = await execute(
          connection,
          `insert into row_assignments(doc_id,username,row_start,row_end)
           select ?,?,?,?
           where not exists(
             select 1 from row_assignments
             where doc_id=? and row_start<=? and row_end>=? and username<>?
           )
           and not exists(
             select 1 from doc_assignments where doc_id=? and username<>?
           )
           and not exists(
             select 1 from docs where id=? and assignee is not null and assignee<>?
           )`,
          [
            id, assignedUser, start, end,
            id, end, start, assignedUser,
            id, assignedUser,
            id, assignedUser,
          ],
        );
        if (!inserted.rowCount)
          return err(409, "Some rows in this range are already assigned to another annotator.");
      } catch (error) {
        if (isDuplicateError(error))
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
    const doc = (
      await execute(
        connection,
        "select id,body_key from docs where id=? and (? or assignee=? or exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?))",
        [+parts[3], isAdmin ? 1 : 0, username, username],
      )
    ).rows[0];
    if (!doc) return err(404, "Document not found.");
    await execute(
      connection,
      "delete from docs where id=?",
      [doc.id],
    );
    try {
      await env.DOCS.delete(doc.body_key);
    } catch (error) {
      console.error("Failed to remove document body from R2", {
        code: errorCode(error),
      });
    }
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
      await execute(connection, "select body_key,assignee from docs where id=?", [id])
    ).rows[0];
    if (!doc) return err(404, "Document not found.");
    doc.body = await readDocument(env.DOCS, doc.body_key);
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
      const inserted = await execute(
        connection,
        "insert into anns(doc_id,s,e,label,author) values(?,?,?,?,?)",
        [id, startOffset, endOffset, label, username],
      );
      return json({ ok: 1, id: String(inserted.insertId) });
    } catch (error) {
      if (isForeignKeyError(error)) return err(400, "Unknown label.");
      throw error;
    }
  }

  if (method === "DELETE" && parts.length === 4 && parts[2] === "anns") {
    const id = +parts[3];
    const annotation = (
      await execute(
        connection,
        "select a.doc_id,a.s,d.body_key,d.assignee from anns a join docs d on d.id=a.doc_id where a.id=?",
        [id],
      )
    ).rows[0];
    if (!annotation) return json({ ok: 1 });
    annotation.body = await readDocument(env.DOCS, annotation.body_key);
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
        "delete from import_chunks where username=? and datetime(created_at)<datetime('now','-1 day')",
        [username],
      );
    const key = importChunkKey(username, uploadId, index);
    const bytes = encoder.encode(chunk);
    const lineBreakCount = countLineBreaks(chunk);
    const startsWithLf = chunk.startsWith("\n") ? 1 : 0;
    const endsWithCr = chunk.endsWith("\r") ? 1 : 0;
    await env.DOCS.put(key, bytes, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
    try {
      await execute(
        connection,
        `insert into import_chunks(
           upload_id,username,chunk_index,byte_count,line_break_count,starts_with_lf,ends_with_cr
         ) values(?,?,?,?,?,?,?)
         on conflict(upload_id,username,chunk_index)
         do update set byte_count=excluded.byte_count,
           line_break_count=excluded.line_break_count,
           starts_with_lf=excluded.starts_with_lf,
           ends_with_cr=excluded.ends_with_cr,
           created_at=current_timestamp`,
        [
          uploadId,
          username,
          index,
          bytes.byteLength,
          lineBreakCount,
          startsWithLf,
          endsWithCr,
        ],
      );
    } catch (error) {
      await env.DOCS.delete(key);
      throw error;
    }
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
    let createdBodyKey;
    try {
      const found = await execute(
        connection,
        `select chunk_index,byte_count,line_break_count,starts_with_lf,ends_with_cr
         from import_chunks where upload_id=? and username=? order by chunk_index`,
        [uploadId, username],
      );
      const uploadChunks = found.rows;
      if (
        uploadChunks.length !== chunks ||
        uploadChunks.some((chunk, index) => Number(chunk.chunk_index) !== index)
      ) {
        await deleteImportChunks(connection, uploadId, username);
        await cleanupImportObjects(env.DOCS, username, uploadId, uploadChunks);
        return err(400, "The upload is incomplete. Please select the file again.");
      }
      const stats = importedDocumentStats(uploadChunks);
      createdBodyKey = `docs/${crypto.randomUUID()}`;
      await putImportedDocument(
        env.DOCS,
        createdBodyKey,
        username,
        uploadId,
        uploadChunks,
        stats.byteCount,
      );
      await connection.batch([
        connection
          .prepare(
            `insert into docs(title,body_key,byte_count,row_count,assignee,done,review,note)
             values(?,?,?,?,?,0,'','')`,
          )
          .bind(
            String(title || "Untitled").slice(0, 1000),
            createdBodyKey,
            stats.byteCount,
            stats.rowCount,
            isAdmin ? null : username,
          ),
        connection
          .prepare("delete from import_chunks where upload_id=? and username=?")
          .bind(uploadId, username),
      ]);
      try {
        await cleanupImportObjects(env.DOCS, username, uploadId, uploadChunks);
      } catch (cleanupError) {
        console.error("Failed to clean up imported R2 chunks", {
          code: errorCode(cleanupError),
        });
      }
      return json({ count: 1 });
    } catch (error) {
      if (createdBodyKey) await env.DOCS.delete(createdBodyKey);
      throw error;
    }
  }

  if (method === "POST" && parts.length === 3 && parts[2] === "import") {
    const { labels = [], docs = [] } = body;
    let count = 0;
    const bodyKeys = [];
    try {
      const statements = [];
      for (const label of labels)
        if (label.n && isAdmin)
          statements.push(
            connection
              .prepare("insert or ignore into labels(name,color) values(?,?)")
              .bind(label.n, label.c || "#888"),
          );
      for (const doc of docs) {
        if (typeof doc.text !== "string" || !doc.text) continue;
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
        const key = `docs/${crypto.randomUUID()}`;
        const stats = await storeDocument(env.DOCS, key, doc.text);
        bodyKeys.push(key);
        statements.push(
          connection
            .prepare(
              `insert into docs(title,body_key,byte_count,row_count,assignee,done,review,note)
               values(?,?,?,?,?,?, '','')`,
            )
            .bind(
              doc.title || "Untitled",
              stats.bodyKey,
              stats.byteCount,
              stats.rowCount,
              assignee || null,
              isAdmin && !!doc.done ? 1 : 0,
            ),
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
          statements.push(
            connection
              .prepare("insert or ignore into labels(name,color) values(?,'#888')")
              .bind(annotation.label),
            connection
              .prepare(
                `insert into anns(doc_id,s,e,label,author)
                 values((select id from docs where body_key=?),?,?,?,?)`,
              )
              .bind(
                key,
                annotation.start,
                annotation.end,
                annotation.label,
                annotation.by || null,
              ),
          );
        }
        count++;
      }
      if (statements.length) await connection.batch(statements);
      return json({ count });
    } catch (error) {
      if (bodyKeys.length) await env.DOCS.delete(bodyKeys);
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

      if (!env.DB) {
        console.error("Database health check failed: DB binding is missing");
        return withHeaders(err(503, "Database connection unavailable."));
      }

      try {
        const result = await execute(env.DB, "select 1 as ok");
        if (Number(result.rows[0]?.ok) !== 1)
          throw new Error("Health query returned an unexpected result");
        return withHeaders(json({ status: "ok" }));
      } catch (error) {
        console.error("Database health check failed", {
          code: errorCode(error),
        });
        return withHeaders(err(503, "Database connection unavailable."));
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
      if (!env.DB) {
        console.error("DB binding is required");
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
      const connection = env.DB;
      let loginStage = "database connection";
      try {
        loginStage = "user lookup";
        const { u, p } = body || {};
        const result = await execute(
          connection,
          "select username,pass,user_role as role from users where username=?",
          [u],
        );
        const record = result.rows[0];
        const password = typeof p === "string" ? p : "";
        loginStage = "password verification";
        let valid = record && (await verifyPassword(password, record.pass));
        if (!valid && record && isLegacyBcrypt(record.pass)) {
          loginStage = "legacy password verification";
          valid = await bcrypt.compare(password, record.pass);
        }
        if (!valid) {
          recent.push(now);
          loginHits.set(ip, recent);
          return withHeaders(err(401, "Wrong username or password."));
        }
        loginStage = "session creation";
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
        console.error("Login request failed", {
          stage: loginStage,
          code: errorCode(error),
        });
        return withHeaders(err(500, "Server error"));
      }
    }

    if (request.method === "POST" && url.pathname === "/api/logout")
      return withHeaders(json({ ok: 1 }, 200, clearedCookieHeaders()));

    if (!env.JWT_SECRET) {
      console.error("JWT_SECRET is required");
      return withHeaders(err(500, "Server error"));
    }
    if (!env.DB || !env.DOCS) {
      console.error("DB and DOCS bindings are required");
      return withHeaders(err(500, "Server error"));
    }
    const token = await verifyToken(decodeCookie(request, "sid"), env.JWT_SECRET);
    if (!token) return withHeaders(err(401, "Please sign in again."));

    let stage = "current user lookup";
    try {
      const currentUser = (
        await execute(
          env.DB,
          "select username,user_role as role from users where username=?",
          [token.u],
        )
      ).rows[0];
      if (!currentUser) return withHeaders(err(401, "Please sign in again."));
      const response = await handleApi(
        request,
        env,
        env.DB,
        body,
        { u: currentUser.username, role: currentUser.role },
        (nextStage) => {
          stage = nextStage;
        },
      );
      return withHeaders(response);
    } catch (error) {
      console.error("API request failed", { stage, code: errorCode(error) });
      return withHeaders(err(500, "Server error"));
    }
  },
};

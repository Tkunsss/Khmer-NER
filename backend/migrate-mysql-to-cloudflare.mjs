import { createConnection } from "mysql2/promise";
import { mkdir, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(process.argv[2] || "cloudflare-migration");
const databaseName = process.env.D1_DATABASE_NAME || "khmer-ner";
const bucketName = process.env.R2_BUCKET_NAME || "khmer-ner-documents";

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to the source MySQL connection URI.");
  process.exit(1);
}
if (!/^[a-z0-9-]+$/i.test(databaseName) || !/^[a-z0-9-]+$/i.test(bucketName)) {
  console.error("D1_DATABASE_NAME and R2_BUCKET_NAME may contain only letters, digits, and hyphens.");
  process.exit(1);
}

let sourceUrl;
try {
  sourceUrl = new URL(process.env.DATABASE_URL);
} catch {
  console.error("DATABASE_URL must be a valid MySQL connection URI.");
  process.exit(1);
}
if (sourceUrl.protocol !== "mysql:") {
  console.error("DATABASE_URL must use the mysql:// scheme.");
  process.exit(1);
}

const caPath = process.env.MYSQL_CA_PATH || path.join(backendDir, "aiven-ca.pem");
const ca = process.env.MYSQL_CA
  ? process.env.MYSQL_CA.replace(/\\n/g, "\n")
  : await readFile(caPath, "utf8");
const connection = await createConnection({
  host: sourceUrl.hostname,
  port: Number(sourceUrl.port || 3306),
  user: decodeURIComponent(sourceUrl.username),
  password: decodeURIComponent(sourceUrl.password),
  database: decodeURIComponent(sourceUrl.pathname.slice(1)),
  charset: "utf8mb4",
  ssl: { ca, rejectUnauthorized: true },
});

const quote = (value) => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (String(value).includes("\0"))
    throw new Error("NUL characters cannot be exported to D1 SQL literals.");
  return `'${String(value).replace(/'/g, "''")}'`;
};

function rowCount(text) {
  let count = 1;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\r") {
      count++;
      if (text[index + 1] === "\n") index++;
    } else if (text[index] === "\n") {
      count++;
    }
  }
  return count;
}

async function query(sql) {
  const [rows] = await connection.execute(sql);
  return rows;
}

try {
  await mkdir(outputDir, { recursive: false });
  const objectsDir = path.join(outputDir, "objects");
  await mkdir(objectsDir);
  const statements = [];
  const uploadCommands = [];

  const users = await query("select username,pass,user_role from users order by username");
  for (const user of users)
    statements.push(
      `insert into users(username,pass,user_role) values(${quote(user.username)},${quote(user.pass)},${quote(user.user_role)});`,
    );

  const labels = await query("select name,color from labels order by name");
  for (const label of labels)
    statements.push(
      `insert into labels(name,color) values(${quote(label.name)},${quote(label.color)});`,
    );

  const docs = await query(
    "select id,title,body,assignee,done,review,note from docs order by id",
  );
  for (const doc of docs) {
    const body = String(doc.body ?? "");
    const key = `docs/${doc.id}`;
    const objectFile = path.join(objectsDir, `${doc.id}.txt`);
    await writeFile(objectFile, body, "utf8");
    uploadCommands.push(
      `npx wrangler r2 object put ${bucketName}/${key} --file "$PSScriptRoot${path.sep}objects${path.sep}${doc.id}.txt" --remote --content-type 'text/plain; charset=utf-8'`,
      "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
    );
    statements.push(
      `insert into docs(id,title,body_key,byte_count,row_count,assignee,done,review,note) values(${quote(doc.id)},${quote(doc.title)},${quote(key)},${Buffer.byteLength(body, "utf8")},${rowCount(body)},${quote(doc.assignee)},${doc.done ? 1 : 0},${quote(doc.review)},${quote(doc.note)});`,
    );
  }

  for (const [table, columns, order] of [
    ["doc_assignments", "doc_id,username", "doc_id,username"],
    ["row_assignments", "doc_id,username,row_start,row_end", "doc_id,username,row_start"],
    ["anns", "id,doc_id,s,e,label,author", "id"],
  ]) {
    const rows = await query(`select ${columns} from ${table} order by ${order}`);
    for (const row of rows) {
      const values = columns.split(",").map((column) => quote(row[column]));
      statements.push(`insert into ${table}(${columns}) values(${values.join(",")});`);
    }
  }

  const sqlDir = path.join(outputDir, "sql");
  await mkdir(sqlDir);
  let batch = [];
  let batchBytes = 0;
  let batchNumber = 1;
  for (const statement of statements) {
    const size = Buffer.byteLength(statement, "utf8");
    if (size > 80_000) throw new Error("A migration statement exceeds the D1 SQL statement limit.");
    if (batch.length && batchBytes + size > 80_000) {
      await writeFile(path.join(sqlDir, `data-${String(batchNumber++).padStart(3, "0")}.sql`), batch.join("\n"), "utf8");
      batch = [];
      batchBytes = 0;
    }
    batch.push(statement);
    batchBytes += size;
  }
  if (batch.length)
    await writeFile(path.join(sqlDir, `data-${String(batchNumber).padStart(3, "0")}.sql`), batch.join("\n"), "utf8");

  const dataCommands = Array.from({ length: batchNumber }, (_, index) => {
    const file = `$PSScriptRoot${path.sep}sql${path.sep}data-${String(index + 1).padStart(3, "0")}.sql`;
    return `npx wrangler d1 execute ${databaseName} --remote --file "${file}"\nif ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`;
  });
  await writeFile(
    path.join(outputDir, "apply-migration.ps1"),
    [
      "$ErrorActionPreference = 'Stop'",
      "Set-Location (Split-Path $PSScriptRoot -Parent)",
      ...uploadCommands,
      ...dataCommands,
    ].join("\n"),
    "utf8",
  );
  console.log(`Exported ${users.length} users, ${labels.length} labels, ${docs.length} documents, and their assignments/annotations.`);
  console.log(`Review the files in ${outputDir}, then run .\\apply-migration.ps1 from that directory.`);
} finally {
  await connection.end();
}

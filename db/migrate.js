/**
 * Creates all MySQL tables and seeds site_config from public/data/site.json.
 * Run on your PC after cloning, or once on Railway (see DEPLOY.md).
 *
 * Usage: npm run db:migrate
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

function poolConfig() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  return {
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD || "",
    database: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQLPORT) || 3306,
    ssl: process.env.MYSQL_SSL_DISABLE === "1" ? false : { rejectUnauthorized: false },
  };
}

async function main() {
  const cfg = poolConfig();
  if (!process.env.DATABASE_URL && !process.env.MYSQLHOST) {
    console.error("Missing database config. Set DATABASE_URL or MYSQLHOST / MYSQLUSER / MYSQLDATABASE on Railway.");
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, "schema.sql");
  let sql = fs.readFileSync(schemaPath, "utf8");
  sql = sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length);

  const conn = await mysql.createConnection(cfg);
  console.log("Connected. Creating tables…");
  for (const st of statements) {
    await conn.query(st);
  }

  const [rows] = await conn.query("SELECT COUNT(*) AS c FROM site_config WHERE id = 1");
  if (rows[0].c === 0) {
    const sitePath = path.join(__dirname, "..", "public", "data", "site.json");
    const json = fs.readFileSync(sitePath, "utf8");
    await conn.query("INSERT INTO site_config (id, json_data) VALUES (1, ?)", [json]);
    console.log("Seeded site_config from public/data/site.json");
  } else {
    console.log("site_config already has row id=1 — skipped seed.");
  }

  await conn.end();
  console.log("Done. You can start the API: npm start");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

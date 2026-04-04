const mysql = require("mysql2/promise");

const MAX_EVENTS = 20000;
const MAX_ADMISSIONS = 5000;
const MAX_CHAT = 8000;

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

let pool;

function getPool() {
  if (!pool) {
    const cfg = poolConfig();
    // Never spread a string: { ..."mysql://..." } becomes {0:"m",1:"y",...} and breaks mysql2 (ECONNREFUSED).
    if (typeof cfg === "string") {
      pool = mysql.createPool(cfg);
    } else {
      pool = mysql.createPool({
        ...cfg,
        waitForConnections: true,
        connectionLimit: 10,
      });
    }
  }
  return pool;
}

function iso(d) {
  if (!d) return new Date().toISOString();
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

/** MySQL DATETIME(3) rejects ISO `2026-04-04T23:05:23.981Z`; use space and no Z. */
function toMysqlAt(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 23).replace("T", " ");
  }
  return d.toISOString().slice(0, 23).replace("T", " ");
}

function rowAnalytics(r) {
  let payload = r.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload || "{}");
    } catch {
      payload = {};
    }
  }
  return {
    id: r.id,
    at: iso(r.at),
    type: r.type,
    sessionId: r.session_id,
    section: r.section,
    payload: payload && typeof payload === "object" ? payload : {},
    ip: r.ip || "",
    ua: r.ua || "",
  };
}

function rowAdmission(r) {
  return {
    id: r.id,
    at: iso(r.at),
    source: r.source,
    sessionId: r.session_id || "",
    fullName: r.full_name || "",
    email: r.email || "",
    dob: r.dob || "",
    stream: r.stream || "",
    branch: r.branch || "",
    phone: r.phone || "",
    city: r.city || "",
    district: r.district || "",
    name: r.name || "",
  };
}

function rowPartial(r) {
  let fields = r.fields;
  if (typeof fields === "string") {
    try {
      fields = JSON.parse(fields || "{}");
    } catch {
      fields = {};
    }
  }
  return {
    id: r.id,
    at: iso(r.at),
    sessionId: r.session_id,
    completionPercent: r.completion_percent,
    page: r.page || "admissions",
    fields: fields && typeof fields === "object" ? fields : {},
  };
}

function rowChat(r) {
  return {
    id: r.id,
    at: iso(r.at),
    sessionId: r.session_id,
    role: r.role,
    body: r.body,
    pageUrl: r.page_url || "",
    readByAdmin: Boolean(r.read_by_admin),
  };
}

/** Add page_url column for existing databases (safe to run every startup). */
async function ensureMysqlSchemaPatches() {
  const p = getPool();
  const [rows] = await p.query(
    "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_messages' AND COLUMN_NAME = 'page_url'"
  );
  if (Number(rows[0].c) > 0) return;
  await p.query(
    "ALTER TABLE chat_messages ADD COLUMN page_url VARCHAR(512) NOT NULL DEFAULT '' AFTER body"
  );
  console.log("MySQL: added chat_messages.page_url (visitor page URL).");
}

const TRIM_TABLES = new Set(["analytics_events", "admissions", "admissions_partial", "chat_messages"]);

/**
 * Remove oldest rows when count > max. Uses a numeric LIMIT in SQL (not a prepared ?)
 * because MySQL often rejects LIMIT ? inside DELETE subqueries.
 */
async function trimOldest(table, max) {
  if (!TRIM_TABLES.has(table)) {
    console.error("trimOldest: unknown table", table);
    return;
  }
  const p = getPool();
  const [c] = await p.execute(`SELECT COUNT(*) AS n FROM \`${table}\``);
  const n = Number(c[0].n) || 0;
  const excess = n - max;
  if (excess <= 0) return;
  const lim = Math.min(Math.max(1, excess), 50000);
  await p.query(
    `DELETE FROM \`${table}\` WHERE id IN (SELECT id FROM (SELECT id FROM \`${table}\` ORDER BY at ASC, id ASC LIMIT ${lim}) t)`
  );
}

async function readSite() {
  const [rows] = await getPool().execute("SELECT json_data FROM site_config WHERE id = 1 LIMIT 1");
  if (!rows.length) return {};
  let raw = rows[0].json_data;
  if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");
  if (raw != null && typeof raw === "object") return raw;
  return JSON.parse(String(raw || "{}"));
}

async function writeSite(obj) {
  const json = JSON.stringify(obj, null, 2);
  const p = getPool();
  const [result] = await p.execute(
    "UPDATE site_config SET json_data = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = 1",
    [json]
  );
  const affected = result && typeof result.affectedRows === "number" ? result.affectedRows : 0;
  if (affected === 0) {
    await p.execute("INSERT INTO site_config (id, json_data) VALUES (1, ?)", [json]);
  }
}

async function appendAnalytics(row) {
  const p = getPool();
  await p.execute(
    `INSERT INTO analytics_events (id, at, type, session_id, section, payload, ip, ua)
     VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)`,
    [
      row.id,
      toMysqlAt(row.at),
      row.type,
      row.sessionId,
      row.section,
      JSON.stringify(row.payload || {}),
      row.ip || "",
      row.ua || "",
    ]
  );
  await trimOldest("analytics_events", MAX_EVENTS);
}

async function listAnalyticsAll() {
  const [rows] = await getPool().execute(
    "SELECT id, at, type, session_id, section, payload, ip, ua FROM analytics_events ORDER BY at ASC, id ASC"
  );
  return rows.map(rowAnalytics);
}

/** Last N events (newest first in SQL, returned chronological) — avoids loading huge tables for admin dashboard. */
async function listAnalyticsTail(n) {
  const lim = Math.min(10000, Math.max(1, parseInt(String(n), 10) || 2500));
  const [rows] = await getPool().execute(
    "SELECT id, at, type, session_id, section, payload, ip, ua FROM analytics_events ORDER BY at DESC, id DESC LIMIT ?",
    [lim]
  );
  const mapped = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    try {
      mapped.push(rowAnalytics(rows[i]));
    } catch (e) {
      console.error("listAnalyticsTail row", e);
    }
  }
  return mapped;
}

async function appendAdmission(row) {
  const p = getPool();
  await p.execute(
    `INSERT INTO admissions (id, at, source, session_id, full_name, email, dob, stream, branch, phone, city, district, name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      toMysqlAt(row.at),
      row.source,
      row.sessionId || "",
      row.fullName || "",
      row.email || "",
      row.dob || "",
      row.stream || "",
      row.branch || "",
      row.phone || "",
      row.city || "",
      row.district || "",
      row.name || "",
    ]
  );
  await trimOldest("admissions", MAX_ADMISSIONS);
}

async function listAdmissionsAll() {
  const [rows] = await getPool().execute(
    "SELECT id, at, source, session_id, full_name, email, dob, stream, branch, phone, city, district, name FROM admissions ORDER BY at ASC, id ASC"
  );
  return rows.map(rowAdmission);
}

async function listAdmissionsTail(n) {
  const lim = Math.min(10000, Math.max(1, parseInt(String(n), 10) || 500));
  const [rows] = await getPool().execute(
    "SELECT id, at, source, session_id, full_name, email, dob, stream, branch, phone, city, district, name FROM admissions ORDER BY at DESC, id DESC LIMIT ?",
    [lim]
  );
  const mapped = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    try {
      mapped.push(rowAdmission(rows[i]));
    } catch (e) {
      console.error("listAdmissionsTail row", e);
    }
  }
  return mapped;
}

async function appendPartial(row) {
  const p = getPool();
  await p.execute(
    `INSERT INTO admissions_partial (id, at, session_id, completion_percent, page, fields)
     VALUES (?, ?, ?, ?, ?, CAST(? AS JSON))`,
    [
      row.id,
      toMysqlAt(row.at),
      row.sessionId,
      row.completionPercent,
      row.page || "admissions",
      JSON.stringify(row.fields || {}),
    ]
  );
  await trimOldest("admissions_partial", MAX_ADMISSIONS * 3);
}

async function listPartialsAll() {
  const [rows] = await getPool().execute(
    "SELECT id, at, session_id, completion_percent, page, fields FROM admissions_partial ORDER BY at ASC, id ASC"
  );
  return rows.map(rowPartial);
}

async function listPartialsTail(n) {
  const lim = Math.min(15000, Math.max(1, parseInt(String(n), 10) || 1500));
  const [rows] = await getPool().execute(
    "SELECT id, at, session_id, completion_percent, page, fields FROM admissions_partial ORDER BY at DESC, id DESC LIMIT ?",
    [lim]
  );
  const mapped = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    try {
      mapped.push(rowPartial(rows[i]));
    } catch (e) {
      console.error("listPartialsTail row", e);
    }
  }
  return mapped;
}

async function countChatUnread() {
  const [rows] = await getPool().execute(
    "SELECT COUNT(*) AS c FROM chat_messages WHERE role = 'visitor' AND read_by_admin = 0"
  );
  return Number(rows[0].c) || 0;
}

async function listChatAll() {
  const [rows] = await getPool().execute(
    "SELECT id, at, session_id, role, body, page_url, read_by_admin FROM chat_messages ORDER BY at ASC, id ASC"
  );
  return rows.map(rowChat);
}

async function appendChat(row) {
  const p = getPool();
  const pageUrl = String(row.pageUrl || "").slice(0, 512);
  await p.execute(
    `INSERT INTO chat_messages (id, at, session_id, role, body, page_url, read_by_admin)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      toMysqlAt(row.at),
      row.sessionId,
      row.role,
      row.body,
      pageUrl,
      row.readByAdmin ? 1 : 0,
    ]
  );
  await trimOldest("chat_messages", MAX_CHAT);
}

async function replaceChatAll(list) {
  const p = getPool();
  await p.execute("DELETE FROM chat_messages");
  for (const m of list) {
    await p.execute(
      `INSERT INTO chat_messages (id, at, session_id, role, body, page_url, read_by_admin) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        m.id,
        toMysqlAt(m.at),
        m.sessionId,
        m.role,
        m.body,
        String(m.pageUrl || "").slice(0, 512),
        m.readByAdmin ? 1 : 0,
      ]
    );
  }
}

async function markChatVisitorRead(sessionId) {
  await getPool().execute(
    "UPDATE chat_messages SET read_by_admin = 1 WHERE session_id = ? AND role = 'visitor'",
    [sessionId]
  );
}

async function clearChat() {
  await getPool().execute("DELETE FROM chat_messages");
}

async function maybeWipeChatOnStart() {
  if (process.env.WIPE_CHAT_ON_RESTART === "1") {
    await clearChat();
    console.log("WIPE_CHAT_ON_RESTART=1: chat history cleared on startup.");
  }
}

module.exports = {
  readSite,
  writeSite,
  appendAnalytics,
  listAnalyticsAll,
  listAnalyticsTail,
  appendAdmission,
  listAdmissionsAll,
  listAdmissionsTail,
  appendPartial,
  listPartialsAll,
  listPartialsTail,
  countChatUnread,
  listChatAll,
  appendChat,
  replaceChatAll,
  markChatVisitorRead,
  clearChat,
  maybeWipeChatOnStart,
  getPool,
  ensureMysqlSchemaPatches,
};

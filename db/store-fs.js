const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_FILE = path.join(ROOT, "public", "data", "site.json");
const ANALYTICS_FILE = path.join(ROOT, "data", "analytics-events.json");
const ADMISSIONS_FILE = path.join(ROOT, "data", "admissions-full.json");
const PARTIAL_FILE = path.join(ROOT, "data", "admissions-partial.json");
const CHAT_FILE = path.join(ROOT, "data", "chat-messages.json");

const MAX_EVENTS = 20000;
const MAX_ADMISSIONS = 5000;
const MAX_CHAT = 8000;

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

function ensureDataFiles() {
  fs.mkdirSync(path.dirname(ANALYTICS_FILE), { recursive: true });
  if (!fs.existsSync(ANALYTICS_FILE)) fs.writeFileSync(ANALYTICS_FILE, "[]", "utf8");
  if (!fs.existsSync(ADMISSIONS_FILE)) fs.writeFileSync(ADMISSIONS_FILE, "[]", "utf8");
  if (!fs.existsSync(PARTIAL_FILE)) fs.writeFileSync(PARTIAL_FILE, "[]", "utf8");
  if (!fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, "[]", "utf8");
}

ensureDataFiles();

async function readSite() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

async function writeSite(obj) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), "utf8");
}

async function appendAnalytics(row) {
  let list = readJson(ANALYTICS_FILE, []);
  if (!Array.isArray(list)) list = [];
  list.push(row);
  if (list.length > MAX_EVENTS) list = list.slice(-MAX_EVENTS);
  writeJson(ANALYTICS_FILE, list);
}

async function listAnalyticsAll() {
  const list = readJson(ANALYTICS_FILE, []);
  return Array.isArray(list) ? list : [];
}

async function appendAdmission(row) {
  let list = readJson(ADMISSIONS_FILE, []);
  if (!Array.isArray(list)) list = [];
  list.push(row);
  if (list.length > MAX_ADMISSIONS) list = list.slice(-MAX_ADMISSIONS);
  writeJson(ADMISSIONS_FILE, list);
}

async function listAdmissionsAll() {
  const list = readJson(ADMISSIONS_FILE, []);
  return Array.isArray(list) ? list : [];
}

async function appendPartial(row) {
  let list = readJson(PARTIAL_FILE, []);
  if (!Array.isArray(list)) list = [];
  list.push(row);
  if (list.length > MAX_ADMISSIONS * 3) list = list.slice(-MAX_ADMISSIONS * 3);
  writeJson(PARTIAL_FILE, list);
}

async function listPartialsAll() {
  const list = readJson(PARTIAL_FILE, []);
  return Array.isArray(list) ? list : [];
}

async function listAnalyticsTail(n) {
  const list = await listAnalyticsAll();
  const lim = Math.min(10000, Math.max(1, Number(n) || 2500));
  return list.slice(-lim);
}

async function listAdmissionsTail(n) {
  const list = await listAdmissionsAll();
  const lim = Math.min(10000, Math.max(1, Number(n) || 500));
  return list.slice(-lim);
}

async function listPartialsTail(n) {
  const list = await listPartialsAll();
  const lim = Math.min(15000, Math.max(1, Number(n) || 1500));
  return list.slice(-lim);
}

async function countChatUnread() {
  const list = await listChatAll();
  return list.filter((m) => m.role === "visitor" && !m.readByAdmin).length;
}

async function listChatAll() {
  const list = readJson(CHAT_FILE, []);
  return Array.isArray(list) ? list : [];
}

async function appendChat(row) {
  let list = await listChatAll();
  list.push(row);
  if (list.length > MAX_CHAT) list = list.slice(-MAX_CHAT);
  writeJson(CHAT_FILE, list);
}

async function replaceChatAll(list) {
  writeJson(CHAT_FILE, list);
}

async function markChatVisitorRead(sessionId) {
  let all = await listChatAll();
  all = all.map((m) => {
    if (m.sessionId === sessionId && m.role === "visitor") return { ...m, readByAdmin: true };
    return m;
  });
  await replaceChatAll(all);
}

async function clearChat() {
  writeJson(CHAT_FILE, []);
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
  async maybeWipeChatOnStart() {
    if (process.env.WIPE_CHAT_ON_RESTART === "1") {
      writeJson(CHAT_FILE, []);
      console.log("WIPE_CHAT_ON_RESTART=1: chat history cleared on startup.");
    }
  },
};

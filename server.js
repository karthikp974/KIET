const path = require("path");
const fs = require("fs");
const express = require("express");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const store = require("./db");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
/** Persistent disk for uploads (set on Railway: mount a volume and set UPLOADS_DIR=/data/uploads). */
const UPLOADS =
  process.env.UPLOADS_DIR && String(process.env.UPLOADS_DIR).trim()
    ? path.resolve(String(process.env.UPLOADS_DIR).trim())
    : path.join(PUBLIC, "uploads");

const PORT = Number(process.env.PORT) || 3750;
const COOKIE_SECRET = process.env.COOKIE_SECRET || "change-this-in-production";
const ADMIN_PASSWORD_LEGACY = process.env.ADMIN_PASSWORD || "kiet-admin";
const ADMIN_PASSWORD_FULL = process.env.ADMIN_PASSWORD_FULL || "Adminkie";
const ADMIN_PASSWORD_VISI = process.env.ADMIN_PASSWORD_VISI || "Adminvisi";

fs.mkdirSync(UPLOADS, { recursive: true });

const UPLOAD_TARGET_BYTES = 100 * 1024;

/**
 * Admin uploads → JPEG, EXIF rotation applied, tuned to stay near UPLOAD_TARGET_BYTES (~100KB) for faster loads.
 * Shrinks quality and longest edge until under target (or min quality / min edge).
 * Output is always `stem.jpg`. Skips GIF (animation) and SVG.
 */
async function optimizeRasterUpload(absPath, mimetype) {
  if (!mimetype || !String(mimetype).startsWith("image/")) return null;
  if (mimetype === "image/gif" || mimetype === "image/svg+xml") return null;
  let sharpLib;
  try {
    sharpLib = require("sharp");
  } catch (e) {
    console.warn("sharp not installed; skipping image optimization");
    return null;
  }
  const ext = path.extname(absPath);
  const dir = path.dirname(absPath);
  const stem = path.basename(absPath, ext);
  const outPath = path.join(dir, stem + ".jpg");
  const tmpPath = path.join(dir, stem + ".opt-" + Date.now() + ".jpg");
  try {
    const meta = await sharpLib(absPath).metadata();
    const hasAlpha = !!meta.hasAlpha;
    const target = UPLOAD_TARGET_BYTES;
    let maxEdge = 2048;
    let quality = 82;
    let buf = null;

    for (let attempt = 0; attempt < 36; attempt++) {
      let img = sharpLib(absPath).rotate().resize(maxEdge, maxEdge, {
        fit: "inside",
        withoutEnlargement: true,
      });
      if (hasAlpha) {
        img = img.flatten({ background: { r: 255, g: 255, b: 255 } });
      }
      buf = await img
        .jpeg({
          quality,
          mozjpeg: true,
          chromaSubsampling: "4:2:0",
        })
        .toBuffer();
      if (buf.length <= target) break;
      if (quality > 44) {
        quality -= 7;
      } else if (maxEdge > 400) {
        maxEdge = Math.max(400, Math.floor(maxEdge * 0.72));
        quality = Math.min(quality + 4, 78);
      } else {
        quality = Math.max(28, quality - 5);
      }
    }

    await fs.promises.writeFile(tmpPath, buf);
    await fs.promises.unlink(absPath).catch(() => {});
    await fs.promises.rename(tmpPath, outPath);
    return outPath;
  } catch (e) {
    console.error("optimizeRasterUpload", e && e.message ? e.message : e);
    await fs.promises.unlink(tmpPath).catch(() => {});
    return null;
  }
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "") || "";
    const base = "f-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    cb(null, base + ext.toLowerCase());
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
});

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "16mb" }));
app.use(cookieParser(COOKIE_SECRET));

function csvEscapeCell(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function tableToCsv(headers, rows) {
  const lines = [headers.map(csvEscapeCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscapeCell).join(","));
  }
  return "\uFEFF" + lines.join("\n");
}

async function buildVisitorsSummary() {
  const events = await store.listAnalyticsAll();
  const by = {};
  for (const e of events) {
    const sid = e.sessionId || "unknown";
    if (!by[sid]) by[sid] = { last: e.at || "", sections: {} };
    if (e.at && String(e.at) > String(by[sid].last)) by[sid].last = e.at;
    if (e.type === "section_view" && e.section) by[sid].sections[e.section] = true;
    if (e.type === "route" && e.section) by[sid].sections[`page:${e.section}`] = true;
  }
  const sorted = Object.keys(by).sort((a, b) => String(by[b].last || "").localeCompare(String(by[a].last || "")));
  const rows = sorted.map((sid) => {
    const seen = Object.keys(by[sid].sections).sort().join(", ");
    return [by[sid].last, seen || "—"];
  });
  const jsonArray = sorted.map((sid) => ({
    lastVisit: by[sid].last,
    pagesAndSectionsSeen: Object.keys(by[sid].sections).sort().join(", ") || "—",
  }));
  return {
    table: {
      title: "Visitors — last visit and pages seen",
      headers: ["lastVisit", "pagesAndSectionsSeen"],
      rows,
      base: "visitors-summary",
    },
    jsonArray,
  };
}

async function getExportTable(kind) {
  if (kind === "analytics") {
    return (await buildVisitorsSummary()).table;
  }
  if (kind === "admissions-page") {
    const list = (await store.listAdmissionsAll()).filter((x) => x.source === "admissions_page");
    const headers = ["id", "at", "fullName", "email", "phone", "dob", "stream", "branch", "city", "district"];
    const rows = list.map((x) => headers.map((h) => x[h] ?? ""));
    return { title: "Admissions page — completed submits", headers, rows, base: "admissions-page-submits" };
  }
  if (kind === "admissions-partial") {
    const list = await store.listPartialsAll();
    const headers = [
      "when",
      "email",
      "phone",
      "fullName",
      "completionPercent",
      "stream",
      "branch",
      "city",
      "district",
    ];
    const rows = list.map((x) => {
      const f = x.fields || {};
      return [
        x.at,
        f.email ?? "",
        f.phone ?? "",
        f.fullName ?? "",
        x.completionPercent,
        f.stream ?? "",
        f.branch ?? "",
        f.city ?? "",
        f.district ?? "",
      ];
    });
    return { title: "Admissions — partial progress", headers, rows, base: "admissions-partial" };
  }
  if (kind === "apply-leads") {
    const list = (await store.listAdmissionsAll()).filter((x) => x.source === "program_apply");
    const headers = ["id", "at", "name", "phone", "email", "dob", "branch", "stream"];
    const rows = list.map((x) => headers.map((h) => x[h] ?? ""));
    return { title: "Program Apply now leads", headers, rows, base: "program-apply-leads" };
  }
  return null;
}

function sendExportPdf(res, { title, headers, rows, base }) {
  const filename = `${base}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);
  doc.fontSize(14).text(title, { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor("#555").text(`Rows: ${rows.length} · ${new Date().toISOString()}`);
  doc.moveDown(0.6);
  doc.fillColor("#000");
  const maxRows = Math.min(rows.length, 450);
  const compact = headers.length <= 2;
  for (let i = 0; i < maxRows; i++) {
    const r = rows[i];
    if (compact) {
      doc.fontSize(7).fillColor("#555").text("Last visit: " + String(r[0] ?? ""));
      doc.moveDown(0.2);
      doc.fontSize(7).text("Pages / sections seen:");
      doc.fontSize(8).fillColor("#111").text(String(r[1] ?? ""), { width: 515, lineGap: 1.5 });
      doc.fillColor("#000").moveDown(0.45);
    } else {
      headers.forEach((h, j) => {
        const val = String(r[j] ?? "").slice(0, 400);
        doc.fontSize(7).text(`${h}: ${val}`, { width: 515, lineGap: 0.5 });
      });
      doc.moveDown(0.25);
    }
    if (doc.y > 760) doc.addPage();
  }
  if (rows.length > maxRows) {
    doc.moveDown(0.5);
    doc.fontSize(9).text(`… ${rows.length - maxRows} more rows — use CSV or JSON for the full export.`);
  }
  doc.end();
}

function getRole(req) {
  const r = req.signedCookies.kiet_role;
  if (r === "full" || r === "visi") return r;
  return null;
}

function requireFullAdmin(req, res, next) {
  if (getRole(req) === "full") return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function requireAnyAdmin(req, res, next) {
  const role = getRole(req);
  if (role === "full" || role === "visi") return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function resolveLoginPassword(password) {
  if (!password || typeof password !== "string") return null;
  const raw = password.trim();
  const lower = raw.toLowerCase();
  if (lower === String(ADMIN_PASSWORD_VISI).toLowerCase() || lower === "adminvisi") return "visi";
  if (
    lower === String(ADMIN_PASSWORD_FULL).toLowerCase() ||
    lower === "adminkie" ||
    raw === ADMIN_PASSWORD_LEGACY
  )
    return "full";
  return null;
}

const publicCors = process.env.PUBLIC_SITE_ORIGIN;
if (publicCors) {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      res.setHeader("Access-Control-Allow-Origin", publicCors);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") return res.sendStatus(204);
    }
    next();
  });
}

app.post("/api/login", (req, res) => {
  const rawPwd = req.body && typeof req.body.password === "string" ? req.body.password.trim() : "";
  const role = resolveLoginPassword(rawPwd);
  if (!role) {
    return res.status(401).json({ error: "Wrong password" });
  }
  const secure = process.env.NODE_ENV === "production" || !!publicCors;
  res.cookie("kiet_role", role, {
    httpOnly: true,
    signed: true,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: publicCors ? "none" : "lax",
    secure,
  });
  return res.json({ ok: true, role });
});

app.post("/api/logout", (req, res) => {
  const secure = process.env.NODE_ENV === "production" || !!publicCors;
  res.clearCookie("kiet_role", {
    signed: true,
    path: "/",
    sameSite: publicCors ? "none" : "lax",
    secure,
  });
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const role = getRole(req);
  res.json({ ok: !!role, role: role || null });
});

/** Defaults from repo when DB lists are empty (accidental save). */
let bundledProgramStreams = [];
let bundledIndustryMOU = [];
try {
  const rawBundled = fs.readFileSync(path.join(PUBLIC, "data", "site.json"), "utf8");
  const bundledSite = JSON.parse(rawBundled);
  if (Array.isArray(bundledSite.programStreams) && bundledSite.programStreams.length) {
    bundledProgramStreams = bundledSite.programStreams;
  }
  if (Array.isArray(bundledSite.industryMOU) && bundledSite.industryMOU.length) {
    bundledIndustryMOU = bundledSite.industryMOU;
  }
} catch (e) {
  console.warn("Bundled site.json defaults not loaded:", e && e.message ? e.message : e);
}

/** Avoid blank public pages when site JSON lists are stored as wrong type (e.g. programStreams as {}). */
function sanitizeSiteForClient(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const listKeys = [
    "programStreams",
    "campusSpotlight",
    "placements",
    "industryMOU",
    "visionaries",
    "clubs",
    "difference",
  ];
  const o = { ...data };
  for (const k of listKeys) {
    if (o[k] != null && !Array.isArray(o[k])) o[k] = [];
  }
  if (!Array.isArray(o.programStreams) || o.programStreams.length === 0) {
    if (bundledProgramStreams.length) {
      o.programStreams = JSON.parse(JSON.stringify(bundledProgramStreams));
    }
  }
  if (!Array.isArray(o.industryMOU) || o.industryMOU.length === 0) {
    if (bundledIndustryMOU.length) {
      o.industryMOU = JSON.parse(JSON.stringify(bundledIndustryMOU));
    }
  }
  return o;
}

app.get("/api/site", async (req, res) => {
  try {
    res.json(sanitizeSiteForClient(await store.readSite()));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server" });
  }
});

app.put("/api/site", requireFullAdmin, async (req, res) => {
  try {
    const body = req.body;
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Invalid body: need a JSON object" });
    }
    if (body.programStreams != null && !Array.isArray(body.programStreams)) {
      return res.status(400).json({ error: "programStreams must be a JSON array [...]" });
    }
    await store.writeSite(body);
    res.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/site", e);
    const msg = e && e.message ? String(e.message).slice(0, 300) : "server";
    res.status(500).json({ error: msg });
  }
});

app.post("/api/upload", requireFullAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  let filename = req.file.filename;
  try {
    const optimized = await optimizeRasterUpload(req.file.path, req.file.mimetype);
    if (optimized) filename = path.basename(optimized);
  } catch (e) {
    console.error("upload optimize", e);
  }
  const url = "/uploads/" + filename;
  res.json({ ok: true, url, filename });
});

app.post("/api/analytics", async (req, res) => {
  try {
    const b = req.body || {};
    const row = {
      id: "a-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      at: new Date().toISOString(),
      type: String(b.type || "event").slice(0, 64),
      sessionId: String(b.sessionId || "").slice(0, 120),
      section: String(b.section || "").slice(0, 64),
      payload: typeof b.payload === "object" && b.payload ? b.payload : {},
      ip: req.ip || "",
      ua: String(req.headers["user-agent"] || "").slice(0, 400),
    };
    await store.appendAnalytics(row);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server" });
  }
});

app.post("/api/admissions/full", async (req, res) => {
  try {
    const b = req.body || {};
    const row = {
      id: "adm-" + Date.now(),
      at: new Date().toISOString(),
      sessionId: String(b.sessionId || ""),
      fullName: String(b.fullName || "").trim(),
      email: String(b.email || "").trim(),
      dob: String(b.dob || "").trim(),
      stream: String(b.stream || "").trim(),
      branch: String(b.branch || "").trim(),
      phone: String(b.phone || "").trim(),
      city: String(b.city || "").trim(),
      district: String(b.district || "").trim(),
      source: "admissions_page",
    };
    await store.appendAdmission(row);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server" });
  }
});

app.post("/api/admissions/partial", async (req, res) => {
  try {
    const b = req.body || {};
    const sessionId = String(b.sessionId || "");
    if (!sessionId) return res.status(400).json({ error: "session" });
    const row = {
      id: "par-" + Date.now(),
      at: new Date().toISOString(),
      sessionId,
      completionPercent: Math.min(100, Math.max(0, Number(b.completionPercent) || 0)),
      fields: typeof b.fields === "object" && b.fields ? b.fields : {},
      page: String(b.page || "admissions"),
    };
    await store.appendPartial(row);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server" });
  }
});

app.post("/api/apply-branch", async (req, res) => {
  try {
    const b = req.body || {};
    const row = {
      id: "br-" + Date.now(),
      at: new Date().toISOString(),
      sessionId: String(b.sessionId || ""),
      name: String(b.name || "").trim(),
      phone: String(b.phone || "").trim(),
      email: String(b.email || "").trim(),
      dob: String(b.dob || "").trim(),
      branch: String(b.branch || "").trim(),
      stream: String(b.stream || "").trim(),
      source: "program_apply",
    };
    await store.appendAdmission(row);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server" });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const b = req.body || {};
    const sessionId = String(b.sessionId || "").slice(0, 120);
    if (!sessionId) return res.status(400).json({ error: "session" });
    const text = String(b.message || "").trim().slice(0, 2000);
    if (!text) return res.status(400).json({ error: "message" });
    const pageUrl = String(b.pageUrl || "").trim().slice(0, 512);
    const row = {
      id: "ch-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      at: new Date().toISOString(),
      sessionId,
      role: "visitor",
      body: text,
      pageUrl,
      readByAdmin: false,
    };
    await store.appendChat(row);
    return res.json({ ok: true, id: row.id });
  } catch (err) {
    console.error("chat write", err);
    const msg = err && err.message ? String(err.message).slice(0, 240) : "server";
    return res.status(500).json({ error: msg });
  }
});

app.get("/api/chat/poll", async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || "").slice(0, 120);
    if (!sessionId) return res.status(400).json({ error: "session" });
    const after = String(req.query.after || "");
    let list = (await store.listChatAll()).filter((m) => m.sessionId === sessionId);
    if (after) {
      const idx = list.findIndex((m) => m.id === after);
      list = idx >= 0 ? list.slice(idx + 1) : list;
    }
    res.json({ messages: list.slice(-200) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server" });
  }
});

app.get("/api/admin/chat", requireAnyAdmin, async (req, res) => {
  try {
    const list = await store.listChatAll();
    const bySession = {};
    list.forEach((m) => {
      const sid = m.sessionId || "x";
      if (!bySession[sid])
        bySession[sid] = { sessionId: sid, messages: [], unread: 0, lastAt: m.at, lastPageUrl: "" };
      bySession[sid].messages.push(m);
      if (m.at > bySession[sid].lastAt) bySession[sid].lastAt = m.at;
      if (m.role === "visitor" && !m.readByAdmin) bySession[sid].unread += 1;
      if (m.role === "visitor" && m.pageUrl) bySession[sid].lastPageUrl = m.pageUrl;
    });
    const sessions = Object.values(bySession)
      .map((s) => ({
        sessionId: s.sessionId,
        lastAt: s.lastAt,
        unread: s.unread,
        preview: (s.messages[s.messages.length - 1] || {}).body || "",
        lastPageUrl: s.lastPageUrl || "",
      }))
      .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
    res.json({ sessions, totalUnread: sessions.reduce((n, s) => n + s.unread, 0) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server" });
  }
});

app.get("/api/admin/chat/thread", requireAnyAdmin, async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || "").slice(0, 120);
    if (!sessionId) return res.status(400).json({ error: "session" });
    const markRead = req.query.markRead !== "0";
    if (markRead) await store.markChatVisitorRead(sessionId);
    const fresh = await store.listChatAll();
    res.json({ messages: fresh.filter((m) => m.sessionId === sessionId) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server" });
  }
});

app.post("/api/admin/chat/reply", requireAnyAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const sessionId = String(b.sessionId || "").slice(0, 120);
    const text = String(b.message || "").trim().slice(0, 2000);
    if (!sessionId || !text) return res.status(400).json({ error: "bad" });
    const row = {
      id: "ch-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      at: new Date().toISOString(),
      sessionId,
      role: "admin",
      body: text,
      pageUrl: "",
      readByAdmin: true,
    };
    await store.appendChat(row);
    res.json({ ok: true, id: row.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server" });
  }
});

app.get("/api/admin/updates", requireAnyAdmin, async (req, res) => {
  const payload = {
    analytics: [],
    admissionsFull: [],
    admissionsPartial: [],
    chatUnread: 0,
  };
  const tasks = [
    ["countChatUnread", () => store.countChatUnread().then((n) => (payload.chatUnread = n))],
    ["listAnalyticsTail", () => store.listAnalyticsTail(2500).then((rows) => (payload.analytics = rows))],
    [
      "listAdmissionsTail",
      () => store.listAdmissionsTail(500).then((rows) => (payload.admissionsFull = rows)),
    ],
    [
      "listPartialsTail",
      () => store.listPartialsTail(1500).then((rows) => (payload.admissionsPartial = rows)),
    ],
  ];
  for (const [name, fn] of tasks) {
    try {
      await fn();
    } catch (e) {
      console.error("GET /api/admin/updates " + name, e);
    }
  }
  try {
    res.type("json").send(
      JSON.stringify(payload, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
    );
  } catch (e) {
    console.error("GET /api/admin/updates serialize", e);
    res.status(500).json({ error: "serialize failed" });
  }
});

app.get("/api/admin/export/:kind", requireAnyAdmin, async (req, res) => {
  try {
    const kind = String(req.params.kind || "");
    const fmt = String(req.query.fmt || "json").toLowerCase();
    const table = await getExportTable(kind);
    if (!table) return res.status(404).json({ error: "unknown export" });

    if (fmt === "json") {
      let data;
      if (kind === "analytics") data = (await buildVisitorsSummary()).jsonArray;
      else if (kind === "admissions-page") {
        data = (await store.listAdmissionsAll()).filter((x) => x.source === "admissions_page");
      } else if (kind === "admissions-partial") {
        data = (await store.listPartialsAll()).map((x) => {
          const f = x.fields || {};
          return {
            when: x.at,
            email: f.email || "",
            phone: f.phone || "",
            fullName: f.fullName || "",
            completionPercent: x.completionPercent,
            stream: f.stream || "",
            branch: f.branch || "",
            city: f.city || "",
            district: f.district || "",
          };
        });
      } else {
        data = (await store.listAdmissionsAll()).filter((x) => x.source === "program_apply");
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${table.base}.json"`);
      return res.send(JSON.stringify(data, null, 2));
    }
    if (fmt === "csv") {
      const csv = tableToCsv(table.headers, table.rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${table.base}.csv"`);
      return res.send(csv);
    }
    if (fmt === "gsheets") {
      const csv = tableToCsv(table.headers, table.rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${table.base}-google-sheets.csv"`
      );
      return res.send(csv);
    }
    if (fmt === "pdf") {
      return sendExportPdf(res, table);
    }
    return res.status(400).json({ error: "bad format" });
  } catch (err) {
    console.error("export", err);
    return res.status(500).json({ error: "export failed" });
  }
});

app.post("/api/admin/chat/clear", requireFullAdmin, async (req, res) => {
  try {
    await store.clearChat();
    res.json({ ok: true });
  } catch (err) {
    console.error("chat clear", err);
    res.status(500).json({ error: "clear failed" });
  }
});

const uploadsCache =
  process.env.UPLOADS_CACHE_OFF === "1" ? 0 : process.env.NODE_ENV === "production" ? 31536000000 : 86400000;
app.use(
  "/uploads",
  express.static(UPLOADS, {
    maxAge: uploadsCache,
    immutable: true,
    etag: true,
    lastModified: true,
  })
);
app.use(express.static(PUBLIC));
app.use("/admin", express.static(path.join(ROOT, "admin")));

(async function startServer() {
  await store.maybeWipeChatOnStart().catch((e) => console.error(e));
  if (typeof store.ensureMysqlSchemaPatches === "function") {
    await store.ensureMysqlSchemaPatches().catch((e) => console.error("MySQL schema patch:", e));
  }
  app.listen(PORT, () => {
    console.log("College site:  http://localhost:" + PORT + "/");
    console.log("Admin:         http://localhost:" + PORT + "/admin/");
    console.log("Data backend:  " + store.backend + (store.backend === "mysql" ? " (DATABASE_URL / MYSQL*)" : " (JSON files under data/)"));
    if (process.env.WIPE_CHAT_ON_RESTART !== "1") {
      console.log("Tip: Set WIPE_CHAT_ON_RESTART=1 to clear chat on each deploy, or use Admin → Clear all chat history.");
    }
  });
})();

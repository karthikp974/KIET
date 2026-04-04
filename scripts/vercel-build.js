/**
 * Vercel build: copy admin panel into public/admin so one static deploy serves site + admin.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "admin");
const dest = path.join(root, "public", "admin");

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log("vercel-build: copied admin/ -> public/admin/");

# Deploy: Vercel (website + admin) + Railway (API + MySQL)

You do **not** need to write SQL by hand. Tables are created when you run **one command** after MySQL exists.

## What talks to what

- **Vercel** serves only the **static** files from the `public/` folder (the college site and, after build, `public/admin/`).
- **Railway** runs **`node server.js`** (the API) and your **MySQL** database.
- **`vercel.json`** tells Vercel to **forward** `/api/*` and `/uploads/*` to Railway so the browser still uses the same address as the site (no tricky cookies).

## 1) Railway: MySQL

1. Create a **new project** on Railway.
2. Add a **MySQL** database (New → Database → MySQL).
3. Add a **second service**: **Deploy from GitHub** (this repo) or “Empty” and connect the repo.
4. In the **web service** (Node), open **Variables** and **connect** the MySQL plugin so Railway injects variables like `MYSQLHOST`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`, `MYSQLPORT` (names can vary slightly; `DATABASE_URL` may also appear).
5. Set these yourself (use strong values in production):

   - `COOKIE_SECRET` — long random string  
   - `ADMIN_PASSWORD_FULL`, `ADMIN_PASSWORD_VISI`, `ADMIN_PASSWORD` — your admin passwords  
   - `NODE_ENV` = `production`

6. **Create tables once** (pick one way):

   **Option A — from your PC** (easiest to see errors):

   - Install [Railway CLI](https://docs.railway.com/develop/cli) or copy MySQL env vars from the Railway dashboard.
   - In the project folder on your computer:

     ```bash
     set MYSQLHOST=...   REM Windows: set each variable from Railway’s MySQL tab
     npm install
     npm run db:migrate
     ```

   **Option B — on Railway** (one-off command):

   - In the **web** service → **Settings** → add a one-time **Deploy Command** or use **Railway “Run”** / shell if available, or run the same `npm run db:migrate` with variables pointing at the production MySQL.

   The script reads `db/schema.sql`, creates all tables, and copies the first website JSON from `public/data/site.json` into MySQL if the table is empty.

7. **Public URL**: open the **web** service → **Settings** → generate a domain, e.g. `https://your-api.up.railway.app`. You need this exact URL for Vercel (next step).

## 2) Railway: Web service

- **Start command**: `npm start` (already in `package.json`).
- Railway sets `PORT` automatically; the server uses it.
- **Uploads (photos from admin):** The API saves files under `public/uploads/` by default, but that disk is **wiped on redeploy**. For production, add a **Volume** in Railway, mount it (e.g. to `/data/uploads`), and set **`UPLOADS_DIR=/data/uploads`** on the web service so uploads persist. Photos are compressed to **JPEG** (`.jpg` URLs) for smaller files and correct browser display.
- Optional: **`UPLOADS_CACHE_OFF=1`** disables long browser cache while debugging uploads.

## 3) Vercel: Frontend

1. Import the **same** GitHub repo into Vercel.
2. Open **`vercel.json`** in the repo and replace **both** occurrences of  
   `https://REPLACE_WITH_YOUR_RAILWAY_APP_URL.up.railway.app`  
   with your real Railway URL (no trailing slash), e.g. `https://kiet-api-production-xxxx.up.railway.app`.
3. Deploy. Vercel will run `node scripts/vercel-build.js`, which copies `admin/` → `public/admin/`.

After deploy:

- College site: `https://your-project.vercel.app/`
- Admin: `https://your-project.vercel.app/admin/`

Sign-in and “Save website” use cookies on the **Vercel** domain because `/api/*` is proxied to Railway.

## 4) Local development (optional)

- Without MySQL env vars, the server uses **JSON files** under `data/` (same as before).
- With MySQL vars set, it uses the **database** after you run `npm run db:migrate`.

## 5) If you ever call the API from another domain (no Vercel rewrite)

Set on Railway:

- `PUBLIC_SITE_ORIGIN` = your Vercel origin, e.g. `https://your-project.vercel.app`

Then the API sends CORS headers and login cookies use `SameSite=None` (secure). Prefer the **rewrite** setup above so you usually do **not** need this.

## Tables created by `npm run db:migrate`

| Table               | Purpose                                      |
|---------------------|----------------------------------------------|
| `site_config`       | Whole website JSON (what admin saves)        |
| `analytics_events`  | Visitor / section analytics                  |
| `admissions`        | Full admissions + program apply leads        |
| `admissions_partial`| Partial form progress                        |
| `chat_messages`     | Live chat                                    |

You can still open `db/schema.sql` in a text editor to see the structure; you do not have to run it manually if you use `npm run db:migrate`.

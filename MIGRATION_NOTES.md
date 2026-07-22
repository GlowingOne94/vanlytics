# Vanlytics — Migration Notes

This project has been migrated off Manus. Summary of what changed:

## What changed

1. **Multi-tenancy added** — new `organizations` table; every table
   (`vehicles`, `repairs`, `shops`, `maintenanceServices`, `maintenanceRecords`,
   `alerts`) now has an `organizationId` column. Every server-side query in
   `server/db.ts` and `server/routers.ts` is scoped to the signed-in user's
   organization, so data from one company is never visible to another.

2. **Auth** — Manus OAuth is gone. Replaced with email/password:
   - `POST /api/auth/signup` — `{ companyName, name, email, password }`.
     Creates a new organization and makes the first user its admin.
   - `POST /api/auth/login` — `{ email, password }`.
   - Sessions are a signed JWT in an httpOnly cookie (same mechanism as
     before, just no more Manus token exchange). See `server/auth.ts`.
   - Passwords are hashed with bcrypt (`bcryptjs`, 12 rounds).

3. **File storage** — `server/storage.ts` now talks directly to any
   S3-compatible bucket (AWS S3 or Cloudflare R2) instead of Manus's Forge
   proxy. Configure `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
   etc. — see `.env.example`.

4. **AI Advisor** — `server/_core/llm.ts` now calls an OpenAI-compatible
   `/v1/chat/completions` endpoint directly (`LLM_API_URL` / `LLM_API_KEY`),
   instead of Manus's Forge proxy.

5. **Removed** — Manus OAuth/SDK files, the Forge-backed map/voice/image
   generation reference modules (unused by this app), the Manus Vite dev
   plugins, and the Manus analytics script tag.

## What you still need to do

- **Get your fleet data out of Manus.** The CSV you gave me only had your
  user account — no vehicles/repairs/shops yet. Export those (or get DB
  access) and send them over so I can load them under your organization.
- **Provision infrastructure:** a MySQL database (Railway/PlanetScale), an
  S3-compatible bucket, and an OpenAI (or other) API key. Fill in `.env`
  from `.env.example`.
- **Run migrations:** `npm run db:push` once `DATABASE_URL` is set.
- **Deploy:** push this to Railway/Render as a Node service (`npm run build`
  then `npm start`).

## Still single points to revisit before onboarding real customers

- No email verification or password-reset flow yet (email/password only,
  no "forgot password" email sending configured).
- No per-organization billing/plan gating yet — every signup gets full
  access.
- `server/_core/notification.ts` is a stub (logs to console) — wire it to
  real email/Slack when you want ops alerts.

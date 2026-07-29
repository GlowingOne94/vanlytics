// One-time migration: generates an organizationCode for every existing
// organization that doesn't have one yet. New signups get one automatically
// going forward — this just covers accounts created before this feature.
//
// Safe to re-run (only touches orgs where the code is still null).
//
// Usage: npx tsx scripts/backfill-org-codes.ts
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { isNull, eq } from "drizzle-orm";
import { organizations } from "../drizzle/schema";

const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L — avoids ambiguity
function generateCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Make sure your .env file is filled in.");
    process.exit(1);
  }

  const db = drizzle(process.env.DATABASE_URL);

  const existingCodes = new Set(
    (await db.select().from(organizations)).map(o => o.organizationCode).filter(Boolean)
  );

  const needsCode = await db.select().from(organizations).where(isNull(organizations.organizationCode));
  console.log(`Found ${needsCode.length} organization(s) needing a code.`);

  for (const org of needsCode) {
    let code = generateCode();
    while (existingCodes.has(code)) {
      code = generateCode();
    }
    existingCodes.add(code);
    await db.update(organizations).set({ organizationCode: code }).where(eq(organizations.id, org.id));
    console.log(`  - ${org.name} (id ${org.id}) -> ${code}`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});

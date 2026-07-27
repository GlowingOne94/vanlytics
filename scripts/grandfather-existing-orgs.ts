// One-time migration: marks every organization that currently exists as
// "grandfathered" — exempt from billing requirements and any future
// per-plan limits (vehicle counts, etc). New signups created AFTER this
// script runs always default to isGrandfathered='no'.
//
// IMPORTANT: run this AFTER `npx drizzle-kit push` (so the isGrandfathered
// column actually exists), and run it once, promptly — any organization
// that signs up between the push and this script running would also get
// grandfathered in, since this captures every org that exists at the
// moment it runs.
//
// Safe to re-run (just re-marks the same existing orgs; harmless no-op
// for orgs already marked).
//
// Usage: npx tsx scripts/grandfather-existing-orgs.ts
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Make sure your .env file is filled in.");
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    const [before] = await conn.execute(`SELECT id, name FROM organizations`);
    console.log(`Found ${(before as any[]).length} organization(s):`);
    for (const org of before as any[]) {
      console.log(`  - ${org.name} (id ${org.id})`);
    }

    const [result] = await conn.execute(
      `UPDATE organizations SET isGrandfathered = 'yes' WHERE isGrandfathered != 'yes'`
    );
    console.log(`\nGrandfathered ${(result as any).affectedRows} organization(s).`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});

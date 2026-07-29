// Applies just the UNIQUE constraint on organizations.organizationCode
// directly, bypassing drizzle-kit's interactive push prompt. Safe to run
// only after confirming (via check-org-codes.ts) that every organization
// already has a real, distinct code — this script won't do that
// verification for you, so don't run it blind.
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [existing] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organizations'
       AND INDEX_NAME = 'organizations_organizationCode_unique'`
    );
    if ((existing as any[])[0].cnt > 0) {
      console.log("Unique constraint already exists — nothing to do.");
      return;
    }

    await conn.execute(
      `ALTER TABLE organizations ADD UNIQUE INDEX organizations_organizationCode_unique (organizationCode)`
    );
    console.log("Unique constraint added successfully.");
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});

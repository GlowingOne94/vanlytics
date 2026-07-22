// One-time migration: backfills organization_members from the old
// users.organizationId/role columns BEFORE those columns get dropped by
// `drizzle-kit push`. Safe to re-run (won't create duplicate rows), and
// safe to run even if the old columns are already gone (just does nothing).
//
// IMPORTANT: run this BEFORE `npx drizzle-kit push`, not after — once you
// push the new schema, the old columns (and the data in them) are gone.
//
// Usage: npx tsx scripts/migrate-to-memberships.ts
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Make sure your .env file is filled in.");
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS organization_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        organizationId INT NOT NULL,
        userId INT NOT NULL,
        role ENUM('user','admin') NOT NULL DEFAULT 'user',
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [cols] = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
       AND COLUMN_NAME IN ('organizationId', 'role')`
    );

    if ((cols as any[]).length === 0) {
      console.log("users.organizationId/role no longer exist — nothing to backfill (already migrated).");
      return;
    }

    const [result] = await conn.execute(`
      INSERT INTO organization_members (organizationId, userId, role)
      SELECT u.organizationId, u.id, u.role
      FROM users u
      WHERE u.organizationId IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.userId = u.id AND om.organizationId = u.organizationId
        )
    `);

    console.log(`Backfilled ${(result as any).affectedRows} membership row(s).`);
    console.log("You can now safely run: npx drizzle-kit push");
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});

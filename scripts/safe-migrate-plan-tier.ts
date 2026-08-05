// SAFE planTier enum migration — applies the exact same column change
// drizzle-kit wants to make, but via a direct ALTER TABLE instead of
// letting drizzle-kit rebuild (truncate) the table.
//
// This is only safe because no existing row uses the value being removed
// ('enterprise') — this script verifies that itself before touching
// anything, and refuses to proceed if it finds any.
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    // Safety check: refuse to proceed if anything still uses the value
    // being removed from the enum.
    const [rows] = await conn.execute(
      `SELECT id, name, planTier FROM organizations WHERE planTier = 'enterprise'`
    );
    if ((rows as any[]).length > 0) {
      console.error("Safety check failed: found organizations still using planTier='enterprise':");
      console.error(JSON.stringify(rows, null, 2));
      console.error("Manually update these to a specific band (enterprise_50/100/200/custom) before running this script.");
      process.exit(1);
    }
    console.log("Safety check passed — no rows use the value being removed. Proceeding.\n");

    await conn.execute(`
      ALTER TABLE organizations
      MODIFY COLUMN planTier
      ENUM('none','starter','fleet','fleet_pro','enterprise_50','enterprise_100','enterprise_200','enterprise_custom')
      NOT NULL DEFAULT 'none'
    `);

    console.log("Column updated successfully. Verifying...\n");
    const [verify] = await conn.execute(`SHOW COLUMNS FROM organizations WHERE Field = 'planTier'`);
    console.log(JSON.stringify(verify, null, 2));

    const [orgCheck] = await conn.execute(`SELECT id, name, planTier FROM organizations ORDER BY id`);
    console.log("\nAll organizations, confirmed intact:");
    console.log(JSON.stringify(orgCheck, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});

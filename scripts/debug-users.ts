// Read-only diagnostic — prints what's actually in the users and
// organization_members tables right now. Doesn't change anything.
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    const [userCols] = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
       ORDER BY ORDINAL_POSITION`
    );
    console.log("users table columns:", (userCols as any[]).map(c => c.COLUMN_NAME));

    const [users] = await conn.execute(`SELECT * FROM users`);
    console.log("\nusers table rows:");
    console.log(JSON.stringify(users, null, 2));

    const [tables] = await conn.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()`
    );
    console.log("\nAll tables in this database:", (tables as any[]).map(t => t.TABLE_NAME));

    const tableNames = (tables as any[]).map(t => t.TABLE_NAME);
    if (tableNames.includes("organization_members")) {
      const [members] = await conn.execute(`SELECT * FROM organization_members`);
      console.log("\norganization_members rows:", JSON.stringify(members, null, 2));
    } else {
      console.log("\norganization_members table does not exist yet.");
    }
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Debug script failed:", err);
  process.exit(1);
});

// Read-only diagnostic — shows EVERY column for EVERY row currently in the
// organizations table, exactly as it exists right now. No writes of any
// kind. This is purely to see what we're actually working with before
// deciding whether anything needs to be restored or repaired.
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.execute(`SELECT * FROM organizations`);
    console.log(`Row count: ${(rows as any[]).length}\n`);
    console.log(JSON.stringify(rows, null, 2));

    // Also confirm the table structure itself looks right.
    const [columns] = await conn.execute(`SHOW COLUMNS FROM organizations`);
    console.log("\n--- Table structure ---");
    console.log(JSON.stringify(columns, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});

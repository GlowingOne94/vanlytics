// One-time migration: converts any existing drivers.status = 'inactive'
// rows to 'archived' BEFORE the schema push changes the enum from
// ['active','inactive'] to ['active','archived','disqualified'].
//
// IMPORTANT: run this BEFORE `npx drizzle-kit push`, not after — once the
// enum changes, MySQL may reject or mangle rows still holding the old
// 'inactive' value.
//
// Safe to re-run (no-op if there's nothing left to convert).
//
// Usage: npx tsx scripts/migrate-driver-status.ts
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Make sure your .env file is filled in.");
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    const [result] = await conn.execute(
      `UPDATE drivers SET status = 'archived' WHERE status = 'inactive'`
    );
    console.log(`Converted ${(result as any).affectedRows} driver(s) from 'inactive' to 'archived'.`);
    console.log("You can now safely run: npx drizzle-kit push");
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});

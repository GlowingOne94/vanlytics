// Read-only diagnostic — checks row counts across every major table, to
// confirm whether this data loss is isolated to `organizations` or extends
// further. No writes of any kind.
import "dotenv/config";
import mysql from "mysql2/promise";

const TABLES = [
  "organizations",
  "organization_members",
  "vehicles",
  "repairs",
  "shops",
  "maintenance_records",
  "dot_inspections",
  "drivers",
  "driver_medical_certs",
  "driver_abstracts",
  "driver_documents",
  "driver_shifts",
  "driver_devices",
  "toll_transactions",
  "toll_imports",
  "alerts",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    for (const table of TABLES) {
      try {
        const [rows] = await conn.execute(`SELECT COUNT(*) as count FROM \`${table}\``);
        console.log(`${table}: ${(rows as any[])[0].count} rows`);
      } catch (err) {
        console.log(`${table}: ERROR — ${(err as Error).message}`);
      }
    }
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});

// Read-only diagnostic — counts how many rows in each table were created
// AFTER July 23, 2026 (the backup date), so we know exactly what a full
// restore-in-place would wipe out. No writes of any kind.
import "dotenv/config";
import mysql from "mysql2/promise";

const CUTOFF = "2026-07-23 23:59:59";

const TABLES_WITH_CREATED_AT = [
  "vehicles",
  "repairs",
  "shops",
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
    console.log(`Rows created after ${CUTOFF} (what a full restore would erase):\n`);
    for (const table of TABLES_WITH_CREATED_AT) {
      try {
        const [rows] = await conn.execute(
          `SELECT COUNT(*) as count FROM \`${table}\` WHERE createdAt > ?`,
          [CUTOFF]
        );
        console.log(`${table}: ${(rows as any[])[0].count} rows created since the backup`);
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

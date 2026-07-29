// Read-only diagnostic — shows the current organizationCode value for every
// organization, so we can confirm whether the backfill script actually ran.
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.execute(`SELECT id, name, organizationCode FROM organizations`);
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Check failed:", err);
  process.exit(1);
});

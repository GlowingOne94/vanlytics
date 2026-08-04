// Read-only diagnostic — confirms every organization's billingInterval
// and planTier came through the enum widening intact (month/year -> 
// month/quarter/year). No writes, safe to run anytime.
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.execute(
      `SELECT id, name, planTier, billingInterval, subscriptionStatus FROM organizations`
    );
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});

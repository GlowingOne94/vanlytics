// Read-only diagnostic — confirms exactly which organizationId values are
// still referenced by existing data (organization_members, vehicles), so
// we reconstruct the organizations table with the correct original IDs.
// No writes of any kind.
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [members] = await conn.execute(
      `SELECT organizationId, userId, role FROM organization_members ORDER BY organizationId`
    );
    console.log("--- organization_members ---");
    console.log(JSON.stringify(members, null, 2));

    const [vehicleOrgs] = await conn.execute(
      `SELECT DISTINCT organizationId, COUNT(*) as vehicleCount FROM vehicles GROUP BY organizationId`
    );
    console.log("\n--- distinct organizationIds referenced by vehicles ---");
    console.log(JSON.stringify(vehicleOrgs, null, 2));

    // Also pull user emails so we can see whose account is whose.
    const [users] = await conn.execute(`SELECT id, email, name FROM users`);
    console.log("\n--- users ---");
    console.log(JSON.stringify(users, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});

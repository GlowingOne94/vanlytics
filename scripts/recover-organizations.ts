// RECOVERY SCRIPT — reconstructs the 5 organization rows that were lost,
// using their ORIGINAL IDs so every existing reference (vehicles, repairs,
// organization_members, everything) reconnects automatically. Nothing else
// in the database is touched.
//
// Includes a safety check: refuses to run if organizations already has any
// rows, so this can't accidentally create duplicates.
import "dotenv/config";
import mysql from "mysql2/promise";

function generateOrgCode(): string {
  // No ambiguous characters (0/O/1/I/L), matching the original convention.
  const chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const ORGS = [
  {
    id: 1,
    name: "Basit Ambulette LTD SVC",
    slug: "basit-ambulette-ltd-svc",
    industryType: "nemt",
    isGrandfathered: "yes",
    planTier: "fleet_pro",
  },
  {
    id: 2,
    name: "BT Express INC",
    slug: "bt-express-inc",
    industryType: "nemt",
    isGrandfathered: "yes",
    planTier: "fleet_pro",
  },
  {
    id: 3,
    name: "Test Org 3 (rename me)",
    slug: "test-org-3",
    industryType: "other",
    isGrandfathered: "no",
    planTier: "none",
  },
  {
    id: 4,
    name: "Test Org 4 (rename me)",
    slug: "test-org-4",
    industryType: "other",
    isGrandfathered: "no",
    planTier: "none",
  },
  {
    id: 5,
    name: "Test Org 5 (rename me)",
    slug: "test-org-5",
    industryType: "other",
    isGrandfathered: "no",
    planTier: "none",
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [existing] = await conn.execute(`SELECT COUNT(*) as count FROM organizations`);
    const count = (existing as any[])[0].count;
    if (count > 0) {
      console.error(`Safety check failed: organizations table already has ${count} row(s). Refusing to run to avoid duplicates.`);
      process.exit(1);
    }

    for (const org of ORGS) {
      const code = generateOrgCode();
      await conn.execute(
        `INSERT INTO organizations
          (id, name, slug, industryType, enabledModules, planTier, isGrandfathered, extraVehicleSlots, organizationCode, billingInterval)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'month')`,
        [
          org.id,
          org.name,
          org.slug,
          org.industryType,
          JSON.stringify({ driverMedical: org.industryType === "nemt" }),
          org.planTier,
          org.isGrandfathered,
          code,
        ]
      );
      console.log(`Created organization ${org.id}: ${org.name} (code: ${code}, grandfathered: ${org.isGrandfathered})`);
    }

    // Keep future signups from colliding with these explicit IDs.
    await conn.execute(`ALTER TABLE organizations AUTO_INCREMENT = 6`);

    console.log("\nDone. Verifying...");
    const [verify] = await conn.execute(`SELECT id, name, planTier, isGrandfathered, organizationCode FROM organizations ORDER BY id`);
    console.log(JSON.stringify(verify, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});

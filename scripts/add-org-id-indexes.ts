// SAFE, additive-only script — adds an index on organizationId to every
// multi-tenant table. This is fundamentally different from the enum
// changes that caused trouble before: this only ADDS something, never
// changes an existing column's type, so there's no table-rebuild risk.
//
// Skips any index that already exists, so this is safe to re-run.
import "dotenv/config";
import mysql from "mysql2/promise";

const INDEXES = [
    `CREATE INDEX organization_members_org_idx ON organization_members (organizationId)`,
    `CREATE INDEX invites_org_idx ON invites (organizationId)`,
    `CREATE INDEX vehicles_org_idx ON vehicles (organizationId)`,
    `CREATE INDEX shops_org_idx ON shops (organizationId)`,
    `CREATE INDEX repairs_org_idx ON repairs (organizationId)`,
    `CREATE INDEX repair_documents_org_idx ON repair_documents (organizationId)`,
    `CREATE INDEX maintenance_services_org_idx ON maintenance_services (organizationId)`,
    `CREATE INDEX maintenance_records_org_idx ON maintenance_records (organizationId)`,
    `CREATE INDEX alerts_org_idx ON alerts (organizationId)`,
    `CREATE INDEX dot_inspections_org_idx ON dot_inspections (organizationId)`,
    `CREATE INDEX drivers_org_idx ON drivers (organizationId)`,
    `CREATE INDEX driver_medical_certs_org_idx ON driver_medical_certs (organizationId)`,
    `CREATE INDEX driver_abstracts_org_idx ON driver_abstracts (organizationId)`,
    `CREATE INDEX driver_documents_org_idx ON driver_documents (organizationId)`,
    `CREATE INDEX route_imports_org_idx ON route_imports (organizationId)`,
    `CREATE INDEX trips_org_idx ON trips (organizationId)`,
    `CREATE INDEX trip_status_events_org_idx ON trip_status_events (organizationId)`,
    `CREATE INDEX driver_pairing_codes_org_idx ON driver_pairing_codes (organizationId)`,
    `CREATE INDEX driver_devices_org_idx ON driver_devices (organizationId)`,
    `CREATE INDEX driver_shifts_org_idx ON driver_shifts (organizationId)`,
    `CREATE INDEX driver_locations_org_idx ON driver_locations (organizationId)`,
    `CREATE INDEX toll_imports_org_idx ON toll_imports (organizationId)`,
    `CREATE INDEX toll_transactions_org_idx ON toll_transactions (organizationId)`,
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    for (const sql of INDEXES) {
      try {
        await conn.execute(sql);
        console.log(`OK: ${sql}`);
      } catch (err: any) {
        if (err.code === "ER_DUP_KEYNAME") {
          console.log(`Already exists, skipped: ${sql}`);
        } else {
          throw err;
        }
      }
    }
    console.log("\nDone.");
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});

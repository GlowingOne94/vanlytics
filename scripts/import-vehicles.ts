// One-time import script: loads a vehicles CSV (exported from Manus) into
// the vehicles table, preserving the original numeric `id` values so that
// later repairs/maintenance imports (which reference vehicleId) still line
// up correctly.
//
// Usage:
//   npx tsx scripts/import-vehicles.ts <path-to-csv> [organization-email]
//
// If you only have one organization/account, you can omit the email and
// it'll be picked automatically.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { organizations, vehicles } from "../drizzle/schema";
import { parseCsv } from "./csv";

async function main() {
  const csvPath = process.argv[2];
  const orgEmail = process.argv[3];

  if (!csvPath) {
    console.error("Usage: npx tsx scripts/import-vehicles.ts <path-to-csv> [organization-email]");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Make sure your .env file is filled in.");
    process.exit(1);
  }

  const db = drizzle(process.env.DATABASE_URL);

  // Resolve which organization to import into.
  let organizationId: number;
  if (orgEmail) {
    const { users } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(users).where(eq(users.email, orgEmail)).limit(1);
    if (rows.length === 0) {
      console.error(`No user found with email ${orgEmail}`);
      process.exit(1);
    }
    organizationId = rows[0].organizationId;
  } else {
    const allOrgs = await db.select().from(organizations);
    if (allOrgs.length === 0) {
      console.error("No organizations found. Sign up in the app first.");
      process.exit(1);
    }
    if (allOrgs.length > 1) {
      console.error(
        `Found ${allOrgs.length} organizations. Re-run with the account email as the second argument:\n` +
        `  npx tsx scripts/import-vehicles.ts ${csvPath} your-email@example.com`
      );
      process.exit(1);
    }
    organizationId = allOrgs[0].id;
    console.log(`Importing into organization: ${allOrgs[0].name} (id ${organizationId})`);
  }

  const absPath = path.resolve(csvPath);
  const csvText = fs.readFileSync(absPath, "utf-8");
  const records = parseCsv(csvText);

  console.log(`Parsed ${records.length} vehicle rows from ${absPath}`);

  const toEpochMs = (value: string): number | null => {
    if (!value || value.trim() === "") return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const toIntOrNull = (value: string): number | null => {
    if (!value || value.trim() === "") return null;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const validStatuses = new Set(["active", "down", "awaiting_parts", "at_shop", "retired"]);
  const validHealthScores = new Set(["green", "yellow", "red"]);

  let inserted = 0;
  let skipped = 0;

  for (const r of records) {
    const id = toIntOrNull(r.id);
    if (!id) {
      console.warn(`Skipping row with missing/invalid id: ${JSON.stringify(r)}`);
      skipped++;
      continue;
    }
    if (!r.vanNumber || !r.vin) {
      console.warn(`Skipping vehicle id ${id}: missing vanNumber or vin`);
      skipped++;
      continue;
    }

    const status = validStatuses.has(r.status) ? (r.status as any) : "active";
    const healthScore = validHealthScores.has(r.healthScore) ? (r.healthScore as any) : "green";

    await db.insert(vehicles).values({
      id,
      organizationId,
      vanNumber: r.vanNumber,
      vin: r.vin,
      licensePlate: r.licensePlate || null,
      year: toIntOrNull(r.year) ?? new Date().getFullYear(),
      make: r.make || "Ford",
      model: r.model || "Transit Ambulette",
      mileage: toIntOrNull(r.mileage) ?? 0,
      engine: r.engine || null,
      transmission: r.transmission || null,
      assignedDriver: r.assignedDriver || null,
      status,
      healthScore,
      photoUrl: r.photoUrl || null,
      photoKey: r.photoKey || null,
      insuranceExpiry: toEpochMs(r.insuranceExpiry),
      registrationExpiry: toEpochMs(r.registrationExpiry),
      notes: r.notes || null,
    }).onDuplicateKeyUpdate({
      set: {
        organizationId,
        vanNumber: r.vanNumber,
        vin: r.vin,
        licensePlate: r.licensePlate || null,
        year: toIntOrNull(r.year) ?? new Date().getFullYear(),
        mileage: toIntOrNull(r.mileage) ?? 0,
        status,
        healthScore,
        notes: r.notes || null,
      },
    });
    inserted++;
  }

  console.log(`Done. Imported/updated ${inserted} vehicles, skipped ${skipped}.`);
  process.exit(0);
}

main().catch(err => {
  console.error("Import failed:", err);
  process.exit(1);
});

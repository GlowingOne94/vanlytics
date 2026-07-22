// One-time seed: populates the maintenance_services catalog for one
// organization. Safe to re-run — skips any service that already exists
// (matched by name) for that organization.
//
// Usage:
//   npx tsx scripts/seed-maintenance-services.ts [organization-email]
//
// If you only have one organization, you can omit the email and it'll be
// picked automatically. If you have more than one (e.g. two companies),
// pass the email of an account that belongs to the one you want to seed.
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import { organizations, organizationMembers, users, maintenanceServices } from "../drizzle/schema";

const SERVICES: { category: string; name: string; intervalMiles: number; intervalMonths: number }[] = [
  { category: "Brakes", name: "Brake Pads", intervalMiles: 40000, intervalMonths: 36 },
  { category: "Brakes", name: "Brake Rotors", intervalMiles: 70000, intervalMonths: 60 },

  { category: "Cooling", name: "Coolant Hoses", intervalMiles: 60000, intervalMonths: 48 },
  { category: "Cooling", name: "Radiator Inspection", intervalMiles: 50000, intervalMonths: 36 },

  { category: "Electrical", name: "Alternator Inspection", intervalMiles: 60000, intervalMonths: 48 },
  { category: "Electrical", name: "Battery", intervalMiles: 50000, intervalMonths: 36 },
  { category: "Electrical", name: "Starter Inspection", intervalMiles: 80000, intervalMonths: 60 },

  { category: "Engine", name: "Serpentine Belt", intervalMiles: 60000, intervalMonths: 48 },
  { category: "Engine", name: "Spark Plugs", intervalMiles: 60000, intervalMonths: 48 },

  { category: "Filters", name: "Air Filter", intervalMiles: 30000, intervalMonths: 24 },
  { category: "Filters", name: "Cabin Filter", intervalMiles: 20000, intervalMonths: 12 },
  { category: "Filters", name: "Fuel Filter", intervalMiles: 40000, intervalMonths: 36 },

  { category: "Fluids", name: "Brake Flush", intervalMiles: 30000, intervalMonths: 24 },
  { category: "Fluids", name: "Coolant Flush", intervalMiles: 50000, intervalMonths: 36 },
  { category: "Fluids", name: "Differential Fluid", intervalMiles: 60000, intervalMonths: 48 },
  { category: "Fluids", name: "Oil Change", intervalMiles: 8000, intervalMonths: 6 },
  { category: "Fluids", name: "Power Steering Fluid", intervalMiles: 75000, intervalMonths: 60 },
  { category: "Fluids", name: "Transmission Fluid", intervalMiles: 60000, intervalMonths: 48 },

  { category: "HVAC", name: "AC System Inspection", intervalMiles: 30000, intervalMonths: 24 },

  { category: "Suspension", name: "Front Suspension", intervalMiles: 80000, intervalMonths: 60 },
  { category: "Suspension", name: "Rear Suspension", intervalMiles: 80000, intervalMonths: 60 },
  { category: "Suspension", name: "Wheel Bearings", intervalMiles: 100000, intervalMonths: 72 },

  { category: "Tires & Alignment", name: "Tire Rotation", intervalMiles: 8000, intervalMonths: 6 },
  { category: "Tires & Alignment", name: "Tires", intervalMiles: 50000, intervalMonths: 48 },
  { category: "Tires & Alignment", name: "Wheel Alignment", intervalMiles: 25000, intervalMonths: 24 },

  { category: "Wheelchair Lift", name: "Hydraulic Fluid", intervalMiles: 30000, intervalMonths: 24 },
  { category: "Wheelchair Lift", name: "Hydraulic Ramp Service", intervalMiles: 15000, intervalMonths: 12 },
  { category: "Wheelchair Lift", name: "Ramp Rollers", intervalMiles: 30000, intervalMonths: 24 },
];

async function main() {
  const orgEmail = process.argv[2];

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Make sure your .env file is filled in.");
    process.exit(1);
  }

  const db = drizzle(process.env.DATABASE_URL);

  let organizationId: number;
  if (orgEmail) {
    const rows = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(users)
      .innerJoin(organizationMembers, eq(organizationMembers.userId, users.id))
      .where(eq(users.email, orgEmail))
      .limit(1);
    if (rows.length === 0) {
      console.error(`No membership found for email ${orgEmail}`);
      process.exit(1);
    }
    organizationId = rows[0].organizationId;
  } else {
    const allOrgs = await db.select().from(organizations);
    if (allOrgs.length === 0) {
      console.error("No organizations found.");
      process.exit(1);
    }
    if (allOrgs.length > 1) {
      console.error(
        `Found ${allOrgs.length} organizations. Re-run with an account email from the one you want to seed:\n` +
        `  npx tsx scripts/seed-maintenance-services.ts your-email@example.com`
      );
      process.exit(1);
    }
    organizationId = allOrgs[0].id;
    console.log(`Seeding into organization: ${allOrgs[0].name} (id ${organizationId})`);
  }

  const existing = await db.select().from(maintenanceServices).where(eq(maintenanceServices.organizationId, organizationId));
  const existingNames = new Set(existing.map(s => s.name));

  let inserted = 0;
  for (const svc of SERVICES) {
    if (existingNames.has(svc.name)) {
      continue;
    }
    await db.insert(maintenanceServices).values({
      organizationId,
      name: svc.name,
      category: svc.category,
      intervalMiles: svc.intervalMiles,
      intervalMonths: svc.intervalMonths,
    });
    inserted++;
  }

  console.log(`Done. Inserted ${inserted} new service type(s), skipped ${SERVICES.length - inserted} already present.`);
  process.exit(0);
}

main().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});

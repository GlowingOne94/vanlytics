// Syncs violations from NYC Open Data's public "Open Parking and Camera
// Violations" dataset (Socrata dataset nc67-uf89). This single dataset
// covers both standard parking tickets and MTA bus lane camera
// violations — NYC's Department of Finance administers both through the
// same system. No API key is required for light use, but ENV.nycOpenDataAppToken
// can be set to raise the (generous, free) rate limit if this ever matters.
//
// Docs: https://dev.socrata.com/foundry/data.cityofnewyork.us/nc67-uf89
import * as db from "./db";
import { ENV } from "./_core/env";

const NYC_VIOLATIONS_ENDPOINT = "https://data.cityofnewyork.us/resource/nc67-uf89.json";

// Violation type strings NYC uses for bus lane / bus stop camera
// violations specifically — these are the ones subject to MTA's
// progressive fine structure. Matched loosely since NYC's exact wording
// has varied over time ("BUS LANE VIOLATION", "PHTO BUS LANE VIOLATION", etc).
function isBusLaneViolationType(violationType: string | null | undefined): boolean {
  if (!violationType) return false;
  const t = violationType.toUpperCase();
  return t.includes("BUS LANE") || t.includes("BUS STOP") || t.includes("DOUBLE PARK");
}

type NycViolationRow = {
  plate?: string;
  state?: string;
  summons_number?: string;
  issue_date?: string;
  violation_time?: string;
  violation?: string;
  issuing_agency?: string;
  fine_amount?: string;
  penalty_amount?: string;
  interest_amount?: string;
  reduction_amount?: string;
  payment_amount?: string;
  amount_due?: string;
  summons_image?: { url?: string } | string;
};

async function fetchViolationsForPlate(plate: string, state: string): Promise<NycViolationRow[]> {
  const params = new URLSearchParams({
    plate: plate.trim().toUpperCase(),
    state: (state || "NY").trim().toUpperCase(),
    "$limit": "200",
  });
  const headers: Record<string, string> = {};
  if (ENV.nycOpenDataAppToken) headers["X-App-Token"] = ENV.nycOpenDataAppToken;

  const res = await fetch(`${NYC_VIOLATIONS_ENDPOINT}?${params}`, { headers });
  if (!res.ok) {
    throw new Error(`NYC Open Data request failed (${res.status}) for plate ${plate}`);
  }
  return res.json();
}

function parseAmount(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = parseFloat(v);
  return isNaN(n) ? undefined : n;
}

function parseIssueDate(row: NycViolationRow): number {
  // issue_date typically comes as an ISO date (midnight); violation_time
  // is a separate 4-digit-ish field like "0627A" — combine when possible,
  // fall back to just the date if the time doesn't parse cleanly.
  const base = row.issue_date ? new Date(row.issue_date) : new Date();
  const timeStr = row.violation_time;
  if (timeStr) {
    const match = timeStr.match(/^(\d{1,2}):?(\d{2})([AP])/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const isPM = match[3].toUpperCase() === "P";
      if (isPM && hours < 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
      base.setHours(hours, minutes, 0, 0);
    }
  }
  return base.getTime();
}

// Syncs one organization's violations — checks every vehicle with a
// license plate on file against NYC's public dataset, and upserts any
// matches by summons number (so re-syncing updates status/payment rather
// than creating duplicates).
export async function syncOrganizationViolations(organizationId: number): Promise<{ checked: number; found: number; errors: string[] }> {
  const vehicles = await db.getVehicles(organizationId);
  const plated = vehicles.filter(v => v.licensePlate && v.licensePlate.trim());

  let found = 0;
  const errors: string[] = [];

  for (const vehicle of plated) {
    try {
      const rows = await fetchViolationsForPlate(vehicle.licensePlate!, "NY");
      for (const row of rows) {
        if (!row.summons_number) continue;

        const violationType = row.violation ?? null;
        const imageUrl = typeof row.summons_image === "object" ? row.summons_image?.url : undefined;

        await db.upsertSyncedViolation(organizationId, {
          vehicleId: vehicle.id,
          plateNumber: vehicle.licensePlate!,
          plateState: row.state ?? "NY",
          summonsNumber: row.summons_number,
          violationType,
          issuingAgency: row.issuing_agency ?? null,
          issueDate: parseIssueDate(row),
          fineAmount: parseAmount(row.fine_amount),
          penaltyAmount: parseAmount(row.penalty_amount),
          interestAmount: parseAmount(row.interest_amount),
          reductionAmount: parseAmount(row.reduction_amount),
          paymentAmount: parseAmount(row.payment_amount),
          amountDue: parseAmount(row.amount_due),
          summonsImageUrl: imageUrl,
          isBusLaneType: isBusLaneViolationType(violationType),
        });
        found++;
      }
    } catch (err: any) {
      errors.push(`Van ${vehicle.vanNumber} (${vehicle.licensePlate}): ${err.message}`);
    }
  }

  return { checked: plated.length, found, errors };
}

// Runs the sync for every organization in the system — called once a day
// by the scheduled job in the server entrypoint. Failures for one org
// don't stop the others from being checked.
export async function syncAllOrganizations(): Promise<void> {
  const orgIds = await db.getAllOrganizationIds();
  console.log(`[violations sync] Starting daily sync for ${orgIds.length} organization(s)...`);
  for (const orgId of orgIds) {
    try {
      const result = await syncOrganizationViolations(orgId);
      console.log(`[violations sync] Org ${orgId}: checked ${result.checked} plate(s), ${result.found} violation(s) found${result.errors.length ? `, ${result.errors.length} error(s)` : ""}`);
    } catch (err: any) {
      console.error(`[violations sync] Org ${orgId} failed:`, err.message);
    }
  }
  console.log("[violations sync] Daily sync complete.");
}

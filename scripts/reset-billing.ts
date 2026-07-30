// Resets stored Stripe billing fields back to blank for every organization.
// Use this when stripeCustomerId/stripeSubscriptionId values are stale —
// e.g. left over from testing in a different Stripe mode (test vs live) —
// so the app goes back to showing "Subscribe" instead of trying to modify
// a subscription that no longer exists under the currently active key.
//
// This does NOT cancel anything in Stripe itself — it only clears what
// Vanlytics has stored. If there's a real, currently-valid subscription you
// want to keep, don't run this against that organization (see the
// single-org version of the WHERE clause commented below).
//
// Usage: npx tsx scripts/reset-billing.ts
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [before] = await conn.execute(
      `SELECT id, name, planTier, stripeCustomerId, stripeSubscriptionId FROM organizations`
    );
    console.log("Before:", JSON.stringify(before, null, 2));

    await conn.execute(`
      UPDATE organizations
      SET planTier = 'none',
          subscriptionStatus = NULL,
          stripeCustomerId = NULL,
          stripeSubscriptionId = NULL,
          extraVehicleSlots = 0,
          stripeExtraVehicleSubscriptionId = NULL
      -- To target just one organization instead of all of them, add:
      -- WHERE id = 1
    `);

    const [after] = await conn.execute(
      `SELECT id, name, planTier, stripeCustomerId, stripeSubscriptionId FROM organizations`
    );
    console.log("\nAfter:", JSON.stringify(after, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});

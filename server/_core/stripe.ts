import Stripe from "stripe";
import { ENV } from "./env";

export const stripe = ENV.stripeSecretKey ? new Stripe(ENV.stripeSecretKey) : null;

export type PlanTier = "starter" | "fleet" | "fleet_pro";

export function priceIdForPlan(plan: PlanTier): string | null {
  const map: Record<PlanTier, string> = {
    starter: ENV.stripePriceStarter,
    fleet: ENV.stripePriceFleet,
    fleet_pro: ENV.stripePriceFleetPro,
  };
  return map[plan] || null;
}

export function planForPriceId(priceId: string | undefined): "starter" | "fleet" | "fleet_pro" | "none" {
  if (!priceId) return "none";
  if (priceId === ENV.stripePriceStarter) return "starter";
  if (priceId === ENV.stripePriceFleet) return "fleet";
  if (priceId === ENV.stripePriceFleetPro) return "fleet_pro";
  return "none";
}

// Base vehicle limits per plan tier. "none" (no active subscription, not
// grandfathered) is 0 — an organization must subscribe to a plan before
// adding any vehicles at all.
export const PLAN_VEHICLE_LIMITS: Record<string, number> = {
  none: 0,
  starter: 7,
  fleet: 20,
  fleet_pro: 40,
  enterprise: Infinity,
};

// How many members can hold the "admin" role, per plan tier — matches the
// pricing page's "administrative users" line for each tier.
export const PLAN_ADMIN_LIMITS: Record<string, number> = {
  none: 1,
  starter: 2,
  fleet: 5,
  fleet_pro: Infinity,
  enterprise: Infinity,
};

// Ordered tier ranking, used to gate features that require "this tier or
// higher" (e.g. Expiration Dashboard needs Fleet+, Bulk Imports needs Fleet
// Pro+). Grandfathered orgs should always be treated as meeting any
// requirement — check that separately before calling this.
const TIER_ORDER = ["none", "starter", "fleet", "fleet_pro", "enterprise"];

export function planMeetsMinimum(planTier: string, minimum: string): boolean {
  const tierIndex = TIER_ORDER.indexOf(planTier);
  const minIndex = TIER_ORDER.indexOf(minimum);
  if (tierIndex === -1 || minIndex === -1) return false;
  return tierIndex >= minIndex;
}

export function extraVehiclePriceId(): string | null {
  return ENV.stripePriceExtraVehicle || null;
}

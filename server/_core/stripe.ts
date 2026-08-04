import Stripe from "stripe";
import { ENV } from "./env";

export const stripe = ENV.stripeSecretKey ? new Stripe(ENV.stripeSecretKey) : null;

export type PlanTier = "starter" | "fleet" | "fleet_pro";
export type BillingInterval = "month" | "quarter" | "year";

// Which intervals each tier actually offers. Starter skips quarterly
// entirely; every paid tier offers monthly and annual.
export const TIER_INTERVALS: Record<PlanTier, BillingInterval[]> = {
  starter: ["month", "year"],
  fleet: ["month", "quarter", "year"],
  fleet_pro: ["month", "quarter", "year"],
};

export function intervalAvailableForTier(plan: PlanTier, interval: BillingInterval): boolean {
  return TIER_INTERVALS[plan].includes(interval);
}

export function priceIdForPlan(plan: PlanTier, interval: BillingInterval = "month"): string | null {
  if (!intervalAvailableForTier(plan, interval)) return null;

  if (interval === "year") {
    const annualMap: Record<PlanTier, string> = {
      starter: ENV.stripePriceStarterAnnual,
      fleet: ENV.stripePriceFleetAnnual,
      fleet_pro: ENV.stripePriceFleetProAnnual,
    };
    return annualMap[plan] || null;
  }
  if (interval === "quarter") {
    const quarterlyMap: Partial<Record<PlanTier, string>> = {
      fleet: ENV.stripePriceFleetQuarterly,
      fleet_pro: ENV.stripePriceFleetProQuarterly,
    };
    return quarterlyMap[plan] || null;
  }
  const monthlyMap: Record<PlanTier, string> = {
    starter: ENV.stripePriceStarter,
    fleet: ENV.stripePriceFleet,
    fleet_pro: ENV.stripePriceFleetPro,
  };
  return monthlyMap[plan] || null;
}

export function planForPriceId(priceId: string | undefined): { tier: "starter" | "fleet" | "fleet_pro" | "none"; interval: BillingInterval } {
  if (!priceId) return { tier: "none", interval: "month" };
  const known: [string, "starter" | "fleet" | "fleet_pro", BillingInterval][] = [
    [ENV.stripePriceStarter, "starter", "month"],
    [ENV.stripePriceStarterAnnual, "starter", "year"],
    [ENV.stripePriceFleet, "fleet", "month"],
    [ENV.stripePriceFleetQuarterly, "fleet", "quarter"],
    [ENV.stripePriceFleetAnnual, "fleet", "year"],
    [ENV.stripePriceFleetPro, "fleet_pro", "month"],
    [ENV.stripePriceFleetProQuarterly, "fleet_pro", "quarter"],
    [ENV.stripePriceFleetProAnnual, "fleet_pro", "year"],
  ];
  const match = known.find(([id]) => id && id === priceId);
  return match ? { tier: match[1], interval: match[2] } : { tier: "none", interval: "month" };
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

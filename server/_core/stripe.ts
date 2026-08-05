import Stripe from "stripe";
import { ENV } from "./env";

export const stripe = ENV.stripeSecretKey ? new Stripe(ENV.stripeSecretKey) : null;

// "enterprise_custom" (200+ vehicles) is fully manual/negotiated — no
// self-serve Stripe price, no checkout flow. It's provisioned by hand,
// the same way grandfathered accounts are.
export type PlanTier = "starter" | "fleet" | "fleet_pro" | "enterprise_50" | "enterprise_100" | "enterprise_200";
export type BillingInterval = "month" | "quarter" | "year";

// Which intervals each tier actually offers. Starter skips quarterly
// entirely; Enterprise bands are monthly-only for now (quarterly/annual
// Enterprise pricing can be added later without touching anything else).
export const TIER_INTERVALS: Record<PlanTier, BillingInterval[]> = {
  starter: ["month", "year"],
  fleet: ["month", "quarter", "year"],
  fleet_pro: ["month", "quarter", "year"],
  enterprise_50: ["month"],
  enterprise_100: ["month"],
  enterprise_200: ["month"],
};

export function intervalAvailableForTier(plan: PlanTier, interval: BillingInterval): boolean {
  return TIER_INTERVALS[plan].includes(interval);
}

export function priceIdForPlan(plan: PlanTier, interval: BillingInterval = "month"): string | null {
  if (!intervalAvailableForTier(plan, interval)) return null;

  if (interval === "year") {
    const annualMap: Partial<Record<PlanTier, string>> = {
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
    enterprise_50: ENV.stripePriceEnterprise50,
    enterprise_100: ENV.stripePriceEnterprise100,
    enterprise_200: ENV.stripePriceEnterprise200,
  };
  return monthlyMap[plan] || null;
}

type ResolvedTier = "starter" | "fleet" | "fleet_pro" | "enterprise_50" | "enterprise_100" | "enterprise_200" | "none";

export function planForPriceId(priceId: string | undefined): { tier: ResolvedTier; interval: BillingInterval } {
  if (!priceId) return { tier: "none", interval: "month" };
  const known: [string, ResolvedTier, BillingInterval][] = [
    [ENV.stripePriceStarter, "starter", "month"],
    [ENV.stripePriceStarterAnnual, "starter", "year"],
    [ENV.stripePriceFleet, "fleet", "month"],
    [ENV.stripePriceFleetQuarterly, "fleet", "quarter"],
    [ENV.stripePriceFleetAnnual, "fleet", "year"],
    [ENV.stripePriceFleetPro, "fleet_pro", "month"],
    [ENV.stripePriceFleetProQuarterly, "fleet_pro", "quarter"],
    [ENV.stripePriceFleetProAnnual, "fleet_pro", "year"],
    [ENV.stripePriceEnterprise50, "enterprise_50", "month"],
    [ENV.stripePriceEnterprise100, "enterprise_100", "month"],
    [ENV.stripePriceEnterprise200, "enterprise_200", "month"],
  ];
  const match = known.find(([id]) => id && id === priceId);
  return match ? { tier: match[1], interval: match[2] } : { tier: "none", interval: "month" };
}

// Base vehicle limits per plan tier. "none" (no active subscription, not
// grandfathered) is 0 — an organization must subscribe to a plan before
// adding any vehicles at all. "enterprise_custom" (200+, fully negotiated)
// has no fixed cap — set per-account by hand, same as grandfathered orgs.
export const PLAN_VEHICLE_LIMITS: Record<string, number> = {
  none: 0,
  starter: 7,
  fleet: 20,
  fleet_pro: 40,
  enterprise_50: 50,
  enterprise_100: 100,
  enterprise_200: 200,
  enterprise_custom: Infinity,
};

// How many members can hold the "admin" role, per plan tier.
export const PLAN_ADMIN_LIMITS: Record<string, number> = {
  none: 1,
  starter: 2,
  fleet: 5,
  fleet_pro: 5,
  enterprise_50: Infinity,
  enterprise_100: Infinity,
  enterprise_200: Infinity,
  enterprise_custom: Infinity,
};

// How many companies/entities a single user can administer, per plan tier
// of their existing companies. Fleet Pro caps at 2; any Enterprise band
// removes the cap entirely.
export const PLAN_COMPANY_LIMITS: Record<string, number> = {
  none: 1,
  starter: 1,
  fleet: 2,
  fleet_pro: 2,
  enterprise_50: Infinity,
  enterprise_100: Infinity,
  enterprise_200: Infinity,
  enterprise_custom: Infinity,
};

// Enterprise 100 and above include a free database migration/setup — the
// same service Starter/Fleet/Fleet Pro customers can otherwise inquire
// about and pay for separately.
export const MIGRATION_INCLUDED_TIERS = ["enterprise_100", "enterprise_200", "enterprise_custom"];

export function migrationIncludedForTier(planTier: string): boolean {
  return MIGRATION_INCLUDED_TIERS.includes(planTier);
}

// Ordered tier ranking, used to gate features that require "this tier or
// higher" (e.g. Expiration Dashboard needs Fleet+, Bulk Imports needs Fleet
// Pro+). Grandfathered orgs should always be treated as meeting any
// requirement — check that separately before calling this.
const TIER_ORDER = ["none", "starter", "fleet", "fleet_pro", "enterprise_50", "enterprise_100", "enterprise_200", "enterprise_custom"];

export function planMeetsMinimum(planTier: string, minimum: string): boolean {
  const tierIndex = TIER_ORDER.indexOf(planTier);
  const minIndex = TIER_ORDER.indexOf(minimum);
  if (tierIndex === -1 || minIndex === -1) return false;
  return tierIndex >= minIndex;
}

export function extraVehiclePriceId(): string | null {
  return ENV.stripePriceExtraVehicle || null;
}

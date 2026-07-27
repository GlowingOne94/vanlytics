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

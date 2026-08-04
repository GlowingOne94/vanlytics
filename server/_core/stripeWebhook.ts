import type { Express, Request, Response } from "express";
import express from "express";
import Stripe from "stripe";
import { stripe, planForPriceId } from "./stripe";
import { ENV } from "./env";
import * as db from "../db";

export function registerStripeWebhook(app: Express) {
  // IMPORTANT: this must be registered with express.raw() BEFORE the
  // global express.json() middleware, since Stripe's signature
  // verification requires the exact raw request body.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
    if (!stripe || !ENV.stripeWebhookSecret) {
      res.status(500).send("Stripe is not configured yet.");
      return;
    }

    let event: Stripe.Event;
    try {
      const signature = req.headers["stripe-signature"] as string;
      event = stripe.webhooks.constructEvent(req.body, signature, ENV.stripeWebhookSecret);
    } catch (err) {
      console.error("[Stripe webhook] Signature verification failed:", err);
      res.status(400).send(`Webhook Error: ${(err as Error).message}`);
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const organizationId = parseInt(session.client_reference_id || "", 10);
          if (!organizationId) break;

          if (session.metadata?.purchaseType === "extra_vehicles") {
            const fullSession = await stripe.checkout.sessions.retrieve(session.id, { expand: ["line_items"] });
            const quantity = fullSession.line_items?.data?.[0]?.quantity ?? 0;
            await db.updateOrganizationBilling(organizationId, {
              stripeCustomerId: (session.customer as string) ?? undefined,
              stripeExtraVehicleSubscriptionId: (session.subscription as string) ?? undefined,
              extraVehicleSlots: quantity,
            });
          } else {
            const fullSession = await stripe.checkout.sessions.retrieve(session.id, { expand: ["line_items"] });
            const priceId = fullSession.line_items?.data?.[0]?.price?.id;
            const { tier, interval } = planForPriceId(priceId);
            await db.updateOrganizationBilling(organizationId, {
              stripeCustomerId: (session.customer as string) ?? undefined,
              stripeSubscriptionId: (session.subscription as string) ?? undefined,
              subscriptionStatus: "active",
              planTier: tier,
              billingInterval: interval,
            });
          }
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const org = await db.getOrganizationByStripeCustomerId(subscription.customer as string);
          if (!org) break;

          const isExtraVehicleSub = subscription.id === org.stripeExtraVehicleSubscriptionId;
          const isCanceled = subscription.status === "canceled";

          if (isExtraVehicleSub) {
            const quantity = subscription.items.data[0]?.quantity ?? 0;
            await db.updateOrganizationBilling(org.id, {
              extraVehicleSlots: isCanceled ? 0 : quantity,
              stripeExtraVehicleSubscriptionId: isCanceled ? null : org.stripeExtraVehicleSubscriptionId,
            });
          } else {
            const priceId = subscription.items.data[0]?.price?.id;
            const { tier, interval } = planForPriceId(priceId);
            await db.updateOrganizationBilling(org.id, {
              subscriptionStatus: subscription.status,
              planTier: isCanceled ? "none" : tier,
              billingInterval: isCanceled ? "month" : interval,
            });
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error("[Stripe webhook] Error handling event:", err);
    }

    res.json({ received: true });
  });
}

import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { authenticateRequest } from "../auth";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  // The organization the current request is scoped to, and the user's role
  // within it. Resolved from the `x-organization-id` header the client sends
  // (set by the org switcher) and validated against the user's actual
  // memberships — a user can never act on an org they don't belong to,
  // regardless of what header value the client sends.
  organizationId: number | null;
  role: "user" | "admin" | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let organizationId: number | null = null;
  let role: "user" | "admin" | null = null;

  try {
    user = await authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (user) {
    const headerValue = opts.req.headers["x-organization-id"];
    const requestedOrgId =
      typeof headerValue === "string" ? parseInt(headerValue, 10) : NaN;

    if (!Number.isNaN(requestedOrgId)) {
      const membership = await db.getMembership(user.id, requestedOrgId);
      if (membership) {
        organizationId = requestedOrgId;
        role = membership.role;
      }
    }

    // No valid org header (or none sent) — fall back to the user's first
    // membership so a freshly logged-in client always has something to work
    // with before the org switcher has loaded/set anything.
    if (organizationId === null) {
      const memberships = await db.getUserMemberships(user.id);
      if (memberships.length > 0) {
        organizationId = memberships[0].organizationId;
        role = memberships[0].role;
      }
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    organizationId,
    role,
  };
}

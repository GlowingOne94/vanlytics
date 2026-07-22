import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: any[] } {
  const clearedCookies: any[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    email: "fleet@example.com",
    passwordHash: "test-hash",
    name: "Fleet Manager",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    organizationId: 1,
    role: "admin",
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    organizationId: null,
    role: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Vanlytics API", () => {
  describe("auth.me", () => {
    it("returns user when authenticated", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.auth.me();
      expect(result).toBeDefined();
      expect(result?.name).toBe("Fleet Manager");
      expect(result?.role).toBe("admin");
    });

    it("returns null when not authenticated", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.auth.me();
      expect(result).toBeNull();
    });
  });

  describe("auth.logout", () => {
    it("clears the session cookie and reports success", async () => {
      const { ctx, clearedCookies } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.auth.logout();
      expect(result).toEqual({ success: true });
      expect(clearedCookies).toHaveLength(1);
      expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    });
  });

  describe("protected procedures", () => {
    it("vehicles.list throws UNAUTHORIZED for unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.vehicles.list()).rejects.toThrow();
    });

    it("repairs.list throws UNAUTHORIZED for unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.repairs.list()).rejects.toThrow();
    });

    it("shops.list throws UNAUTHORIZED for unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.shops.list()).rejects.toThrow();
    });

    it("alerts.list throws UNAUTHORIZED for unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.alerts.list()).rejects.toThrow();
    });

    it("dashboard.stats throws UNAUTHORIZED for unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.dashboard.stats()).rejects.toThrow();
    });

    it("search.global throws UNAUTHORIZED for unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.search.global({ query: "test" })).rejects.toThrow();
    });
  });

  describe("vehicles procedures - authenticated", () => {
    it("vehicles.list returns an array", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.vehicles.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("vehicles.create validates input", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      // Missing required fields should throw
      await expect(
        caller.vehicles.create({
          vanNumber: "",
          vin: "",
          year: 2024,
        } as any)
      ).rejects.toThrow();
    });
  });

  describe("shops procedures - authenticated", () => {
    it("shops.list returns an array", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.shops.list();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("maintenance procedures - authenticated", () => {
    it("maintenance.getServices returns seeded services", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.maintenance.getServices();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      // Check for known seeded service
      const oilChange = result.find(s => s.name === "Oil Change");
      expect(oilChange).toBeDefined();
      expect(oilChange?.intervalMiles).toBe(7500);
    });
  });

  describe("analytics procedures - authenticated", () => {
    it("analytics.monthlySpending returns an array", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.analytics.monthlySpending({ months: 12 });
      expect(Array.isArray(result)).toBe(true);
    });

    it("analytics.costByVehicle returns an array", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.analytics.costByVehicle();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

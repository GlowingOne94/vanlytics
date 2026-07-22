import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  alerts, Alert, InsertAlert,
  users, User, InsertUser,
  organizations, Organization, InsertOrganization,
  organizationMembers, OrganizationMember, InsertOrganizationMember,
  invites, Invite, InsertInvite,
  passwordResetTokens, PasswordResetToken, InsertPasswordResetToken,
  vehicles, Vehicle, InsertVehicle,
  repairs, Repair, InsertRepair,
  repairDocuments, RepairDocument, InsertRepairDocument,
  shops, Shop, InsertShop,
  maintenanceServices, MaintenanceService, InsertMaintenanceService,
  maintenanceRecords, MaintenanceRecord, InsertMaintenanceRecord,
  dotInspections, DotInspection, InsertDotInspection,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ ORGANIZATION HELPERS ============

export async function createOrganization(data: InsertOrganization): Promise<Organization> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(organizations).values(data);
  const insertId = result[0].insertId;
  const rows = await db.select().from(organizations).where(eq(organizations.id, insertId)).limit(1);
  return rows[0];
}

export async function getOrganizationBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  return result[0];
}

export async function getOrganizationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return result[0];
}

// ============ USER HELPERS ============

export async function createUser(data: InsertUser): Promise<User> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(users).values(data);
  const insertId = result[0].insertId;
  const rows = await db.select().from(users).where(eq(users.id, insertId)).limit(1);
  return rows[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function touchLastSignedIn(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

// ============ ORGANIZATION MEMBERSHIP HELPERS ============

export async function createOrganizationMember(data: InsertOrganizationMember): Promise<OrganizationMember> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(organizationMembers).values(data);
  const insertId = result[0].insertId;
  const rows = await db.select().from(organizationMembers).where(eq(organizationMembers.id, insertId)).limit(1);
  return rows[0];
}

// All organizations a user belongs to, with their role in each — used to
// build the org switcher and to validate which org a request can act on.
export async function getUserMemberships(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
      organizationName: organizations.name,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(organizationMembers.id);
}

// A user's role within one specific organization, or undefined if they
// aren't a member — the core check behind every organization-scoped request.
export async function getMembership(userId: number, organizationId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, organizationId)))
    .limit(1);
  return result[0];
}

export async function getOrganizationMembers(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: organizationMembers.role,
      joinedAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(organizationMembers.createdAt);
}

// ============ INVITE HELPERS ============

export async function createInvite(data: InsertInvite): Promise<Invite> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(invites).values(data);
  const insertId = result[0].insertId;
  const rows = await db.select().from(invites).where(eq(invites.id, insertId)).limit(1);
  return rows[0];
}

export async function getInviteByTokenHash(tokenHash: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(invites).where(eq(invites.tokenHash, tokenHash)).limit(1);
  return result[0];
}

export async function markInviteAccepted(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, id));
}

export async function getPendingInvites(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invites)
    .where(and(eq(invites.organizationId, organizationId), sql`${invites.acceptedAt} is null`))
    .orderBy(desc(invites.createdAt));
}

export async function getInviteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(invites).where(eq(invites.id, id)).limit(1);
  return result[0];
}

export async function deleteInvite(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(invites).where(eq(invites.id, id));
}

// ============ PASSWORD RESET HELPERS ============

export async function createPasswordResetToken(data: InsertPasswordResetToken): Promise<PasswordResetToken> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(passwordResetTokens).values(data);
  const insertId = result[0].insertId;
  const rows = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.id, insertId)).limit(1);
  return rows[0];
}

export async function getPasswordResetTokenByHash(tokenHash: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1);
  return result[0];
}

export async function markPasswordResetTokenUsed(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, id));
}

// ============ VEHICLE HELPERS ============
// Every query below is scoped to organizationId so tenants never see each other's data.

export async function getVehicles(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(vehicles).where(eq(vehicles.organizationId, organizationId)).orderBy(vehicles.vanNumber);
}

export async function getVehicleById(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.organizationId, organizationId))).limit(1);
  return result[0];
}

export async function createVehicle(organizationId: number, data: Omit<InsertVehicle, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vehicles).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

export async function updateVehicle(organizationId: number, id: number, data: Partial<InsertVehicle>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(vehicles).set(data).where(and(eq(vehicles.id, id), eq(vehicles.organizationId, organizationId)));
}

export async function deleteVehicle(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.organizationId, organizationId)));
}

// ============ REPAIR HELPERS ============

export async function getRepairs(organizationId: number, vehicleId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(repairs.organizationId, organizationId)];
  if (vehicleId) conditions.push(eq(repairs.vehicleId, vehicleId));
  return db.select().from(repairs).where(and(...conditions)).orderBy(desc(repairs.date));
}

export async function getRepairById(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(repairs)
    .where(and(eq(repairs.id, id), eq(repairs.organizationId, organizationId))).limit(1);
  return result[0];
}

export async function createRepair(organizationId: number, data: Omit<InsertRepair, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(repairs).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

export async function updateRepair(organizationId: number, id: number, data: Partial<InsertRepair>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(repairs).set(data).where(and(eq(repairs.id, id), eq(repairs.organizationId, organizationId)));
}

export async function deleteRepair(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(repairs).where(and(eq(repairs.id, id), eq(repairs.organizationId, organizationId)));
}

export async function getRepairDocuments(organizationId: number, repairId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(repairDocuments)
    .where(and(eq(repairDocuments.repairId, repairId), eq(repairDocuments.organizationId, organizationId)));
}

export async function createRepairDocument(organizationId: number, data: Omit<InsertRepairDocument, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(repairDocuments).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

export async function deleteRepairDocument(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(repairDocuments).where(and(eq(repairDocuments.id, id), eq(repairDocuments.organizationId, organizationId)));
}

// ============ SHOP HELPERS ============

export async function getShops(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shops).where(eq(shops.organizationId, organizationId)).orderBy(shops.name);
}

export async function getShopById(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(shops)
    .where(and(eq(shops.id, id), eq(shops.organizationId, organizationId))).limit(1);
  return result[0];
}

export async function createShop(organizationId: number, data: Omit<InsertShop, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(shops).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

export async function updateShop(organizationId: number, id: number, data: Partial<InsertShop>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(shops).set(data).where(and(eq(shops.id, id), eq(shops.organizationId, organizationId)));
}

export async function deleteShop(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(shops).where(and(eq(shops.id, id), eq(shops.organizationId, organizationId)));
}

// ============ MAINTENANCE HELPERS ============

export async function getMaintenanceServices(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(maintenanceServices)
    .where(eq(maintenanceServices.organizationId, organizationId))
    .orderBy(maintenanceServices.category, maintenanceServices.name);
}

export async function createMaintenanceService(organizationId: number, data: Omit<InsertMaintenanceService, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(maintenanceServices).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

export async function getMaintenanceRecords(organizationId: number, vehicleId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(maintenanceRecords.organizationId, organizationId)];
  if (vehicleId) conditions.push(eq(maintenanceRecords.vehicleId, vehicleId));
  return db.select().from(maintenanceRecords).where(and(...conditions)).orderBy(desc(maintenanceRecords.completedAt));
}

export async function createMaintenanceRecord(organizationId: number, data: Omit<InsertMaintenanceRecord, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(maintenanceRecords).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

export async function deleteMaintenanceRecord(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(maintenanceRecords).where(and(eq(maintenanceRecords.id, id), eq(maintenanceRecords.organizationId, organizationId)));
}

// The most recently completed record per (vehicleId, serviceId) pair — the
// basis for computing what's next due, overdue, or never logged.
export async function getLatestMaintenanceByVehicleAndService(organizationId: number) {
  const all = await getMaintenanceRecords(organizationId);
  const latest = new Map<string, MaintenanceRecord>();
  for (const r of all) {
    const key = `${r.vehicleId}-${r.serviceId}`;
    const existing = latest.get(key);
    if (!existing || r.completedAt > existing.completedAt) {
      latest.set(key, r);
    }
  }
  return Object.fromEntries(latest);
}

// ============ DOT INSPECTION HELPERS ============

export async function getDotInspections(organizationId: number, vehicleId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(dotInspections.organizationId, organizationId)];
  if (vehicleId) conditions.push(eq(dotInspections.vehicleId, vehicleId));
  return db.select().from(dotInspections).where(and(...conditions)).orderBy(desc(dotInspections.inspectionDate));
}

export async function createDotInspection(organizationId: number, data: Omit<InsertDotInspection, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dotInspections).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

export async function deleteDotInspection(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dotInspections).where(and(eq(dotInspections.id, id), eq(dotInspections.organizationId, organizationId)));
}

// The most recent inspection per vehicle — what "current DOT status" means.
export async function getLatestDotInspectionByVehicle(organizationId: number) {
  const all = await getDotInspections(organizationId);
  const latest = new Map<number, DotInspection>();
  for (const r of all) {
    const existing = latest.get(r.vehicleId);
    if (!existing || r.inspectionDate > existing.inspectionDate) {
      latest.set(r.vehicleId, r);
    }
  }
  return Object.fromEntries(latest);
}

// ============ ALERT HELPERS ============

export async function getAlerts(organizationId: number, opts?: { unreadOnly?: boolean; vehicleId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(alerts.organizationId, organizationId), eq(alerts.isDismissed, "no")];
  if (opts?.unreadOnly) conditions.push(eq(alerts.isRead, "no"));
  if (opts?.vehicleId) conditions.push(eq(alerts.vehicleId, opts.vehicleId));
  return db.select().from(alerts).where(and(...conditions)).orderBy(desc(alerts.createdAt));
}

export async function createAlert(organizationId: number, data: Omit<InsertAlert, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(alerts).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

export async function markAlertRead(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alerts).set({ isRead: "yes" }).where(and(eq(alerts.id, id), eq(alerts.organizationId, organizationId)));
}

export async function dismissAlert(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alerts).set({ isDismissed: "yes" }).where(and(eq(alerts.id, id), eq(alerts.organizationId, organizationId)));
}

// ============ DASHBOARD / ANALYTICS HELPERS ============

export async function getDashboardStats(organizationId: number) {
  const db = await getDb();
  if (!db) return null;

  const now = Date.now();
  const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const org = eq(vehicles.organizationId, organizationId);

  const [
    allVehicles,
    allRepairs,
    allShops,
    unreadAlerts,
    overdueRecords,
  ] = await Promise.all([
    db.select().from(vehicles).where(eq(vehicles.organizationId, organizationId)),
    db.select().from(repairs).where(and(eq(repairs.organizationId, organizationId), gte(repairs.date, oneYearAgo))),
    db.select().from(shops).where(eq(shops.organizationId, organizationId)),
    db.select().from(alerts).where(and(eq(alerts.organizationId, organizationId), eq(alerts.isRead, "no"), eq(alerts.isDismissed, "no"))),
    db.select().from(maintenanceRecords).where(and(eq(maintenanceRecords.organizationId, organizationId), lte(maintenanceRecords.nextDueDate, thirtyDaysFromNow))),
  ]);

  const fleetSize = allVehicles.length;
  const vehiclesDown = allVehicles.filter(v => v.status === "down" || v.status === "at_shop").length;
  const activeVehicles = allVehicles.filter(v => v.status === "active").length;

  const totalRepairCostYear = allRepairs.reduce((sum, r) => sum + parseFloat(r.totalCost || "0"), 0);
  const avgMonthlyRepairCost = totalRepairCostYear / 12;

  // Shop reliability - based on repair success rate
  const shopRepairCounts: Record<number, { total: number; successful: number; name: string }> = {};
  for (const r of allRepairs) {
    if (r.shopId) {
      if (!shopRepairCounts[r.shopId]) {
        const shop = allShops.find(s => s.id === r.shopId);
        shopRepairCounts[r.shopId] = { total: 0, successful: 0, name: shop?.name || "Unknown" };
      }
      shopRepairCounts[r.shopId].total++;
      if (r.repairSuccessful === "yes") shopRepairCounts[r.shopId].successful++;
    }
  }

  const shopScores = Object.entries(shopRepairCounts).map(([id, data]) => ({
    id: parseInt(id),
    name: data.name,
    successRate: data.total > 0 ? data.successful / data.total : 0,
  })).sort((a, b) => b.successRate - a.successRate);

  const mostReliableShop = shopScores[0]?.name || "N/A";
  const leastReliableShop = shopScores[shopScores.length - 1]?.name || "N/A";

  // Vehicle costs
  const vehicleCosts: Record<number, { vanNumber: string; total: number }> = {};
  for (const r of allRepairs) {
    if (!vehicleCosts[r.vehicleId]) {
      const v = allVehicles.find(v => v.id === r.vehicleId);
      vehicleCosts[r.vehicleId] = { vanNumber: v?.vanNumber || "Unknown", total: 0 };
    }
    vehicleCosts[r.vehicleId].total += parseFloat(r.totalCost || "0");
  }
  const topCostVehicles = Object.values(vehicleCosts).sort((a, b) => b.total - a.total).slice(0, 5);

  // Vehicles due for service: unique vehicles with maintenance due within 30 days
  const vehiclesDueForService = new Set(overdueRecords.map(r => r.vehicleId)).size;

  return {
    fleetSize,
    activeVehicles,
    vehiclesDown,
    vehiclesDueForService,
    totalRepairCostYear: Math.round(totalRepairCostYear * 100) / 100,
    avgMonthlyRepairCost: Math.round(avgMonthlyRepairCost * 100) / 100,
    mostReliableShop,
    leastReliableShop,
    topCostVehicles,
    unreadAlertCount: unreadAlerts.length,
    repairsThisYear: allRepairs.length,
  };
}

export async function getUpcomingMaintenance(organizationId: number) {
  const db = await getDb();
  if (!db) return [];

  const now = Date.now();
  const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

  const records = await db.select().from(maintenanceRecords)
    .where(and(
      eq(maintenanceRecords.organizationId, organizationId),
      lte(maintenanceRecords.nextDueDate, thirtyDaysFromNow),
      gte(maintenanceRecords.nextDueDate, now - 7 * 24 * 60 * 60 * 1000) // include slightly overdue
    ))
    .orderBy(maintenanceRecords.nextDueDate);

  return records;
}

export async function getRepairsByDateRange(organizationId: number, startDate: number, endDate: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(repairs)
    .where(and(eq(repairs.organizationId, organizationId), gte(repairs.date, startDate), lte(repairs.date, endDate)))
    .orderBy(desc(repairs.date));
}

// ============ SEARCH HELPER ============

export async function globalSearch(organizationId: number, query: string) {
  const db = await getDb();
  if (!db) return { vehicles: [], repairs: [], shops: [] };

  const searchPattern = `%${query}%`;

  const [matchedVehicles, matchedRepairs, matchedShops] = await Promise.all([
    db.select().from(vehicles).where(
      and(
        eq(vehicles.organizationId, organizationId),
        or(
          like(vehicles.vanNumber, searchPattern),
          like(vehicles.vin, searchPattern),
          like(vehicles.licensePlate, searchPattern),
          like(vehicles.assignedDriver, searchPattern),
        ),
      )
    ).limit(20),
    db.select().from(repairs).where(
      and(
        eq(repairs.organizationId, organizationId),
        or(
          like(repairs.complaint, searchPattern),
          like(repairs.diagnosis, searchPattern),
          like(repairs.mechanic, searchPattern),
          like(repairs.category, searchPattern),
        ),
      )
    ).limit(20),
    db.select().from(shops).where(
      and(
        eq(shops.organizationId, organizationId),
        or(
          like(shops.name, searchPattern),
          like(shops.address, searchPattern),
          like(shops.contactPerson, searchPattern),
        ),
      )
    ).limit(20),
  ]);

  return { vehicles: matchedVehicles, repairs: matchedRepairs, shops: matchedShops };
}

// ============ INTELLIGENT REPEAT REPAIR DETECTION ============

export async function checkRepeatRepairs(organizationId: number, vehicleId: number, category?: string, partsReplaced?: string[]) {
  const db = await getDb();
  if (!db) return [];

  const warnings: { type: string; message: string }[] = [];
  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

  // Get recent repairs for this vehicle
  const recentRepairs = await db.select().from(repairs)
    .where(and(eq(repairs.organizationId, organizationId), eq(repairs.vehicleId, vehicleId), gte(repairs.date, oneYearAgo)))
    .orderBy(desc(repairs.date));

  if (!category && (!partsReplaced || partsReplaced.length === 0)) return warnings;

  // Check for same category repairs within warranty/expected lifespan
  if (category) {
    const sameCategoryRepairs = recentRepairs.filter(r => r.category === category);
    if (sameCategoryRepairs.length > 0) {
      const lastRepair = sameCategoryRepairs[0];
      const daysSince = Math.floor((now - lastRepair.date) / (1000 * 60 * 60 * 24));

      // If within warranty period, flag it
      if (lastRepair.warrantyExpiry && lastRepair.warrantyExpiry > now) {
        warnings.push({
          type: "warranty_active",
          message: `This ${category} repair was done ${daysSince} days ago and is still under warranty (expires ${new Date(lastRepair.warrantyExpiry).toLocaleDateString()}). Verify warranty before approving payment.`,
        });
      } else if (daysSince < 180) {
        warnings.push({
          type: "repeat_repair",
          message: `A ${category} repair was performed ${daysSince} days ago. This may indicate the previous repair was unsuccessful or a deeper issue exists.`,
        });
      }
    }
  }

  // Check for specific part-based intelligence
  if (partsReplaced) {
    for (const part of partsReplaced) {
      const partLower = part.toLowerCase();

      // AC Compressor intelligence
      if (partLower.includes("compressor") || partLower.includes("ac compressor")) {
        const prevCompressor = recentRepairs.find(r =>
          r.partsReplaced?.some(p => p.toLowerCase().includes("compressor"))
        );
        if (prevCompressor) {
          const days = Math.floor((now - prevCompressor.date) / (1000 * 60 * 60 * 24));
          warnings.push({
            type: "repeat_part",
            message: `AC Compressor was replaced ${days} days ago. Recommend performing a leak test before installing a new compressor.`,
          });
        }
      }

      // Battery intelligence
      if (partLower.includes("battery")) {
        const prevBattery = recentRepairs.find(r =>
          r.partsReplaced?.some(p => p.toLowerCase().includes("battery"))
        );
        if (prevBattery) {
          warnings.push({
            type: "diagnostic_suggestion",
            message: `Battery was recently replaced. Suggest testing the charging system (alternator) before replacing the battery again.`,
          });
        }
      }

      // Alternator intelligence
      if (partLower.includes("alternator")) {
        warnings.push({
          type: "diagnostic_suggestion",
          message: `When replacing the alternator, recommend also performing a battery load test to ensure the battery wasn't damaged by the failing alternator.`,
        });
      }

      // Radiator intelligence
      if (partLower.includes("radiator")) {
        const prevRadiator = recentRepairs.find(r =>
          r.partsReplaced?.some(p => p.toLowerCase().includes("radiator"))
        );
        if (prevRadiator) {
          warnings.push({
            type: "repeat_part",
            message: `Radiator was previously replaced. Investigate root cause (overheating, coolant contamination) before replacing again.`,
          });
        }
      }

      // Refrigerant/AC recharge intelligence
      if (partLower.includes("refrigerant") || partLower.includes("freon") || partLower.includes("recharge")) {
        const prevRecharges = recentRepairs.filter(r =>
          r.partsReplaced?.some(p =>
            p.toLowerCase().includes("refrigerant") || p.toLowerCase().includes("recharge")
          )
        );
        if (prevRecharges.length >= 2) {
          warnings.push({
            type: "pattern_detected",
            message: `This vehicle has received refrigerant ${prevRecharges.length} times without a documented leak repair. A proper leak test and repair is recommended.`,
          });
        }
      }
    }
  }

  return warnings;
}

// ============ AUTOMATED ALERT GENERATION ============

export async function generateAlerts(organizationId: number) {
  const db = await getDb();
  if (!db) return { generated: 0 };

  const now = Date.now();
  const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;
  let generated = 0;

  // 1. Maintenance due alerts
  const overdueRecords = await db.select().from(maintenanceRecords)
    .where(and(eq(maintenanceRecords.organizationId, organizationId), lte(maintenanceRecords.nextDueDate, thirtyDaysFromNow)));

  const allVehicles = await db.select().from(vehicles).where(eq(vehicles.organizationId, organizationId));
  const allServices = await db.select().from(maintenanceServices).where(eq(maintenanceServices.organizationId, organizationId));

  for (const record of overdueRecords) {
    const vehicle = allVehicles.find(v => v.id === record.vehicleId);
    const service = allServices.find(s => s.id === record.serviceId);
    if (!vehicle || !service) continue;

    // Check if alert already exists for this
    const existing = await db.select().from(alerts).where(and(
      eq(alerts.organizationId, organizationId),
      eq(alerts.vehicleId, record.vehicleId),
      eq(alerts.type, "maintenance_due"),
      eq(alerts.isDismissed, "no"),
      like(alerts.title, `%${service.name}%`),
    )).limit(1);

    if (existing.length === 0) {
      const isOverdue = record.nextDueDate! < now;
      await db.insert(alerts).values({
        organizationId,
        vehicleId: record.vehicleId,
        type: "maintenance_due",
        title: `${service.name} ${isOverdue ? "overdue" : "due soon"} - Van ${vehicle.vanNumber}`,
        message: `${service.name} is ${isOverdue ? "overdue" : "due within 30 days"} for Van ${vehicle.vanNumber}. ${record.nextDueMileage ? `Due at ${record.nextDueMileage.toLocaleString()} miles.` : ""}`,
        severity: isOverdue ? "critical" : "warning",
      });
      generated++;
    }
  }

  // 2. Warranty expiring alerts
  const expiringRepairs = await db.select().from(repairs)
    .where(and(
      eq(repairs.organizationId, organizationId),
      gte(repairs.warrantyExpiry, now),
      lte(repairs.warrantyExpiry, thirtyDaysFromNow),
    ));

  for (const repair of expiringRepairs) {
    const vehicle = allVehicles.find(v => v.id === repair.vehicleId);
    if (!vehicle) continue;

    const existing = await db.select().from(alerts).where(and(
      eq(alerts.organizationId, organizationId),
      eq(alerts.vehicleId, repair.vehicleId),
      eq(alerts.type, "warranty_expiring"),
      eq(alerts.isDismissed, "no"),
      like(alerts.title, `%${repair.category || "Repair"}%`),
    )).limit(1);

    if (existing.length === 0) {
      const daysLeft = Math.floor((repair.warrantyExpiry! - now) / (1000 * 60 * 60 * 24));
      await db.insert(alerts).values({
        organizationId,
        vehicleId: repair.vehicleId,
        type: "warranty_expiring",
        title: `Warranty expiring - ${repair.category || "Repair"} on Van ${vehicle.vanNumber}`,
        message: `Warranty for ${repair.category || "a repair"} on Van ${vehicle.vanNumber} expires in ${daysLeft} days (${new Date(repair.warrantyExpiry!).toLocaleDateString()}).`,
        severity: daysLeft <= 7 ? "critical" : "warning",
      });
      generated++;
    }
  }

  // 3. High-cost vehicle alerts
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const yearRepairs = await db.select().from(repairs)
    .where(and(eq(repairs.organizationId, organizationId), gte(repairs.date, oneYearAgo)));

  const vehicleCosts: Record<number, number> = {};
  for (const r of yearRepairs) {
    vehicleCosts[r.vehicleId] = (vehicleCosts[r.vehicleId] || 0) + parseFloat(r.totalCost || "0");
  }

  const avgCost = Object.values(vehicleCosts).length > 0
    ? Object.values(vehicleCosts).reduce((a, b) => a + b, 0) / Object.values(vehicleCosts).length
    : 0;

  for (const [vehicleId, cost] of Object.entries(vehicleCosts)) {
    if (cost > avgCost * 2 && cost > 3000) {
      const vehicle = allVehicles.find(v => v.id === parseInt(vehicleId));
      if (!vehicle) continue;

      const existing = await db.select().from(alerts).where(and(
        eq(alerts.organizationId, organizationId),
        eq(alerts.vehicleId, parseInt(vehicleId)),
        eq(alerts.type, "high_cost"),
        eq(alerts.isDismissed, "no"),
      )).limit(1);

      if (existing.length === 0) {
        await db.insert(alerts).values({
          organizationId,
          vehicleId: parseInt(vehicleId),
          type: "high_cost",
          title: `High repair costs - Van ${vehicle.vanNumber}`,
          message: `Van ${vehicle.vanNumber} has cost $${cost.toLocaleString()} in repairs this year, which is ${Math.round(cost / avgCost * 100)}% of the fleet average. Consider whether continued repairs are cost-effective.`,
          severity: "warning",
        });
        generated++;
      }
    }
  }

  // 4. DOT inspection expiring alerts
  const latestDot = await getLatestDotInspectionByVehicle(organizationId);
  for (const inspection of Object.values(latestDot)) {
    const vehicle = allVehicles.find(v => v.id === inspection.vehicleId);
    if (!vehicle) continue;
    if (inspection.expiryDate > thirtyDaysFromNow) continue; // not due soon yet

    const existing = await db.select().from(alerts).where(and(
      eq(alerts.organizationId, organizationId),
      eq(alerts.vehicleId, inspection.vehicleId),
      eq(alerts.type, "dot_inspection_expiring"),
      eq(alerts.isDismissed, "no"),
    )).limit(1);

    if (existing.length === 0) {
      const isExpired = inspection.expiryDate < now;
      const daysLeft = Math.ceil((inspection.expiryDate - now) / (1000 * 60 * 60 * 24));
      await db.insert(alerts).values({
        organizationId,
        vehicleId: inspection.vehicleId,
        type: "dot_inspection_expiring",
        title: `DOT inspection ${isExpired ? "expired" : "expiring soon"} - Van ${vehicle.vanNumber}`,
        message: isExpired
          ? `Van ${vehicle.vanNumber}'s DOT inspection expired on ${new Date(inspection.expiryDate).toLocaleDateString()}.`
          : `Van ${vehicle.vanNumber}'s DOT inspection expires in ${daysLeft} days (${new Date(inspection.expiryDate).toLocaleDateString()}).`,
        severity: isExpired ? "critical" : "warning",
      });
      generated++;
    }
  }

  return { generated };
}

// ============ SHOP PERFORMANCE SCORING ============

export async function computeShopPerformance(organizationId: number) {
  const db = await getDb();
  if (!db) return [];

  const allRepairs = await db.select().from(repairs).where(eq(repairs.organizationId, organizationId));
  const allShops = await db.select().from(shops).where(eq(shops.organizationId, organizationId));

  const shopStats: Record<number, {
    name: string;
    totalRepairs: number;
    successfulRepairs: number;
    totalCost: number;
    repeatRepairs: number;
    avgTurnaround: number;
  }> = {};

  for (const shop of allShops) {
    shopStats[shop.id] = {
      name: shop.name,
      totalRepairs: 0,
      successfulRepairs: 0,
      totalCost: 0,
      repeatRepairs: 0,
      avgTurnaround: 0,
    };
  }

  // Compute stats
  for (const r of allRepairs) {
    if (r.shopId && shopStats[r.shopId]) {
      shopStats[r.shopId].totalRepairs++;
      shopStats[r.shopId].totalCost += parseFloat(r.totalCost || "0");
      if (r.repairSuccessful === "yes") shopStats[r.shopId].successfulRepairs++;
    }
  }

  // Detect repeat repairs per shop (same vehicle + same category within 6 months)
  for (const r of allRepairs) {
    if (!r.shopId || !r.category) continue;
    const relatedRepairs = allRepairs.filter(
      other => other.id !== r.id &&
        other.vehicleId === r.vehicleId &&
        other.category === r.category &&
        Math.abs(other.date - r.date) < 180 * 24 * 60 * 60 * 1000 &&
        other.date < r.date
    );
    if (relatedRepairs.length > 0 && shopStats[r.shopId]) {
      shopStats[r.shopId].repeatRepairs++;
    }
  }

  // Compute overall fleet average cost per repair
  const totalFleetCost = allRepairs.reduce((sum, r) => sum + parseFloat(r.totalCost || "0"), 0);
  const fleetAvgCost = allRepairs.length > 0 ? totalFleetCost / allRepairs.length : 0;

  return Object.entries(shopStats).map(([id, stats]) => {
    const successRate = stats.totalRepairs > 0 ? stats.successfulRepairs / stats.totalRepairs : 0;
    const avgCost = stats.totalRepairs > 0 ? stats.totalCost / stats.totalRepairs : 0;
    const repeatRate = stats.totalRepairs > 0 ? stats.repeatRepairs / stats.totalRepairs : 0;

    // Score: 0-100 (higher is better)
    const successScore = successRate * 40; // 40% weight
    const costScore = fleetAvgCost > 0 ? Math.max(0, (1 - (avgCost - fleetAvgCost) / fleetAvgCost)) * 30 : 30; // 30% weight
    const repeatScore = (1 - repeatRate) * 30; // 30% weight

    const overallScore = Math.round(Math.min(100, Math.max(0, successScore + costScore + repeatScore)));

    return {
      shopId: parseInt(id),
      name: stats.name,
      totalRepairs: stats.totalRepairs,
      successRate: Math.round(successRate * 100),
      avgCost: Math.round(avgCost * 100) / 100,
      repeatRepairs: stats.repeatRepairs,
      costVsFleetAvg: fleetAvgCost > 0 ? Math.round(((avgCost - fleetAvgCost) / fleetAvgCost) * 100) : 0,
      overallScore,
    };
  }).sort((a, b) => b.overallScore - a.overallScore);
}

// ============ COST ANALYTICS HELPERS ============

export async function getPartsVsLaborBreakdown(organizationId: number) {
  const db = await getDb();
  if (!db) return { totalParts: 0, totalLabor: 0, totalTax: 0 };

  const allRepairs = await db.select().from(repairs).where(eq(repairs.organizationId, organizationId));
  let totalParts = 0, totalLabor = 0, totalTax = 0;
  for (const r of allRepairs) {
    totalParts += parseFloat(r.partsCost || "0");
    totalLabor += parseFloat(r.laborCost || "0");
    totalTax += parseFloat(r.tax || "0");
  }
  return {
    totalParts: Math.round(totalParts * 100) / 100,
    totalLabor: Math.round(totalLabor * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
  };
}

export async function getRepairFrequencyTrends(organizationId: number, months: number = 12) {
  const db = await getDb();
  if (!db) return [];

  const now = Date.now();
  const startDate = now - months * 30 * 24 * 60 * 60 * 1000;
  const allRepairs = await db.select().from(repairs)
    .where(and(eq(repairs.organizationId, organizationId), gte(repairs.date, startDate)));

  const monthlyMap: Record<string, number> = {};
  for (const r of allRepairs) {
    const date = new Date(r.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap[key] = (monthlyMap[key] || 0) + 1;
  }

  return Object.entries(monthlyMap).map(([month, count]) => ({
    month,
    count,
  })).sort((a, b) => a.month.localeCompare(b.month));
}

export async function getCostPerMile(organizationId: number) {
  const db = await getDb();
  if (!db) return [];

  const allVehicles = await db.select().from(vehicles).where(eq(vehicles.organizationId, organizationId));
  const allRepairs = await db.select().from(repairs).where(eq(repairs.organizationId, organizationId));

  const vehicleCosts: Record<number, number> = {};
  for (const r of allRepairs) {
    vehicleCosts[r.vehicleId] = (vehicleCosts[r.vehicleId] || 0) + parseFloat(r.totalCost || "0");
  }

  return allVehicles
    .filter(v => v.mileage > 0 && vehicleCosts[v.id])
    .map(v => ({
      vehicleId: v.id,
      vanNumber: v.vanNumber,
      mileage: v.mileage,
      totalCost: vehicleCosts[v.id] || 0,
      costPerMile: Math.round(((vehicleCosts[v.id] || 0) / v.mileage) * 10000) / 10000,
    }))
    .sort((a, b) => b.costPerMile - a.costPerMile);
}

export async function getAverageRepairPricing(organizationId: number) {
  const db = await getDb();
  if (!db) return [];

  const allRepairs = await db.select().from(repairs).where(eq(repairs.organizationId, organizationId));
  const categoryPricing: Record<string, { totalCost: number; count: number; parts: number; labor: number }> = {};

  for (const r of allRepairs) {
    const cat = r.category || "Uncategorized";
    if (!categoryPricing[cat]) categoryPricing[cat] = { totalCost: 0, count: 0, parts: 0, labor: 0 };
    categoryPricing[cat].totalCost += parseFloat(r.totalCost || "0");
    categoryPricing[cat].parts += parseFloat(r.partsCost || "0");
    categoryPricing[cat].labor += parseFloat(r.laborCost || "0");
    categoryPricing[cat].count++;
  }

  return Object.entries(categoryPricing).map(([category, data]) => ({
    category,
    avgTotal: Math.round((data.totalCost / data.count) * 100) / 100,
    avgParts: Math.round((data.parts / data.count) * 100) / 100,
    avgLabor: Math.round((data.labor / data.count) * 100) / 100,
    count: data.count,
  })).sort((a, b) => b.count - a.count);
}

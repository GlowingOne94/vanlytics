import { and, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
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
  drivers, Driver, InsertDriver,
  driverMedicalCerts, DriverMedicalCert, InsertDriverMedicalCert,
  driverAbstracts, DriverAbstract, InsertDriverAbstract,
  driverDocuments, DriverDocument, InsertDriverDocument,
  routeImports, RouteImport, InsertRouteImport,
  trips, Trip, InsertTrip,
  tripStatusEvents, TripStatusEvent, InsertTripStatusEvent,
  driverPairingCodes, DriverPairingCode, InsertDriverPairingCode,
  driverDevices, DriverDevice, InsertDriverDevice,
  driverShifts, DriverShift, InsertDriverShift,
  driverLocations, DriverLocation, InsertDriverLocation,
  tollImports, TollImport, InsertTollImport,
  tollTransactions, TollTransaction, InsertTollTransaction,
  parts, Part, InsertPart,
  gasImports, GasImport, InsertGasImport,
  gasUsageRecords, GasUsageRecord, InsertGasUsageRecord,
  partInvoices, PartInvoice, InsertPartInvoice,
  partInvoiceDocuments, PartInvoiceDocument, InsertPartInvoiceDocument,
  partUsages, PartUsage, InsertPartUsage,
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

export async function getOrganizationByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(organizations).where(eq(organizations.organizationCode, code)).limit(1);
  return result[0];
}

export async function setOrganizationCode(organizationId: number, code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(organizations).set({ organizationCode: code }).where(eq(organizations.id, organizationId));
}

export async function getOrganizationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return result[0];
}

export async function updateOrganizationSettings(
  organizationId: number,
  data: { name?: string; industryType?: "nemt" | "other"; enabledModules?: { driverMedical?: boolean } }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(organizations).set(data).where(eq(organizations.id, organizationId));
}

export async function updateOrganizationBilling(
  organizationId: number,
  data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionStatus?: string;
    planTier?: "none" | "starter" | "fleet" | "fleet_pro" | "enterprise";
    billingInterval?: "month" | "quarter" | "year";
    extraVehicleSlots?: number;
    stripeExtraVehicleSubscriptionId?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(organizations).set(data).where(eq(organizations.id, organizationId));
}

export async function getOrganizationByStripeCustomerId(stripeCustomerId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(organizations).where(eq(organizations.stripeCustomerId, stripeCustomerId)).limit(1);
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

// How many companies this user already administers, and their plan tiers —
// used to decide whether they're allowed to create another one. Only
// counts companies where they're an admin (not a read-only Member of
// someone else's company), since that's what "owning" a company means here.
export async function getUserAdminOrgTiers(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      organizationId: organizationMembers.organizationId,
      planTier: organizations.planTier,
      isGrandfathered: organizations.isGrandfathered,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.role, "admin")));
  return rows;
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

// Strips an optional leading "van" word (any case/spacing) so "Van 68" and
// "68" both normalize to the same thing for matching against vanNumber.
const normalizeVanNickname = (s: string) => s.trim().replace(/^van\s*/i, "").toUpperCase();

export async function createRepairsBulk(
  organizationId: number,
  rows: { carNickname: string; category?: string; date: number; totalCost: number; mileage?: number; complaint?: string }[],
) {
  const vehicles = await getVehicles(organizationId);
  const byVanNumber = new Map(vehicles.map(v => [normalizeVanNickname(v.vanNumber), v]));

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const toInsert: (Omit<InsertRepair, "organizationId">)[] = [];
  const unmatchedNicknames: string[] = [];

  for (const row of rows) {
    const vehicle = byVanNumber.get(normalizeVanNickname(row.carNickname));
    if (!vehicle) {
      unmatchedNicknames.push(row.carNickname);
      continue;
    }
    toInsert.push({
      vehicleId: vehicle.id,
      date: row.date,
      mileage: row.mileage && row.mileage > 0 ? row.mileage : null,
      complaint: row.complaint || undefined,
      category: row.category || undefined,
      totalCost: String(row.totalCost),
    });
  }

  if (toInsert.length > 0) {
    await db.insert(repairs).values(toInsert.map(r => ({ ...r, organizationId })));
  }

  return { imported: toInsert.length, skipped: unmatchedNicknames.length, unmatchedNicknames: Array.from(new Set(unmatchedNicknames)) };
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

export async function updateDotInspection(organizationId: number, id: number, data: Partial<InsertDotInspection>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dotInspections).set(data).where(and(eq(dotInspections.id, id), eq(dotInspections.organizationId, organizationId)));
}

export async function getDotInspectionBySourceRepairId(organizationId: number, repairId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(dotInspections)
    .where(and(eq(dotInspections.organizationId, organizationId), eq(dotInspections.sourceRepairId, repairId)))
    .limit(1);
  return result[0];
}

// ============ DRIVER HELPERS ============

export async function getDrivers(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(drivers).where(eq(drivers.organizationId, organizationId)).orderBy(drivers.name);
}

export async function getDriverById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(drivers).where(eq(drivers.id, id)).limit(1);
  return result[0];
}

export async function createDriver(organizationId: number, data: Omit<InsertDriver, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(drivers).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

export async function updateDriver(organizationId: number, id: number, data: Partial<InsertDriver>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(drivers).set(data).where(and(eq(drivers.id, id), eq(drivers.organizationId, organizationId)));
}

export async function deleteDriver(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(drivers).where(and(eq(drivers.id, id), eq(drivers.organizationId, organizationId)));
}

// ============ DRIVER MEDICAL CERT HELPERS ============

export async function getDriverMedicalCerts(organizationId: number, driverId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(driverMedicalCerts.organizationId, organizationId)];
  if (driverId) conditions.push(eq(driverMedicalCerts.driverId, driverId));
  return db.select().from(driverMedicalCerts).where(and(...conditions)).orderBy(desc(driverMedicalCerts.examDate));
}

export async function createDriverMedicalCert(organizationId: number, data: Omit<InsertDriverMedicalCert, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(driverMedicalCerts).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

export async function updateDriverMedicalCert(organizationId: number, id: number, data: Partial<InsertDriverMedicalCert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(driverMedicalCerts).set(data).where(and(eq(driverMedicalCerts.id, id), eq(driverMedicalCerts.organizationId, organizationId)));
}

export async function deleteDriverMedicalCert(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(driverMedicalCerts).where(and(eq(driverMedicalCerts.id, id), eq(driverMedicalCerts.organizationId, organizationId)));
}

// The most recent medical cert per driver — what "current medical status" means.
export async function getLatestMedicalCertByDriver(organizationId: number) {
  const all = await getDriverMedicalCerts(organizationId);
  const latest = new Map<number, DriverMedicalCert>();
  for (const r of all) {
    const existing = latest.get(r.driverId);
    if (!existing || r.examDate > existing.examDate) {
      latest.set(r.driverId, r);
    }
  }
  return Object.fromEntries(latest);
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

// ============ DRIVER ABSTRACT HELPERS ============

export async function getDriverAbstracts(organizationId: number, driverId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(driverAbstracts.organizationId, organizationId)];
  if (driverId) conditions.push(eq(driverAbstracts.driverId, driverId));
  return db.select().from(driverAbstracts).where(and(...conditions)).orderBy(desc(driverAbstracts.pulledDate));
}

export async function createDriverAbstract(organizationId: number, data: Omit<InsertDriverAbstract, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(driverAbstracts).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

export async function updateDriverAbstract(organizationId: number, id: number, data: Partial<InsertDriverAbstract>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(driverAbstracts).set(data).where(and(eq(driverAbstracts.id, id), eq(driverAbstracts.organizationId, organizationId)));
}

export async function deleteDriverAbstract(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(driverAbstracts).where(and(eq(driverAbstracts.id, id), eq(driverAbstracts.organizationId, organizationId)));
}

// The most recent abstract pull per driver — what "current abstract status" means.
export async function getLatestAbstractByDriver(organizationId: number) {
  const all = await getDriverAbstracts(organizationId);
  const latest = new Map<number, DriverAbstract>();
  for (const r of all) {
    const existing = latest.get(r.driverId);
    if (!existing || r.pulledDate > existing.pulledDate) {
      latest.set(r.driverId, r);
    }
  }
  return Object.fromEntries(latest);
}

// ============ DRIVER DOCUMENT LIBRARY HELPERS ============

export async function getDriverDocuments(organizationId: number, driverId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(driverDocuments.organizationId, organizationId)];
  if (driverId) conditions.push(eq(driverDocuments.driverId, driverId));
  return db.select().from(driverDocuments)
    .where(and(...conditions))
    .orderBy(desc(driverDocuments.year), desc(driverDocuments.createdAt));
}

export async function createDriverDocument(organizationId: number, data: Omit<InsertDriverDocument, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(driverDocuments).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

export async function deleteDriverDocument(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(driverDocuments).where(and(eq(driverDocuments.id, id), eq(driverDocuments.organizationId, organizationId)));
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

export async function dismissAllAlerts(organizationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alerts).set({ isDismissed: "yes" }).where(and(eq(alerts.organizationId, organizationId), eq(alerts.isDismissed, "no")));
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

  // 1b. Insurance & registration expiring alerts
  for (const vehicle of allVehicles) {
    const checks: { field: "insuranceExpiry" | "registrationExpiry"; type: "insurance_expiring" | "registration_expiring"; label: string }[] = [
      { field: "insuranceExpiry", type: "insurance_expiring", label: "Insurance" },
      { field: "registrationExpiry", type: "registration_expiring", label: "Registration" },
    ];

    for (const check of checks) {
      const expiry = vehicle[check.field];
      if (!expiry || expiry > thirtyDaysFromNow) continue;

      const existing = await db.select().from(alerts).where(and(
        eq(alerts.organizationId, organizationId),
        eq(alerts.vehicleId, vehicle.id),
        eq(alerts.type, check.type),
        eq(alerts.isDismissed, "no"),
      )).limit(1);

      if (existing.length === 0) {
        const isExpired = expiry < now;
        const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        await db.insert(alerts).values({
          organizationId,
          vehicleId: vehicle.id,
          type: check.type,
          title: `${check.label} ${isExpired ? "expired" : "expiring soon"} - Van ${vehicle.vanNumber}`,
          message: isExpired
            ? `Van ${vehicle.vanNumber}'s ${check.label.toLowerCase()} expired on ${new Date(expiry).toLocaleDateString()}.`
            : `Van ${vehicle.vanNumber}'s ${check.label.toLowerCase()} expires in ${daysLeft} days (${new Date(expiry).toLocaleDateString()}).`,
          severity: isExpired ? "critical" : "warning",
        });
        generated++;
      }
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

  // 5. Driver medical cert expiring alerts
  const allDrivers = await getDrivers(organizationId);
  const latestMedical = await getLatestMedicalCertByDriver(organizationId);
  for (const cert of Object.values(latestMedical)) {
    const driver = allDrivers.find(d => d.id === cert.driverId);
    if (!driver || driver.status !== "active") continue;
    if (cert.expiryDate > thirtyDaysFromNow) continue;

    const existing = await db.select().from(alerts).where(and(
      eq(alerts.organizationId, organizationId),
      eq(alerts.type, "medical_cert_expiring"),
      eq(alerts.isDismissed, "no"),
      like(alerts.title, `%${driver.name}%`),
    )).limit(1);

    if (existing.length === 0) {
      const isExpired = cert.expiryDate < now;
      const daysLeft = Math.ceil((cert.expiryDate - now) / (1000 * 60 * 60 * 24));
      await db.insert(alerts).values({
        organizationId,
        vehicleId: null,
        type: "medical_cert_expiring",
        title: `Medical cert ${isExpired ? "expired" : "expiring soon"} - ${driver.name}`,
        message: isExpired
          ? `${driver.name}'s DOT medical certificate expired on ${new Date(cert.expiryDate).toLocaleDateString()}.`
          : `${driver.name}'s DOT medical certificate expires in ${daysLeft} days (${new Date(cert.expiryDate).toLocaleDateString()}).`,
        severity: isExpired ? "critical" : "warning",
      });
      generated++;
    }
  }

  // 6. CDL expiring alerts
  for (const driver of allDrivers) {
    if (driver.status !== "active" || !driver.cdlExpiry) continue;
    if (driver.cdlExpiry > thirtyDaysFromNow) continue;

    const existing = await db.select().from(alerts).where(and(
      eq(alerts.organizationId, organizationId),
      eq(alerts.type, "cdl_expiring"),
      eq(alerts.isDismissed, "no"),
      like(alerts.title, `%${driver.name}%`),
    )).limit(1);

    if (existing.length === 0) {
      const isExpired = driver.cdlExpiry < now;
      const daysLeft = Math.ceil((driver.cdlExpiry - now) / (1000 * 60 * 60 * 24));
      await db.insert(alerts).values({
        organizationId,
        vehicleId: null,
        type: "cdl_expiring",
        title: `CDL ${isExpired ? "expired" : "expiring soon"} - ${driver.name}`,
        message: isExpired
          ? `${driver.name}'s CDL expired on ${new Date(driver.cdlExpiry).toLocaleDateString()}.`
          : `${driver.name}'s CDL expires in ${daysLeft} days (${new Date(driver.cdlExpiry).toLocaleDateString()}).`,
        severity: isExpired ? "critical" : "warning",
      });
      generated++;
    }
  }

  // 7. Driver abstract (MVR) due alerts
  const latestAbstract = await getLatestAbstractByDriver(organizationId);
  for (const driver of allDrivers) {
    if (driver.status !== "active") continue;
    const abstract = latestAbstract[driver.id];
    if (!abstract || abstract.nextDueDate > thirtyDaysFromNow) continue;

    const existing = await db.select().from(alerts).where(and(
      eq(alerts.organizationId, organizationId),
      eq(alerts.type, "abstract_due"),
      eq(alerts.isDismissed, "no"),
      like(alerts.title, `%${driver.name}%`),
    )).limit(1);

    if (existing.length === 0) {
      const isOverdue = abstract.nextDueDate < now;
      const daysLeft = Math.ceil((abstract.nextDueDate - now) / (1000 * 60 * 60 * 24));
      await db.insert(alerts).values({
        organizationId,
        vehicleId: null,
        type: "abstract_due",
        title: `Driver abstract ${isOverdue ? "overdue" : "due soon"} - ${driver.name}`,
        message: isOverdue
          ? `${driver.name}'s driving record (MVR) review was due on ${new Date(abstract.nextDueDate).toLocaleDateString()}.`
          : `${driver.name}'s driving record (MVR) review is due in ${daysLeft} days (${new Date(abstract.nextDueDate).toLocaleDateString()}).`,
        severity: isOverdue ? "critical" : "warning",
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

// ============ ROUTE PLANNING HELPERS ============

export async function createRouteImport(organizationId: number, data: Omit<InsertRouteImport, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(routeImports).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

export async function getRouteImports(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(routeImports).where(eq(routeImports.organizationId, organizationId)).orderBy(desc(routeImports.createdAt));
}

export async function createTripsBulk(organizationId: number, importId: number | null, rows: Omit<InsertTrip, "organizationId" | "importId">[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (rows.length === 0) return { count: 0 };
  await db.insert(trips).values(rows.map(r => ({ ...r, organizationId, importId })));
  return { count: rows.length };
}

export async function getTripsByDate(organizationId: number, tripDate: number) {
  const db = await getDb();
  if (!db) return [];
  // tripDate is a day boundary; match anything within that calendar day.
  const dayStart = new Date(tripDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return db.select().from(trips)
    .where(and(
      eq(trips.organizationId, organizationId),
      gte(trips.tripDate, dayStart.getTime()),
      sql`${trips.tripDate} < ${dayEnd.getTime()}`,
    ))
    .orderBy(trips.pickupTime);
}

export async function getTripById(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.organizationId, organizationId))).limit(1);
  return result[0];
}

export async function updateTrip(organizationId: number, id: number, data: Partial<InsertTrip>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(trips).set(data).where(and(eq(trips.id, id), eq(trips.organizationId, organizationId)));
}

export async function deleteTrip(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(trips).where(and(eq(trips.id, id), eq(trips.organizationId, organizationId)));
}

export async function logTripStatusEvent(organizationId: number, data: Omit<InsertTripStatusEvent, "organizationId">) {
  const db = await getDb();
  if (!db) return;
  await db.insert(tripStatusEvents).values({ ...data, organizationId });
}

export async function getTripStatusEvents(organizationId: number, tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tripStatusEvents)
    .where(and(eq(tripStatusEvents.tripId, tripId), eq(tripStatusEvents.organizationId, organizationId)))
    .orderBy(desc(tripStatusEvents.createdAt));
}

// Lightweight heuristic pairing suggestion: same passenger label + same
// date + reversed pickup/dropoff addresses. Dispatcher must confirm —
// never auto-merged.
export async function suggestTripPairs(organizationId: number, tripDate: number) {
  const dayTrips = await getTripsByDate(organizationId, tripDate);
  const unpaired = dayTrips.filter(t => !t.pairedTripId);
  const suggestions: { tripAId: number; tripBId: number; reason: string }[] = [];

  const normalize = (s: string | null) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

  for (let i = 0; i < unpaired.length; i++) {
    for (let j = i + 1; j < unpaired.length; j++) {
      const a = unpaired[i];
      const b = unpaired[j];
      if (!a.passengerLabel || !b.passengerLabel) continue;
      if (normalize(a.passengerLabel) !== normalize(b.passengerLabel)) continue;

      const reversed =
        normalize(a.pickupAddress) === normalize(b.dropoffAddress) &&
        normalize(a.dropoffAddress) === normalize(b.pickupAddress);

      if (reversed) {
        suggestions.push({
          tripAId: a.pickupTime <= b.pickupTime ? a.id : b.id,
          tripBId: a.pickupTime <= b.pickupTime ? b.id : a.id,
          reason: "Same passenger label, same day, reversed pickup/drop-off — likely outbound/return pair.",
        });
      }
    }
  }
  return suggestions;
}

export async function linkTripPair(organizationId: number, tripAId: number, tripBId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(trips).set({ pairedTripId: tripBId, legType: "A" }).where(and(eq(trips.id, tripAId), eq(trips.organizationId, organizationId)));
  await db.update(trips).set({ pairedTripId: tripAId, legType: "B" }).where(and(eq(trips.id, tripBId), eq(trips.organizationId, organizationId)));
}

export async function unlinkTripPair(organizationId: number, tripId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const trip = await getTripById(organizationId, tripId);
  if (!trip) return;
  await db.update(trips).set({ pairedTripId: null, legType: "unknown" }).where(and(eq(trips.id, tripId), eq(trips.organizationId, organizationId)));
  if (trip.pairedTripId) {
    await db.update(trips).set({ pairedTripId: null, legType: "unknown" }).where(and(eq(trips.id, trip.pairedTripId), eq(trips.organizationId, organizationId)));
  }
}

// Eligible drivers/vehicles for a trip, with exclusion reasons shown for
// anything filtered out — matches the "explain every exclusion" principle.
export async function getEligibleDriversForTrip(organizationId: number, trip: Trip) {
  const allDrivers = await getDrivers(organizationId);
  return allDrivers.map(d => {
    const reasons: string[] = [];
    if (d.status !== "active") reasons.push("Driver is inactive");
    if (trip.mobilityType === "wheelchair" && d.wheelchairQualified !== "yes") reasons.push("Not wheelchair-qualified");
    if (trip.twoPersonAssist === "yes" && d.twoPersonAssist !== "yes") reasons.push("Not two-person-assist qualified");
    if (d.cdlExpiry && d.cdlExpiry < Date.now()) reasons.push("CDL expired");
    return { driver: d, eligible: reasons.length === 0, reasons };
  });
}

export async function getEligibleVehiclesForTrip(organizationId: number, trip: Trip) {
  const allVehicles = await getVehicles(organizationId);
  return allVehicles.map(v => {
    const reasons: string[] = [];
    if (v.status !== "active") reasons.push(`Vehicle status: ${v.status.replace("_", " ")}`);
    if (trip.mobilityType === "wheelchair") {
      if (v.wheelchairCapacity < trip.wheelchairCount) reasons.push("Insufficient wheelchair capacity");
      if (v.rampStatus !== "operational") reasons.push("Ramp/lift unavailable");
    }
    if (v.insuranceExpiry && v.insuranceExpiry < Date.now()) reasons.push("Insurance expired");
    if (v.registrationExpiry && v.registrationExpiry < Date.now()) reasons.push("Registration expired");
    return { vehicle: v, eligible: reasons.length === 0, reasons };
  });
}

// ============ DRIVER MOBILE APP HELPERS ============

export async function setDriverPin(organizationId: number, driverId: number, pinHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(drivers).set({ pinHash }).where(and(eq(drivers.id, driverId), eq(drivers.organizationId, organizationId)));
}

export async function createPairingCode(organizationId: number, driverId: number, code: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(driverPairingCodes).values({ organizationId, driverId, code, expiresAt });
  return { id: result[0].insertId };
}

export async function getPairingCodeByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(driverPairingCodes).where(eq(driverPairingCodes.code, code)).limit(1);
  return result[0];
}

export async function markPairingCodeUsed(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(driverPairingCodes).set({ usedAt: new Date() }).where(eq(driverPairingCodes.id, id));
}

export async function createDriverDevice(data: InsertDriverDevice): Promise<DriverDevice> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(driverDevices).values(data);
  const insertId = result[0].insertId;
  const rows = await db.select().from(driverDevices).where(eq(driverDevices.id, insertId)).limit(1);
  return rows[0];
}

export async function getDriverDeviceByDeviceId(deviceId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(driverDevices)
    .where(and(eq(driverDevices.deviceId, deviceId), sql`${driverDevices.revokedAt} is null`))
    .limit(1);
  return result[0];
}

export async function touchDriverDeviceLastSeen(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(driverDevices).set({ lastSeenAt: new Date() }).where(eq(driverDevices.id, id));
}

export async function getDriverDevicesForDriver(organizationId: number, driverId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(driverDevices)
    .where(and(eq(driverDevices.organizationId, organizationId), eq(driverDevices.driverId, driverId), sql`${driverDevices.revokedAt} is null`));
}

export async function revokeDriverDevice(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(driverDevices).set({ revokedAt: new Date() }).where(and(eq(driverDevices.id, id), eq(driverDevices.organizationId, organizationId)));
}

export async function getOpenShiftForDriver(organizationId: number, driverId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(driverShifts)
    .where(and(eq(driverShifts.organizationId, organizationId), eq(driverShifts.driverId, driverId), sql`${driverShifts.clockOutAt} is null`))
    .orderBy(desc(driverShifts.clockInAt))
    .limit(1);
  return result[0];
}

export async function createDriverShift(data: InsertDriverShift): Promise<DriverShift> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(driverShifts).values(data);
  const insertId = result[0].insertId;
  const rows = await db.select().from(driverShifts).where(eq(driverShifts.id, insertId)).limit(1);
  return rows[0];
}

export async function closeDriverShift(id: number, clockOutAt: Date, clockOutMileage: number, clockOutLatitude?: number, clockOutLongitude?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(driverShifts).set({
    clockOutAt,
    clockOutMileage,
    clockOutLatitude: clockOutLatitude != null ? String(clockOutLatitude) : undefined,
    clockOutLongitude: clockOutLongitude != null ? String(clockOutLongitude) : undefined,
  }).where(eq(driverShifts.id, id));
}

export async function deleteDriverShift(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(driverShifts).where(and(eq(driverShifts.id, id), eq(driverShifts.organizationId, organizationId)));
}

// Lets an admin correct a shift after the fact — e.g. a driver forgot to
// clock out at the actual end of their shift and the recorded time is
// wrong, or a mileage entry was mistyped. Only touches fields actually
// passed in.
export async function updateDriverShift(organizationId: number, id: number, data: {
  clockInAt?: number; clockInMileage?: number; clockOutAt?: number | null; clockOutMileage?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existing] = await db.select().from(driverShifts).where(and(eq(driverShifts.id, id), eq(driverShifts.organizationId, organizationId)));
  if (!existing) throw new Error("Shift not found");

  const newClockInAt = data.clockInAt != null ? new Date(data.clockInAt) : existing.clockInAt;
  const newClockOutAt = data.clockOutAt === null ? null : data.clockOutAt != null ? new Date(data.clockOutAt) : existing.clockOutAt;
  const newClockInMileage = data.clockInMileage ?? existing.clockInMileage;
  const newClockOutMileage = data.clockOutMileage === null ? null : data.clockOutMileage ?? existing.clockOutMileage;

  if (newClockOutAt && newClockOutAt < newClockInAt) {
    throw new Error("Clock-out time can't be before clock-in time.");
  }
  if (newClockOutMileage != null && newClockOutMileage < newClockInMileage) {
    throw new Error("Ending mileage can't be less than starting mileage.");
  }

  await db.update(driverShifts).set({
    clockInAt: newClockInAt,
    clockInMileage: newClockInMileage,
    clockOutAt: newClockOutAt,
    clockOutMileage: newClockOutMileage,
  }).where(eq(driverShifts.id, id));

  // Keep the vehicle's on-file mileage in sync if this shift's ending
  // mileage was corrected and it's the most recent shift for that vehicle.
  if (data.clockOutMileage != null) {
    const [mostRecent] = await db.select().from(driverShifts)
      .where(and(eq(driverShifts.organizationId, organizationId), eq(driverShifts.vehicleId, existing.vehicleId)))
      .orderBy(desc(driverShifts.clockInAt)).limit(1);
    if (mostRecent?.id === id) {
      await updateVehicle(organizationId, existing.vehicleId, { mileage: data.clockOutMileage });
    }
  }
}

// ============ DRIVER LOCATION HELPERS ============

export async function upsertDriverLocation(
  organizationId: number,
  driverId: number,
  vehicleId: number | null,
  latitude: number,
  longitude: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(driverLocations).where(eq(driverLocations.driverId, driverId)).limit(1);
  if (existing.length > 0) {
    await db.update(driverLocations)
      .set({ organizationId, vehicleId, latitude: String(latitude), longitude: String(longitude), recordedAt: new Date() })
      .where(eq(driverLocations.driverId, driverId));
  } else {
    await db.insert(driverLocations).values({
      organizationId, driverId, vehicleId,
      latitude: String(latitude), longitude: String(longitude),
    });
  }
}

// Only returns locations for drivers who are CURRENTLY clocked in — once a
// driver clocks out, tracking stops and they disappear from the live map
// rather than leaving a stale pin behind.
export async function getLiveDriverLocations(organizationId: number) {
  const db = await getDb();
  if (!db) return [];

  const openShifts = await db.select().from(driverShifts)
    .where(and(eq(driverShifts.organizationId, organizationId), sql`${driverShifts.clockOutAt} is null`));
  if (openShifts.length === 0) return [];

  const openDriverIds = new Set(openShifts.map(s => s.driverId));
  const locations = await db.select().from(driverLocations).where(eq(driverLocations.organizationId, organizationId));
  const allDrivers = await getDrivers(organizationId);
  const allVehicles = await getVehicles(organizationId);

  return locations
    .filter(loc => openDriverIds.has(loc.driverId))
    .map(loc => {
      const driver = allDrivers.find(d => d.id === loc.driverId);
      const vehicle = allVehicles.find(v => v.id === loc.vehicleId);
      return {
        driverId: loc.driverId,
        driverName: driver?.name ?? "Unknown",
        vehicleId: loc.vehicleId,
        vanNumber: vehicle?.vanNumber ?? null,
        latitude: parseFloat(loc.latitude),
        longitude: parseFloat(loc.longitude),
        recordedAt: loc.recordedAt,
      };
    });
}

export async function getDriverShifts(organizationId: number, opts?: { startDate?: number; endDate?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(driverShifts.organizationId, organizationId)];
  if (opts?.startDate) conditions.push(gte(driverShifts.clockInAt, new Date(opts.startDate)));
  if (opts?.endDate) conditions.push(lte(driverShifts.clockInAt, new Date(opts.endDate)));
  return db.select().from(driverShifts).where(and(...conditions)).orderBy(desc(driverShifts.clockInAt));
}

export async function getMileageAnalysis(organizationId: number, opts?: { startDate?: number; endDate?: number }) {
  const shifts = await getDriverShifts(organizationId, opts);
  const completedShifts = shifts.filter(s => s.clockOutAt && s.clockOutMileage != null);

  const allVehicles = await getVehicles(organizationId);
  const allDrivers = await getDrivers(organizationId);

  const byVehicleMap = new Map<number, { totalMiles: number; shiftCount: number }>();
  const byDriverMap = new Map<number, { totalHours: number; shiftCount: number }>();

  for (const s of completedShifts) {
    const miles = s.clockOutMileage! - s.clockInMileage;
    const hours = (new Date(s.clockOutAt!).getTime() - new Date(s.clockInAt).getTime()) / (1000 * 60 * 60);

    const vEntry = byVehicleMap.get(s.vehicleId) ?? { totalMiles: 0, shiftCount: 0 };
    vEntry.totalMiles += miles;
    vEntry.shiftCount += 1;
    byVehicleMap.set(s.vehicleId, vEntry);

    const dEntry = byDriverMap.get(s.driverId) ?? { totalHours: 0, shiftCount: 0 };
    dEntry.totalHours += hours;
    dEntry.shiftCount += 1;
    byDriverMap.set(s.driverId, dEntry);
  }

  const byVehicle = Array.from(byVehicleMap.entries()).map(([vehicleId, data]) => ({
    vehicleId,
    vanNumber: allVehicles.find(v => v.id === vehicleId)?.vanNumber ?? "Unknown",
    totalMiles: data.totalMiles,
    shiftCount: data.shiftCount,
  })).sort((a, b) => b.totalMiles - a.totalMiles);

  const byDriver = Array.from(byDriverMap.entries()).map(([driverId, data]) => ({
    driverId,
    driverName: allDrivers.find(d => d.id === driverId)?.name ?? "Unknown",
    totalHours: Math.round(data.totalHours * 100) / 100,
    shiftCount: data.shiftCount,
  })).sort((a, b) => b.totalHours - a.totalHours);

  const detail = shifts.map(s => ({
    id: s.id,
    driverId: s.driverId,
    driverName: allDrivers.find(d => d.id === s.driverId)?.name ?? "Unknown",
    vehicleId: s.vehicleId,
    vanNumber: allVehicles.find(v => v.id === s.vehicleId)?.vanNumber ?? "Unknown",
    clockInAt: s.clockInAt,
    clockInMileage: s.clockInMileage,
    clockInLatitude: s.clockInLatitude != null ? parseFloat(s.clockInLatitude) : null,
    clockInLongitude: s.clockInLongitude != null ? parseFloat(s.clockInLongitude) : null,
    clockOutAt: s.clockOutAt,
    clockOutMileage: s.clockOutMileage,
    clockOutLatitude: s.clockOutLatitude != null ? parseFloat(s.clockOutLatitude) : null,
    clockOutLongitude: s.clockOutLongitude != null ? parseFloat(s.clockOutLongitude) : null,
    milesDriven: s.clockOutMileage != null ? s.clockOutMileage - s.clockInMileage : null,
    hoursWorked: s.clockOutAt
      ? Math.round(((new Date(s.clockOutAt).getTime() - new Date(s.clockInAt).getTime()) / (1000 * 60 * 60)) * 100) / 100
      : null,
  }));

  return { byVehicle, byDriver, detail };
}

// ============ TOLLS (E-ZPass) HELPERS ============

export async function createTollImport(organizationId: number, data: Omit<InsertTollImport, "organizationId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tollImports).values({ ...data, organizationId });
  return { id: result[0].insertId };
}

const normalizeForMatch = (s: string | null | undefined) => {
  let v = (s ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
  // Tag numbers are purely numeric — a leading zero doesn't change what
  // physical tag it is, so "08600346549" and "8600346549" should match.
  // Only applied to all-digit values, so alphanumeric plates are untouched.
  if (/^\d+$/.test(v)) v = v.replace(/^0+(?=\d)/, "");
  return v;
};

export async function createTollTransactionsBulk(
  organizationId: number,
  importId: number | null,
  rows: Omit<InsertTollTransaction, "organizationId" | "importId" | "vehicleId">[],
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (rows.length === 0) return { count: 0, matchedCount: 0 };

  const vehicles = await getVehicles(organizationId);
  const byTag = new Map(vehicles.filter(v => v.ezpassTag).map(v => [normalizeForMatch(v.ezpassTag), v]));
  const byPlate = new Map(vehicles.filter(v => v.licensePlate).map(v => [normalizeForMatch(v.licensePlate), v]));

  let matchedCount = 0;
  const withVehicle = rows.map(r => {
    const key = normalizeForMatch(r.tagOrPlate);
    // E-ZPass's export doesn't say whether this value is the tag or the
    // plate — it's tried against both, since either can identify the vehicle.
    const vehicle = (key ? byTag.get(key) : undefined) ?? (key ? byPlate.get(key) : undefined);
    if (vehicle) matchedCount++;
    return { ...r, organizationId, importId, vehicleId: vehicle?.id ?? null };
  });

  await db.insert(tollTransactions).values(withVehicle);
  return { count: rows.length, matchedCount };
}

export async function getTollTransactions(organizationId: number, opts?: { startDate?: number; endDate?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(tollTransactions.organizationId, organizationId)];
  if (opts?.startDate) conditions.push(gte(tollTransactions.transactionAt, new Date(opts.startDate)));
  if (opts?.endDate) conditions.push(lte(tollTransactions.transactionAt, new Date(opts.endDate)));

  const rows = await db.select().from(tollTransactions).where(and(...conditions)).orderBy(desc(tollTransactions.transactionAt));
  const vehicles = await getVehicles(organizationId);

  return rows.map(r => ({
    id: r.id,
    vanNumber: vehicles.find(v => v.id === r.vehicleId)?.vanNumber ?? null,
    tagOrPlate: r.tagOrPlate,
    referenceId: r.referenceId,
    transactionAt: r.transactionAt,
    entryPlaza: r.entryPlaza,
    exitPlaza: r.exitPlaza,
    vehicleClass: r.vehicleClass,
    agency: r.agency,
    amount: parseFloat(r.amount),
    notes: r.notes,
  }));
}

export async function rematchUnmatchedTollTransactions(organizationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const unmatched = await db.select().from(tollTransactions)
    .where(and(eq(tollTransactions.organizationId, organizationId), sql`${tollTransactions.vehicleId} is null`));
  if (unmatched.length === 0) return { rematchedCount: 0 };

  const vehicles = await getVehicles(organizationId);
  const byTag = new Map(vehicles.filter(v => v.ezpassTag).map(v => [normalizeForMatch(v.ezpassTag), v]));
  const byPlate = new Map(vehicles.filter(v => v.licensePlate).map(v => [normalizeForMatch(v.licensePlate), v]));

  let rematchedCount = 0;
  for (const txn of unmatched) {
    const key = normalizeForMatch(txn.tagOrPlate);
    const vehicle = (key ? byTag.get(key) : undefined) ?? (key ? byPlate.get(key) : undefined);
    if (vehicle) {
      await db.update(tollTransactions).set({ vehicleId: vehicle.id }).where(eq(tollTransactions.id, txn.id));
      rematchedCount++;
    }
  }
  return { rematchedCount };
}

export async function deleteTollTransaction(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(tollTransactions).where(and(eq(tollTransactions.id, id), eq(tollTransactions.organizationId, organizationId)));
}

export async function deleteTollTransactionsBulk(organizationId: number, ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (ids.length === 0) return { count: 0 };
  await db.delete(tollTransactions).where(and(eq(tollTransactions.organizationId, organizationId), inArray(tollTransactions.id, ids)));
  return { count: ids.length };
}

export async function deleteTollTransactionsInRange(organizationId: number, opts?: { startDate?: number; endDate?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq(tollTransactions.organizationId, organizationId)];
  if (opts?.startDate) conditions.push(gte(tollTransactions.transactionAt, new Date(opts.startDate)));
  if (opts?.endDate) conditions.push(lte(tollTransactions.transactionAt, new Date(opts.endDate)));
  await db.delete(tollTransactions).where(and(...conditions));
}

// ============ EXPIRATION DASHBOARD ============
// A focused, always-live view of everything expiring within the next 2
// weeks — vehicle registration, DOT inspections, and driver CDL/medical/
// abstract — computed directly rather than depending on the alert-generation
// job, so it's never stale.
const EXPIRATION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export async function getExpirationDashboard(organizationId: number) {
  const now = Date.now();
  const windowEnd = now + EXPIRATION_WINDOW_MS;
  const withinWindow = (expiry: number | null | undefined) => expiry != null && expiry <= windowEnd;
  const daysLeft = (expiry: number) => Math.ceil((expiry - now) / (24 * 60 * 60 * 1000));

  const [vehicles, latestDot, drivers, latestMedical, latestAbstract] = await Promise.all([
    getVehicles(organizationId),
    getLatestDotInspectionByVehicle(organizationId),
    getDrivers(organizationId),
    getLatestMedicalCertByDriver(organizationId),
    getLatestAbstractByDriver(organizationId),
  ]);

  const vehicleRegistrations = vehicles
    .filter(v => withinWindow(v.registrationExpiry))
    .map(v => ({ vehicleId: v.id, vanNumber: v.vanNumber, expiryDate: v.registrationExpiry!, daysLeft: daysLeft(v.registrationExpiry!) }));

  const dotInspections = vehicles
    .filter(v => withinWindow(latestDot[v.id]?.expiryDate))
    .map(v => ({ vehicleId: v.id, vanNumber: v.vanNumber, expiryDate: latestDot[v.id].expiryDate, daysLeft: daysLeft(latestDot[v.id].expiryDate) }));

  const driverCdl = drivers
    .filter(d => d.status === "active" && withinWindow(d.cdlExpiry))
    .map(d => ({ driverId: d.id, driverName: d.name, expiryDate: d.cdlExpiry!, daysLeft: daysLeft(d.cdlExpiry!) }));

  const driverMedical = drivers
    .filter(d => d.status === "active" && withinWindow(latestMedical[d.id]?.expiryDate))
    .map(d => ({ driverId: d.id, driverName: d.name, expiryDate: latestMedical[d.id].expiryDate, daysLeft: daysLeft(latestMedical[d.id].expiryDate) }));

  const driverAbstracts = drivers
    .filter(d => d.status === "active" && withinWindow(latestAbstract[d.id]?.nextDueDate))
    .map(d => ({ driverId: d.id, driverName: d.name, expiryDate: latestAbstract[d.id].nextDueDate, daysLeft: daysLeft(latestAbstract[d.id].nextDueDate) }));

  const sortByDays = <T extends { daysLeft: number }>(list: T[]) => list.sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    vehicleRegistrations: sortByDays(vehicleRegistrations),
    dotInspections: sortByDays(dotInspections),
    driverCdl: sortByDays(driverCdl),
    driverMedical: sortByDays(driverMedical),
    driverAbstracts: sortByDays(driverAbstracts),
  };
}

// ============ PARTS INVENTORY ============

// One invoice can have multiple scanned pages and multiple line items —
// this creates all three together (invoice record, stored document pages,
// and line-item part rows) as a single logical unit.
export async function createPartInvoiceWithDocuments(organizationId: number, data: {
  shopId?: number;
  invoiceReference?: string;
  datePurchased: number;
  printedTotal?: number;
  documents: { fileUrl: string; fileKey: string; pageNumber: number }[];
  lineItems: { name: string; category?: string; quantity: number; unitCost: number }[];
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  if (data.lineItems.length === 0) throw new Error("At least one line item is required");

  return dbConn.transaction(async (tx) => {
    const invoiceResult = await tx.insert(partInvoices).values({
      organizationId,
      shopId: data.shopId,
      invoiceReference: data.invoiceReference,
      datePurchased: new Date(data.datePurchased),
      printedTotal: data.printedTotal != null ? String(data.printedTotal) : undefined,
    });
    const invoiceId = invoiceResult[0].insertId;

    if (data.documents.length > 0) {
      await tx.insert(partInvoiceDocuments).values(data.documents.map(doc => ({
        organizationId,
        invoiceId,
        pageNumber: doc.pageNumber,
        fileUrl: doc.fileUrl,
        fileKey: doc.fileKey,
      })));
    }

    await tx.insert(parts).values(data.lineItems.map(item => ({
      organizationId,
      name: item.name,
      category: item.category,
      shopId: data.shopId,
      invoiceId,
      quantityPurchased: item.quantity,
      quantityRemaining: item.quantity,
      unitCost: String(item.unitCost),
      totalCost: String(item.quantity * item.unitCost),
      datePurchased: new Date(data.datePurchased),
    })));

    return { invoiceId, count: data.lineItems.length };
  });
}

export async function createPart(organizationId: number, data: {
  name: string; category?: string; shopId?: number;
  quantityPurchased: number; unitCost: number; datePurchased: number; notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const totalCost = data.quantityPurchased * data.unitCost;
  const result = await db.insert(parts).values({
    organizationId,
    name: data.name,
    category: data.category,
    shopId: data.shopId,
    quantityPurchased: data.quantityPurchased,
    quantityRemaining: data.quantityPurchased,
    unitCost: String(data.unitCost),
    totalCost: String(totalCost),
    datePurchased: new Date(data.datePurchased),
    notes: data.notes,
  });
  return { id: result[0].insertId };
}

export async function getParts(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(parts).where(eq(parts.organizationId, organizationId)).orderBy(desc(parts.datePurchased));
  const shops = await getShops(organizationId);
  const invoices = await db.select().from(partInvoices).where(eq(partInvoices.organizationId, organizationId));

  return rows.map(p => {
    const usedSoFar = p.quantityPurchased - p.quantityRemaining;
    const status: "in_stock" | "partially_used" | "fully_used" =
      usedSoFar === 0 ? "in_stock" : p.quantityRemaining === 0 ? "fully_used" : "partially_used";
    const invoice = invoices.find(i => i.id === p.invoiceId);
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      shopId: p.shopId,
      shopName: shops.find(s => s.id === p.shopId)?.name ?? null,
      invoiceId: p.invoiceId,
      invoiceReference: invoice?.invoiceReference ?? null,
      quantityPurchased: p.quantityPurchased,
      quantityRemaining: p.quantityRemaining,
      unitCost: parseFloat(p.unitCost),
      totalCost: parseFloat(p.totalCost),
      datePurchased: p.datePurchased,
      notes: p.notes,
      status,
    };
  });
}

export async function updatePart(organizationId: number, id: number, data: {
  name?: string; category?: string; shopId?: number | null;
  quantityPurchased?: number; unitCost?: number; datePurchased?: number; notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existing] = await db.select().from(parts).where(and(eq(parts.id, id), eq(parts.organizationId, organizationId)));
  if (!existing) throw new Error("Part not found");

  const usedSoFar = existing.quantityPurchased - existing.quantityRemaining;
  const newQuantityPurchased = data.quantityPurchased ?? existing.quantityPurchased;
  if (newQuantityPurchased < usedSoFar) {
    throw new Error(`Can't reduce quantity below ${usedSoFar} — that many units are already marked used.`);
  }
  const newUnitCost = data.unitCost ?? parseFloat(existing.unitCost);

  await db.update(parts).set({
    name: data.name,
    category: data.category,
    shopId: data.shopId,
    quantityPurchased: newQuantityPurchased,
    quantityRemaining: newQuantityPurchased - usedSoFar,
    unitCost: String(newUnitCost),
    totalCost: String(newQuantityPurchased * newUnitCost),
    datePurchased: data.datePurchased != null ? new Date(data.datePurchased) : undefined,
    notes: data.notes,
  }).where(and(eq(parts.id, id), eq(parts.organizationId, organizationId)));
}

export async function deletePart(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [usage] = await db.select().from(partUsages).where(and(eq(partUsages.partId, id), eq(partUsages.organizationId, organizationId))).limit(1);
  if (usage) {
    throw new Error("This part has usage history recorded against it and can't be deleted. Remove its usage entries first.");
  }
  await db.delete(parts).where(and(eq(parts.id, id), eq(parts.organizationId, organizationId)));
}

// ============ PART INVOICES (the "file cabinet" view) ============

export async function getPartInvoices(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  const invoices = await db.select().from(partInvoices).where(eq(partInvoices.organizationId, organizationId)).orderBy(desc(partInvoices.datePurchased));
  const allParts = await db.select().from(parts).where(eq(parts.organizationId, organizationId));
  const shops = await getShops(organizationId);

  return invoices.map(inv => {
    const lineItems = allParts.filter(p => p.invoiceId === inv.id);
    const computedTotal = lineItems.reduce((sum, p) => sum + parseFloat(p.totalCost), 0);
    const printedTotal = inv.printedTotal != null ? parseFloat(inv.printedTotal) : null;
    return {
      id: inv.id,
      shopId: inv.shopId,
      shopName: shops.find(s => s.id === inv.shopId)?.name ?? null,
      invoiceReference: inv.invoiceReference,
      datePurchased: inv.datePurchased,
      itemCount: lineItems.length,
      computedTotal: Math.round(computedTotal * 100) / 100,
      printedTotal,
      totalMismatch: printedTotal != null && Math.abs(printedTotal - computedTotal) > 0.01,
    };
  });
}

export async function getPartInvoiceById(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) return null;
  const [invoice] = await db.select().from(partInvoices).where(and(eq(partInvoices.id, id), eq(partInvoices.organizationId, organizationId)));
  if (!invoice) return null;

  const lineItems = await db.select().from(parts).where(and(eq(parts.invoiceId, id), eq(parts.organizationId, organizationId)));
  const documents = await db.select().from(partInvoiceDocuments).where(and(eq(partInvoiceDocuments.invoiceId, id), eq(partInvoiceDocuments.organizationId, organizationId))).orderBy(partInvoiceDocuments.pageNumber);
  const shops = await getShops(organizationId);

  const computedTotal = lineItems.reduce((sum, p) => sum + parseFloat(p.totalCost), 0);
  const printedTotal = invoice.printedTotal != null ? parseFloat(invoice.printedTotal) : null;

  return {
    id: invoice.id,
    shopId: invoice.shopId,
    shopName: shops.find(s => s.id === invoice.shopId)?.name ?? null,
    invoiceReference: invoice.invoiceReference,
    datePurchased: invoice.datePurchased,
    printedTotal,
    computedTotal: Math.round(computedTotal * 100) / 100,
    totalMismatch: printedTotal != null && Math.abs(printedTotal - computedTotal) > 0.01,
    lineItems: lineItems.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      quantityPurchased: p.quantityPurchased,
      quantityRemaining: p.quantityRemaining,
      unitCost: parseFloat(p.unitCost),
      totalCost: parseFloat(p.totalCost),
    })),
    documents: documents.map(d => ({ id: d.id, pageNumber: d.pageNumber, fileUrl: d.fileUrl })),
  };
}

// ============ PART USAGE TRACKING ============

export async function getPartUsages(organizationId: number, partId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(partUsages)
    .where(and(eq(partUsages.partId, partId), eq(partUsages.organizationId, organizationId)))
    .orderBy(desc(partUsages.dateUsed));
  const vehicles = await getVehicles(organizationId);

  return rows.map(u => ({
    id: u.id,
    quantityUsed: u.quantityUsed,
    vehicleId: u.vehicleId,
    vanNumber: vehicles.find(v => v.id === u.vehicleId)?.vanNumber ?? "Unknown",
    repairId: u.repairId,
    dateUsed: u.dateUsed,
    notes: u.notes,
  }));
}

// Records a usage event and decrements the part's remaining quantity in a
// single transaction, so the two can never drift out of sync.
export async function createPartUsage(organizationId: number, data: {
  partId: number; quantityUsed: number; vehicleId: number; repairId?: number; dateUsed: number; notes?: string;
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  await dbConn.transaction(async (tx) => {
    const [part] = await tx.select().from(parts).where(and(eq(parts.id, data.partId), eq(parts.organizationId, organizationId)));
    if (!part) throw new Error("Part not found");
    if (data.quantityUsed > part.quantityRemaining) {
      throw new Error(`Only ${part.quantityRemaining} remaining — can't use ${data.quantityUsed}.`);
    }
    if (data.quantityUsed <= 0) throw new Error("Quantity used must be at least 1.");

    await tx.insert(partUsages).values({
      organizationId,
      partId: data.partId,
      quantityUsed: data.quantityUsed,
      vehicleId: data.vehicleId,
      repairId: data.repairId,
      dateUsed: new Date(data.dateUsed),
      notes: data.notes,
    });
    await tx.update(parts).set({ quantityRemaining: part.quantityRemaining - data.quantityUsed })
      .where(eq(parts.id, data.partId));
  });
}

// Deletes a usage event and returns its quantity back to the part's
// remaining stock, in a single transaction.
export async function deletePartUsage(organizationId: number, id: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  await dbConn.transaction(async (tx) => {
    const [usage] = await tx.select().from(partUsages).where(and(eq(partUsages.id, id), eq(partUsages.organizationId, organizationId)));
    if (!usage) throw new Error("Usage record not found");

    const [part] = await tx.select().from(parts).where(eq(parts.id, usage.partId));
    if (part) {
      await tx.update(parts).set({ quantityRemaining: part.quantityRemaining + usage.quantityUsed })
        .where(eq(parts.id, usage.partId));
    }
    await tx.delete(partUsages).where(eq(partUsages.id, id));
  });
}

// ============ GAS AUDIT ============

// Matches each row's Driver Prompt ID against known drivers, without
// writing anything yet — used to show a preview (matched vs. needs
// assignment) before the import is actually confirmed.
// Strips leading zeros (and whitespace) so IDs match regardless of whether
// a spreadsheet parser preserved a leading zero (e.g. saved as "0581") or
// silently converted it to a number in the process (imported as "581") —
// a common, easy-to-miss gotcha with numeric-looking ID columns in CSV/XLSX
// parsing libraries.
function normalizePromptId(id: string): string {
  return id.trim().replace(/^0+(?=\d)/, "");
}

export async function previewGasImportRows(organizationId: number, rows: {
  driverPromptId: string; numberOfTransactions: number; totalAmount: number;
  avgAmount?: number; highAmount?: number; lowAmount?: number;
  totalFuelUnits?: number; avgFuelUnitPrice?: number;
  totalNonFuelAmount?: number; totalTransactionFeeAmount?: number;
  transactionDate?: number; odometer?: number;
}[]) {
  const allDrivers = await getDrivers(organizationId);
  return rows.map(row => {
    const driver = allDrivers.find(d => d.gasCardPromptId && normalizePromptId(d.gasCardPromptId) === normalizePromptId(row.driverPromptId));
    return { ...row, driverId: driver?.id ?? null, driverName: driver?.name ?? null };
  });
}

export async function createGasImport(organizationId: number, uploadedByUserId: number, data: {
  periodLabel: string;
  fileName?: string;
  rows: {
    driverPromptId: string; driverId: number | null; numberOfTransactions: number; totalAmount: number;
    avgAmount?: number; highAmount?: number; lowAmount?: number;
    totalFuelUnits?: number; avgFuelUnitPrice?: number;
    totalNonFuelAmount?: number; totalTransactionFeeAmount?: number;
    transactionDate?: number; odometer?: number;
  }[];
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  if (data.rows.length === 0) throw new Error("No rows to import");

  return dbConn.transaction(async (tx) => {
    const importResult = await tx.insert(gasImports).values({
      organizationId,
      periodLabel: data.periodLabel,
      fileName: data.fileName,
      uploadedByUserId,
    });
    const importId = importResult[0].insertId;

    await tx.insert(gasUsageRecords).values(data.rows.map(row => ({
      organizationId,
      importId,
      driverId: row.driverId,
      driverPromptId: row.driverPromptId,
      transactionDate: row.transactionDate != null ? new Date(row.transactionDate) : undefined,
      odometer: row.odometer,
      numberOfTransactions: row.numberOfTransactions,
      totalAmount: String(row.totalAmount),
      avgAmount: row.avgAmount != null ? String(row.avgAmount) : undefined,
      highAmount: row.highAmount != null ? String(row.highAmount) : undefined,
      lowAmount: row.lowAmount != null ? String(row.lowAmount) : undefined,
      totalFuelUnits: row.totalFuelUnits != null ? String(row.totalFuelUnits) : undefined,
      avgFuelUnitPrice: row.avgFuelUnitPrice != null ? String(row.avgFuelUnitPrice) : undefined,
      totalNonFuelAmount: row.totalNonFuelAmount != null ? String(row.totalNonFuelAmount) : undefined,
      totalTransactionFeeAmount: row.totalTransactionFeeAmount != null ? String(row.totalTransactionFeeAmount) : undefined,
    })));

    return { importId, count: data.rows.length };
  });
}

export async function getGasImports(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  const imports = await db.select().from(gasImports).where(eq(gasImports.organizationId, organizationId)).orderBy(desc(gasImports.createdAt));
  const allRecords = await db.select().from(gasUsageRecords).where(eq(gasUsageRecords.organizationId, organizationId));

  return imports.map(imp => {
    const records = allRecords.filter(r => r.importId === imp.id);
    return {
      id: imp.id,
      periodLabel: imp.periodLabel,
      fileName: imp.fileName,
      createdAt: imp.createdAt,
      driverCount: records.length,
      unmatchedCount: records.filter(r => r.driverId == null).length,
      totalSpend: Math.round(records.reduce((sum, r) => sum + parseFloat(r.totalAmount), 0) * 100) / 100,
      totalGallons: Math.round(records.reduce((sum, r) => sum + (r.totalFuelUnits ? parseFloat(r.totalFuelUnits) : 0), 0) * 100) / 100,
    };
  });
}

export async function deleteGasImport(organizationId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(gasUsageRecords).where(and(eq(gasUsageRecords.importId, id), eq(gasUsageRecords.organizationId, organizationId)));
  await db.delete(gasImports).where(and(eq(gasImports.id, id), eq(gasImports.organizationId, organizationId)));
}

// Every usage record across every import, joined with driver names —
// the main feed for the Gas page's per-driver breakdown and history.
export async function getGasUsage(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  const records = await db.select().from(gasUsageRecords).where(eq(gasUsageRecords.organizationId, organizationId)).orderBy(desc(gasUsageRecords.createdAt));
  const imports = await db.select().from(gasImports).where(eq(gasImports.organizationId, organizationId));
  const allDrivers = await getDrivers(organizationId);

  return records.map(r => {
    const imp = imports.find(i => i.id === r.importId);
    const driver = allDrivers.find(d => d.id === r.driverId);
    return {
      id: r.id,
      importId: r.importId,
      periodLabel: imp?.periodLabel ?? "Unknown",
      driverId: r.driverId,
      driverName: driver?.name ?? null,
      driverPromptId: r.driverPromptId,
      transactionDate: r.transactionDate,
      odometer: r.odometer,
      numberOfTransactions: r.numberOfTransactions,
      totalAmount: parseFloat(r.totalAmount),
      avgAmount: r.avgAmount != null ? parseFloat(r.avgAmount) : null,
      highAmount: r.highAmount != null ? parseFloat(r.highAmount) : null,
      lowAmount: r.lowAmount != null ? parseFloat(r.lowAmount) : null,
      totalFuelUnits: r.totalFuelUnits != null ? parseFloat(r.totalFuelUnits) : null,
      avgFuelUnitPrice: r.avgFuelUnitPrice != null ? parseFloat(r.avgFuelUnitPrice) : null,
    };
  });
}

// Lets an unmatched record be assigned to a driver after the fact — also
// updates that driver's saved gasCardPromptId so future imports match
// automatically, and backfills any OTHER unmatched records this
// organization already has for the same prompt ID.
export async function assignGasUsageDriver(organizationId: number, recordId: number, driverId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [record] = await db.select().from(gasUsageRecords).where(and(eq(gasUsageRecords.id, recordId), eq(gasUsageRecords.organizationId, organizationId)));
  if (!record) throw new Error("Record not found");

  await updateDriver(organizationId, driverId, { gasCardPromptId: record.driverPromptId });
  await db.update(gasUsageRecords).set({ driverId })
    .where(and(eq(gasUsageRecords.driverPromptId, record.driverPromptId), eq(gasUsageRecords.organizationId, organizationId)));
}

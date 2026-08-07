import { bigint, decimal, index, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Organizations - one per customer company. Every other table (except this
 * one) is scoped to an organizationId so data never crosses tenants.
 */
export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  // Short, human-readable code drivers enter (alongside a pairing code) when
  // first setting up the mobile app — makes sure the pairing is unambiguously
  // locked to the right company, separate from the internal numeric ID/slug.
  organizationCode: varchar("organizationCode", { length: 12 }).unique(),
  industryType: mysqlEnum("industryType", ["nemt", "other"]).default("other").notNull(),
  enabledModules: json("enabledModules").$type<{ driverMedical?: boolean }>(),
  planTier: mysqlEnum("planTier", ["none", "starter", "fleet", "fleet_pro", "enterprise_50", "enterprise_100", "enterprise_200", "enterprise_custom"]).default("none").notNull(),
  billingInterval: mysqlEnum("billingInterval", ["month", "quarter", "year"]).default("month").notNull(),
  subscriptionStatus: varchar("subscriptionStatus", { length: 50 }),
  stripeCustomerId: varchar("stripeCustomerId", { length: 100 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 100 }),
  // Exempts an organization from billing requirements and any future
  // per-plan limits (vehicle count, etc). Set only via migration script for
  // pre-existing accounts — new signups always default to "no".
  isGrandfathered: mysqlEnum("isGrandfathered", ["yes", "no"]).default("no").notNull(),
  // Purchasable add-on vehicle capacity, on top of the plan's base limit —
  // its own small Stripe subscription, separate from the main plan.
  extraVehicleSlots: int("extraVehicleSlots").default(0).notNull(),
  stripeExtraVehicleSubscriptionId: varchar("stripeExtraVehicleSubscriptionId", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

/**
 * Users - authenticated via email/password. A user's company memberships
 * (which orgs they belong to, and their role in each) live in
 * organizationMembers below, not on this table — this is what lets one
 * person belong to more than one company.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  name: text("name"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Organization Members - join table between users and organizations.
 * A user can have a row here for more than one organization, each with its
 * own role, which is what lets one login switch between companies.
 */
export const organizationMembers = mysqlTable("organization_members", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("organization_members_org_idx").on(table.organizationId),
]);

export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertOrganizationMember = typeof organizationMembers.$inferInsert;

/**
 * Invites - a pending invitation for someone to join an organization,
 * sent by email. Accepting one creates an organizationMembers row.
 */
export const invites = mysqlTable("invites", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  tokenHash: varchar("tokenHash", { length: 255 }).notNull().unique(),
  invitedByUserId: int("invitedByUserId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("invites_org_idx").on(table.organizationId),
]);

export type Invite = typeof invites.$inferSelect;
export type InsertInvite = typeof invites.$inferInsert;

/**
 * Password Reset Tokens - single-use, short-lived tokens emailed to a user
 * who requested a password reset.
 */
export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

/**
 * Vehicles - Ford Transit Ambulette fleet, scoped per organization
 */
export const vehicles = mysqlTable("vehicles", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  vanNumber: varchar("vanNumber", { length: 20 }).notNull(),
  vin: varchar("vin", { length: 17 }).notNull(),
  licensePlate: varchar("licensePlate", { length: 20 }),
  ezpassTag: varchar("ezpassTag", { length: 30 }),
  year: int("year").notNull(),
  make: varchar("make", { length: 50 }).default("Ford").notNull(),
  model: varchar("model", { length: 50 }).default("Transit Ambulette").notNull(),
  mileage: int("mileage").default(0).notNull(),
  engine: varchar("engine", { length: 100 }),
  transmission: varchar("transmission", { length: 100 }),
  assignedDriver: varchar("assignedDriver", { length: 100 }),
  status: mysqlEnum("status", ["active", "down", "awaiting_parts", "at_shop", "retired"]).default("active").notNull(),
  healthScore: mysqlEnum("healthScore", ["green", "yellow", "red"]).default("green").notNull(),
  photoUrl: text("photoUrl"),
  photoKey: varchar("photoKey", { length: 255 }),
  titleDocumentUrl: text("titleDocumentUrl"),
  titleDocumentKey: varchar("titleDocumentKey", { length: 255 }),
  registrationDocumentUrl: text("registrationDocumentUrl"),
  registrationDocumentKey: varchar("registrationDocumentKey", { length: 255 }),
  insuranceDocumentUrl: text("insuranceDocumentUrl"),
  insuranceDocumentKey: varchar("insuranceDocumentKey", { length: 255 }),
  wheelchairCapacity: int("wheelchairCapacity").default(0).notNull(),
  ambulatorySeats: int("ambulatorySeats").default(0).notNull(),
  rampStatus: mysqlEnum("rampStatus", ["operational", "unavailable"]).default("operational").notNull(),
  insuranceIssued: bigint("insuranceIssued", { mode: "number" }),
  insuranceExpiry: bigint("insuranceExpiry", { mode: "number" }),
  registrationIssued: bigint("registrationIssued", { mode: "number" }),
  registrationExpiry: bigint("registrationExpiry", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("vehicles_org_idx").on(table.organizationId),
]);

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = typeof vehicles.$inferInsert;

/**
 * Repair Shops - scoped per organization
 */
export const shops = mysqlTable("shops", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  address: text("address"),
  contactPerson: varchar("contactPerson", { length: 100 }),
  specialties: json("specialties").$type<string[]>(),
  averageLaborRate: decimal("averageLaborRate", { precision: 10, scale: 2 }),
  reliabilityScore: decimal("reliabilityScore", { precision: 3, scale: 1 }),
  recommendation: mysqlEnum("recommendation", ["yes", "no", "maybe"]),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("shops_org_idx").on(table.organizationId),
]);

export type Shop = typeof shops.$inferSelect;
export type InsertShop = typeof shops.$inferInsert;

/**
 * Repairs - Full repair history per vehicle, scoped per organization
 */
export const repairs = mysqlTable("repairs", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  vehicleId: int("vehicleId").notNull(),
  shopId: int("shopId"),
  date: bigint("date", { mode: "number" }).notNull(),
  mileage: int("mileage"),
  mechanic: varchar("mechanic", { length: 100 }),
  complaint: text("complaint"),
  diagnosis: text("diagnosis"),
  partsReplaced: json("partsReplaced").$type<string[]>(),
  partsCost: decimal("partsCost", { precision: 10, scale: 2 }).default("0"),
  laborCost: decimal("laborCost", { precision: 10, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0"),
  totalCost: decimal("totalCost", { precision: 10, scale: 2 }).default("0"),
  warrantyMonths: int("warrantyMonths"),
  warrantyExpiry: bigint("warrantyExpiry", { mode: "number" }),
  oldPartReturned: mysqlEnum("oldPartReturned", ["yes", "no"]),
  repairSuccessful: mysqlEnum("repairSuccessful", ["yes", "no"]),
  category: varchar("category", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("repairs_org_idx").on(table.organizationId),
]);

export type Repair = typeof repairs.$inferSelect;
export type InsertRepair = typeof repairs.$inferInsert;

/**
 * Repair Documents - invoices, photos, receipts per repair
 */
export const repairDocuments = mysqlTable("repair_documents", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  repairId: int("repairId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("repair_documents_org_idx").on(table.organizationId),
]);

export type RepairDocument = typeof repairDocuments.$inferSelect;
export type InsertRepairDocument = typeof repairDocuments.$inferInsert;

/**
 * Maintenance Services - defines service types and intervals, scoped per organization
 * (each company sets up its own service catalog)
 */
export const maintenanceServices = mysqlTable("maintenance_services", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  category: varchar("category", { length: 50 }),
  intervalMiles: int("intervalMiles"),
  intervalMonths: int("intervalMonths"),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("maintenance_services_org_idx").on(table.organizationId),
]);

export type MaintenanceService = typeof maintenanceServices.$inferSelect;
export type InsertMaintenanceService = typeof maintenanceServices.$inferInsert;

/**
 * Maintenance Records - logs of completed maintenance per vehicle
 */
export const maintenanceRecords = mysqlTable("maintenance_records", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  vehicleId: int("vehicleId").notNull(),
  serviceId: int("serviceId").notNull(),
  completedAt: bigint("completedAt", { mode: "number" }).notNull(),
  mileageAtService: int("mileageAtService"),
  nextDueMileage: int("nextDueMileage"),
  nextDueDate: bigint("nextDueDate", { mode: "number" }),
  shopId: int("shopId"),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("maintenance_records_org_idx").on(table.organizationId),
]);

export type MaintenanceRecord = typeof maintenanceRecords.$inferSelect;
export type InsertMaintenanceRecord = typeof maintenanceRecords.$inferInsert;

/**
 * Alerts - system-generated notifications, scoped per organization
 */
export const alerts = mysqlTable("alerts", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  vehicleId: int("vehicleId"),
  type: mysqlEnum("type", [
    "maintenance_due",
    "warranty_expiring",
    "high_cost",
    "repeat_repair",
    "excessive_downtime",
    "insurance_expiring",
    "registration_expiring",
    "overpriced_repair",
    "dot_inspection_expiring",
    "medical_cert_expiring",
    "cdl_expiring",
    "abstract_due",
  ]).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message"),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("info").notNull(),
  isRead: mysqlEnum("isRead", ["yes", "no"]).default("no").notNull(),
  isDismissed: mysqlEnum("isDismissed", ["yes", "no"]).default("no").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("alerts_org_idx").on(table.organizationId),
]);

export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;

/**
 * DOT Inspections - required commercial vehicle inspections, valid for 6
 * months from the inspection date. One row per completed inspection, so
 * history is preserved (not just the current/latest one).
 */
export const dotInspections = mysqlTable("dot_inspections", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  vehicleId: int("vehicleId").notNull(),
  inspectionDate: bigint("inspectionDate", { mode: "number" }).notNull(),
  expiryDate: bigint("expiryDate", { mode: "number" }).notNull(),
  mileageAtInspection: int("mileageAtInspection"),
  inspector: varchar("inspector", { length: 100 }),
  documentUrl: text("documentUrl"),
  documentKey: varchar("documentKey", { length: 255 }),
  // Set when this inspection was auto-created from a repair logged with
  // category "DOT Inspection" — lets later edits to that repair keep this
  // record in sync instead of creating duplicates.
  sourceRepairId: int("sourceRepairId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("dot_inspections_org_idx").on(table.organizationId),
]);

export type DotInspection = typeof dotInspections.$inferSelect;
export type InsertDotInspection = typeof dotInspections.$inferInsert;

/**
 * Drivers - your drivers, tracked as real records (separate from the
 * free-text assignedDriver field on vehicles).
 */
export const drivers = mysqlTable("drivers", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  licenseNumber: varchar("licenseNumber", { length: 50 }),
  phone: varchar("phone", { length: 30 }),
  status: mysqlEnum("status", ["active", "archived", "disqualified"]).default("active").notNull(),
  ssnLast4: varchar("ssnLast4", { length: 4 }),
  dateOfBirth: bigint("dateOfBirth", { mode: "number" }),
  cdlExpiry: bigint("cdlExpiry", { mode: "number" }),
  cdlDocumentUrl: text("cdlDocumentUrl"),
  cdlDocumentKey: varchar("cdlDocumentKey", { length: 255 }),
  // Hashed PIN for the driver mobile app — set by an admin, never shown/stored
  // in plaintext. Null until an admin sets one for this driver.
  pinHash: varchar("pinHash", { length: 255 }),
  wheelchairQualified: mysqlEnum("wheelchairQualified", ["yes", "no"]).default("yes").notNull(),
  twoPersonAssist: mysqlEnum("twoPersonAssist", ["yes", "no"]).default("no").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("drivers_org_idx").on(table.organizationId),
]);

export type Driver = typeof drivers.$inferSelect;
export type InsertDriver = typeof drivers.$inferInsert;

/**
 * Driver Medical Certs - DOT medical certification history per driver.
 * Renewal period is either 1 or 2 years depending on the driver's exam
 * outcome; expiryDate is always entered manually (there's no reliable feed
 * to pull it from) though the form suggests a default based on the interval.
 */
export const driverMedicalCerts = mysqlTable("driver_medical_certs", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  driverId: int("driverId").notNull(),
  examDate: bigint("examDate", { mode: "number" }).notNull(),
  expiryDate: bigint("expiryDate", { mode: "number" }).notNull(),
  renewalYears: mysqlEnum("renewalYears", ["1", "2"]).default("2").notNull(),
  examiner: varchar("examiner", { length: 100 }),
  documentUrl: text("documentUrl"),
  documentKey: varchar("documentKey", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("driver_medical_certs_org_idx").on(table.organizationId),
]);

export type DriverMedicalCert = typeof driverMedicalCerts.$inferSelect;
export type InsertDriverMedicalCert = typeof driverMedicalCerts.$inferInsert;

/**
 * Driver Abstracts - motor vehicle record (MVR) pulls/reviews, generally
 * required annually for CDL drivers. nextDueDate defaults to one year after
 * the pull date but stays fully editable.
 */
export const driverAbstracts = mysqlTable("driver_abstracts", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  driverId: int("driverId").notNull(),
  pulledDate: bigint("pulledDate", { mode: "number" }).notNull(),
  nextDueDate: bigint("nextDueDate", { mode: "number" }).notNull(),
  documentUrl: text("documentUrl"),
  documentKey: varchar("documentKey", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("driver_abstracts_org_idx").on(table.organizationId),
]);

export type DriverAbstract = typeof driverAbstracts.$inferSelect;
export type InsertDriverAbstract = typeof driverAbstracts.$inferInsert;

/**
 * Driver Documents - a general document library per driver, supporting
 * multiple files per year/category (e.g. several years of medical cards,
 * MVR printouts, CDL copies) rather than a single slot per record. This is
 * what backs the "Documents" browser on the Driver Abstracts page.
 */
export const driverDocuments = mysqlTable("driver_documents", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  driverId: int("driverId").notNull(),
  category: mysqlEnum("category", ["cdl", "medical", "abstract", "other"]).default("other").notNull(),
  year: int("year"),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 255 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("driver_documents_org_idx").on(table.organizationId),
]);

export type DriverDocument = typeof driverDocuments.$inferSelect;
export type InsertDriverDocument = typeof driverDocuments.$inferInsert;

/* ============================================================
 * ROUTE PLANNING MODULE (Phase 1A — synthetic/test data only)
 * ============================================================
 * This is intentionally a scoped-down first version: manual/assisted
 * assignment with eligibility checks, not a live optimizer. Real patient
 * data must not be entered until BAAs are in place with hosting/email/AI
 * vendors — see project notes. Test with synthetic data only.
 */

/**
 * Route Imports - one row per uploaded trip spreadsheet (metadata + the
 * original file, kept for audit purposes).
 */
export const routeImports = mysqlTable("route_imports", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  tripDate: bigint("tripDate", { mode: "number" }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 255 }),
  uploadedByUserId: int("uploadedByUserId").notNull(),
  rowCount: int("rowCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("route_imports_org_idx").on(table.organizationId),
]);

export type RouteImport = typeof routeImports.$inferSelect;
export type InsertRouteImport = typeof routeImports.$inferInsert;

/**
 * Trips - the core Route Planning entity. A-leg/B-leg pairing is done via
 * pairedTripId (self-referencing), confirmed by a dispatcher rather than
 * auto-merged. passengerLabel intentionally holds whatever identifier the
 * org chooses to use (a real name, or a synthetic/coded label during
 * testing) — the app itself does not assume a real name is present.
 */
export const trips = mysqlTable("trips", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  importId: int("importId"),
  jobId: varchar("jobId", { length: 100 }),
  tripDate: bigint("tripDate", { mode: "number" }).notNull(),
  pickupTime: bigint("pickupTime", { mode: "number" }).notNull(),
  appointmentTime: bigint("appointmentTime", { mode: "number" }),
  pickupAddress: text("pickupAddress").notNull(),
  dropoffAddress: text("dropoffAddress").notNull(),
  legType: mysqlEnum("legType", ["A", "B", "unknown"]).default("unknown").notNull(),
  pairedTripId: int("pairedTripId"),
  passengerLabel: varchar("passengerLabel", { length: 150 }),
  mobilityType: mysqlEnum("mobilityType", ["ambulatory", "wheelchair", "stretcher"]).default("ambulatory").notNull(),
  wheelchairCount: int("wheelchairCount").default(0).notNull(),
  twoPersonAssist: mysqlEnum("twoPersonAssist", ["yes", "no"]).default("no").notNull(),
  phone: varchar("phone", { length: 30 }),
  facilityName: varchar("facilityName", { length: 150 }),
  notes: text("notes"),
  status: mysqlEnum("status", [
    "imported", "unassigned", "assigned", "dispatched", "in_progress", "completed", "cancelled", "no_show",
  ]).default("imported").notNull(),
  assignedDriverId: int("assignedDriverId"),
  assignedVehicleId: int("assignedVehicleId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("trips_org_idx").on(table.organizationId),
]);

export type Trip = typeof trips.$inferSelect;
export type InsertTrip = typeof trips.$inferInsert;

/**
 * Trip Status Events - immutable audit trail of every status change,
 * assignment change, and pairing change on a trip.
 */
export const tripStatusEvents = mysqlTable("trip_status_events", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  tripId: int("tripId").notNull(),
  fromStatus: varchar("fromStatus", { length: 50 }),
  toStatus: varchar("toStatus", { length: 50 }).notNull(),
  changedByUserId: int("changedByUserId"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("trip_status_events_org_idx").on(table.organizationId),
]);

export type TripStatusEvent = typeof tripStatusEvents.$inferSelect;
export type InsertTripStatusEvent = typeof tripStatusEvents.$inferInsert;

/* ============================================================
 * DRIVER MOBILE APP — device pairing, clock-in/out, mileage
 * ============================================================
 */

/**
 * Driver Pairing Codes - short-lived, single-use codes an admin generates
 * for a specific driver, which the driver enters on first app launch to
 * securely bind that physical device to their record.
 */
export const driverPairingCodes = mysqlTable("driver_pairing_codes", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  driverId: int("driverId").notNull(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("driver_pairing_codes_org_idx").on(table.organizationId),
]);

export type DriverPairingCode = typeof driverPairingCodes.$inferSelect;
export type InsertDriverPairingCode = typeof driverPairingCodes.$inferInsert;

/**
 * Driver Devices - the actual device-to-driver binding, created once a
 * pairing code is redeemed. deviceId is a UUID the app generates and
 * stores locally on first launch.
 */
export const driverDevices = mysqlTable("driver_devices", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  driverId: int("driverId").notNull(),
  deviceId: varchar("deviceId", { length: 100 }).notNull().unique(),
  pairedAt: timestamp("pairedAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
}, (table) => [
  index("driver_devices_org_idx").on(table.organizationId),
]);

export type DriverDevice = typeof driverDevices.$inferSelect;
export type InsertDriverDevice = typeof driverDevices.$inferInsert;

/**
 * Driver Shifts - one row per clock-in/clock-out cycle, capturing which
 * van was used and the odometer reading at each end. This is what backs
 * the Mileage Analysis tab (miles per van, hours per driver).
 */
export const driverShifts = mysqlTable("driver_shifts", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  driverId: int("driverId").notNull(),
  vehicleId: int("vehicleId").notNull(),
  deviceId: varchar("deviceId", { length: 100 }),
  clockInAt: timestamp("clockInAt").notNull(),
  clockInMileage: int("clockInMileage").notNull(),
  clockInLatitude: decimal("clockInLatitude", { precision: 10, scale: 7 }),
  clockInLongitude: decimal("clockInLongitude", { precision: 10, scale: 7 }),
  clockOutAt: timestamp("clockOutAt"),
  clockOutMileage: int("clockOutMileage"),
  clockOutLatitude: decimal("clockOutLatitude", { precision: 10, scale: 7 }),
  clockOutLongitude: decimal("clockOutLongitude", { precision: 10, scale: 7 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("driver_shifts_org_idx").on(table.organizationId),
]);

export type DriverShift = typeof driverShifts.$inferSelect;
export type InsertDriverShift = typeof driverShifts.$inferInsert;

/**
 * Driver Locations - the driver's most recent known position, updated in
 * place (one row per driver, not a full history). Only meaningful while a
 * driver is clocked in — the app stops sending updates at clock-out, and
 * the Live Map only shows drivers with a currently-open shift so a stale
 * pin never lingers after someone's off the clock.
 */
export const driverLocations = mysqlTable("driver_locations", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  driverId: int("driverId").notNull().unique(),
  vehicleId: int("vehicleId"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  index("driver_locations_org_idx").on(table.organizationId),
]);

export type DriverLocation = typeof driverLocations.$inferSelect;
export type InsertDriverLocation = typeof driverLocations.$inferInsert;

/* ============================================================
 * TOLLS (E-ZPass statement import)
 * ============================================================
 */

export const tollImports = mysqlTable("toll_imports", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 255 }),
  uploadedByUserId: int("uploadedByUserId").notNull(),
  rowCount: int("rowCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("toll_imports_org_idx").on(table.organizationId),
]);

export type TollImport = typeof tollImports.$inferSelect;
export type InsertTollImport = typeof tollImports.$inferInsert;

/**
 * Toll Transactions - one row per E-ZPass crossing. vehicleId is resolved
 * at import time by matching tagNumber (preferred) or licensePlate against
 * the fleet — left null when nothing matches, so unmatched transactions
 * stay visible rather than silently disappearing.
 */
export const tollTransactions = mysqlTable("toll_transactions", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  importId: int("importId"),
  vehicleId: int("vehicleId"),
  // E-ZPass statements report a single combined Tag/Plate # column — it
  // isn't labeled which one it actually is, so this is matched against
  // both a vehicle's ezpassTag and licensePlate at import time.
  tagOrPlate: varchar("tagOrPlate", { length: 30 }),
  referenceId: varchar("referenceId", { length: 50 }),
  transactionAt: timestamp("transactionAt").notNull(),
  entryPlaza: varchar("entryPlaza", { length: 150 }),
  exitPlaza: varchar("exitPlaza", { length: 150 }),
  vehicleClass: varchar("vehicleClass", { length: 20 }),
  agency: varchar("agency", { length: 100 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("toll_transactions_org_idx").on(table.organizationId),
]);

export type TollTransaction = typeof tollTransactions.$inferSelect;
export type InsertTollTransaction = typeof tollTransactions.$inferInsert;

/* ============================================================
 * PARTS INVENTORY
 * ============================================================
 * Parts purchased ahead of any specific repair — quantityRemaining is a
 * denormalized running total, kept in sync whenever a part_usages row is
 * inserted or deleted, so list views can show remaining stock without
 * summing usage history on every read.
 */
export const parts = mysqlTable("parts", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }),
  shopId: int("shopId"),
  invoiceReference: varchar("invoiceReference", { length: 100 }),
  quantityPurchased: int("quantityPurchased").notNull(),
  quantityRemaining: int("quantityRemaining").notNull(),
  unitCost: decimal("unitCost", { precision: 10, scale: 2 }).notNull(),
  totalCost: decimal("totalCost", { precision: 10, scale: 2 }).notNull(),
  datePurchased: timestamp("datePurchased").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("parts_org_idx").on(table.organizationId),
]);

export type Part = typeof parts.$inferSelect;
export type InsertPart = typeof parts.$inferInsert;

// One row per consumption event — a single purchase batch can be used
// across several different vehicles/repairs over time, a few units at a time.
export const partUsages = mysqlTable("part_usages", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  partId: int("partId").notNull(),
  quantityUsed: int("quantityUsed").notNull(),
  vehicleId: int("vehicleId").notNull(),
  repairId: int("repairId"),
  dateUsed: timestamp("dateUsed").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("part_usages_org_idx").on(table.organizationId),
]);

export type PartUsage = typeof partUsages.$inferSelect;
export type InsertPartUsage = typeof partUsages.$inferInsert;

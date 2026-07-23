import { bigint, decimal, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Organizations - one per customer company. Every other table (except this
 * one) is scoped to an organizationId so data never crosses tenants.
 */
export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

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
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  ssnLast4: varchar("ssnLast4", { length: 4 }),
  dateOfBirth: bigint("dateOfBirth", { mode: "number" }),
  cdlExpiry: bigint("cdlExpiry", { mode: "number" }),
  cdlDocumentUrl: text("cdlDocumentUrl"),
  cdlDocumentKey: varchar("cdlDocumentKey", { length: 255 }),
  wheelchairQualified: mysqlEnum("wheelchairQualified", ["yes", "no"]).default("yes").notNull(),
  twoPersonAssist: mysqlEnum("twoPersonAssist", ["yes", "no"]).default("no").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

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
});

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
});

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
});

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
});

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
});

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
});

export type TripStatusEvent = typeof tripStatusEvents.$inferSelect;
export type InsertTripStatusEvent = typeof tripStatusEvents.$inferInsert;

import type { Express, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import * as db from "./db";
import { ENV } from "./_core/env";

const BCRYPT_ROUNDS = 12;
const MOBILE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(ENV.cookieSecret);
}

type MobileTokenPayload = { driverId: number; organizationId: number; deviceId: string };

async function createMobileToken(payload: MobileTokenPayload): Promise<string> {
  const expirationSeconds = Math.floor(Date.now() / 1000) + MOBILE_TOKEN_TTL_SECONDS;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSecretKey());
}

async function verifyMobileToken(token: string | undefined): Promise<MobileTokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    const { driverId, organizationId, deviceId } = payload as Record<string, unknown>;
    if (typeof driverId !== "number" || typeof organizationId !== "number" || typeof deviceId !== "string") return null;
    return { driverId, organizationId, deviceId };
  } catch {
    return null;
  }
}

// Express middleware — verifies the bearer token and attaches the driver
// context to the request, or responds 401 if missing/invalid. Also confirms
// the device binding hasn't been revoked since the token was issued.
async function requireMobileAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const payload = await verifyMobileToken(token);
  if (!payload) {
    res.status(401).json({ error: "Not logged in. Please log in again." });
    return;
  }
  const device = await db.getDriverDeviceByDeviceId(payload.deviceId);
  if (!device || device.driverId !== payload.driverId || device.revokedAt) {
    res.status(401).json({ error: "This device is no longer authorized. Please log in again." });
    return;
  }
  (req as any).mobileAuth = payload;
  next();
}

function generatePairingCode(): string {
  // 6-digit numeric code — easy for a driver to type in on a small screen.
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function registerMobileApi(app: Express) {
  // ---- Pairing: bind a physical device to a driver via a one-time code ----
  app.post("/api/mobile/pair", async (req: Request, res: Response) => {
    const parsed = z.object({
      orgCode: z.string().min(1),
      code: z.string().min(1),
      deviceId: z.string().min(1),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing company code, pairing code, or device ID." });
      return;
    }
    const { orgCode, code, deviceId } = parsed.data;

    const org = await db.getOrganizationByCode(orgCode.trim().toUpperCase());
    if (!org) {
      res.status(400).json({ error: "Company code not recognized. Double-check it with your dispatcher." });
      return;
    }

    const pairing = await db.getPairingCodeByCode(code.trim());
    if (!pairing || pairing.usedAt || pairing.expiresAt.getTime() < Date.now()) {
      res.status(400).json({ error: "This pairing code is invalid or has expired. Ask your dispatcher for a new one." });
      return;
    }
    if (pairing.organizationId !== org.id) {
      res.status(400).json({ error: "This pairing code doesn't belong to that company. Double-check both codes with your dispatcher." });
      return;
    }

    await db.createDriverDevice({
      organizationId: pairing.organizationId,
      driverId: pairing.driverId,
      deviceId,
    });
    await db.markPairingCodeUsed(pairing.id);

    res.json({ success: true });
  });

  // ---- Login: PIN + already-paired device -> bearer token ----
  app.post("/api/mobile/login", async (req: Request, res: Response) => {
    const parsed = z.object({
      deviceId: z.string().min(1),
      pin: z.string().min(1),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing device ID or PIN." });
      return;
    }
    const { deviceId, pin } = parsed.data;

    const device = await db.getDriverDeviceByDeviceId(deviceId);
    if (!device) {
      res.status(401).json({ error: "This device isn't paired yet. Ask your dispatcher for a pairing code." });
      return;
    }

    const driver = await db.getDriverById(device.driverId);
    if (!driver || !driver.pinHash) {
      res.status(401).json({ error: "No PIN has been set for this driver yet. Ask your dispatcher." });
      return;
    }

    const validPin = await bcrypt.compare(pin, driver.pinHash);
    if (!validPin) {
      res.status(401).json({ error: "Incorrect PIN." });
      return;
    }

    await db.touchDriverDeviceLastSeen(device.id);
    const org = await db.getOrganizationById(device.organizationId);
    const token = await createMobileToken({ driverId: driver.id, organizationId: device.organizationId, deviceId });

    res.json({
      token,
      driverName: driver.name,
      organizationName: org?.name ?? "",
    });
  });

  // ---- Current shift status (so the app knows Clock In vs Clock Out) ----
  app.get("/api/mobile/status", requireMobileAuth, async (req: Request, res: Response) => {
    const { driverId, organizationId } = (req as any).mobileAuth as MobileTokenPayload;
    const openShift = await db.getOpenShiftForDriver(organizationId, driverId);
    if (!openShift) {
      res.json({ clockedIn: false });
      return;
    }
    const vehicle = await db.getVehicleById(organizationId, openShift.vehicleId);
    res.json({
      clockedIn: true,
      shift: {
        id: openShift.id,
        vehicleId: openShift.vehicleId,
        vanNumber: vehicle?.vanNumber ?? "",
        clockInAt: openShift.clockInAt,
        clockInMileage: openShift.clockInMileage,
      },
    });
  });

  // ---- List active vehicles, for the van-selection screen ----
  app.get("/api/mobile/vehicles", requireMobileAuth, async (req: Request, res: Response) => {
    const { driverId, organizationId } = (req as any).mobileAuth as MobileTokenPayload;
    const [vehicles, driver] = await Promise.all([
      db.getVehicles(organizationId),
      db.getDriverById(driverId),
    ]);
    const activeVehicles = vehicles.filter(v => v.status === "active");

    // Match against the "Assigned Driver" field set in the Fleet section —
    // it's stored as the driver's name, so a case/whitespace-insensitive
    // comparison keeps this reliable without needing a stricter data model.
    const normalize = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
    const assigned = driver
      ? activeVehicles.find(v => normalize(v.assignedDriver) === normalize(driver.name))
      : undefined;

    res.json({
      vehicles: activeVehicles.map(v => ({ id: v.id, vanNumber: v.vanNumber, mileage: v.mileage })),
      assignedVehicleId: assigned?.id ?? null,
    });
  });

  // ---- Clock in: pick a van, enter starting mileage ----
  app.post("/api/mobile/clock-in", requireMobileAuth, async (req: Request, res: Response) => {
    const { driverId, organizationId, deviceId } = (req as any).mobileAuth as MobileTokenPayload;
    const parsed = z.object({ vehicleId: z.number(), mileage: z.number().min(0) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Select a van and enter your starting mileage." });
      return;
    }

    const existing = await db.getOpenShiftForDriver(organizationId, driverId);
    if (existing) {
      res.status(400).json({ error: "You're already clocked in. Clock out first." });
      return;
    }

    const shift = await db.createDriverShift({
      organizationId,
      driverId,
      vehicleId: parsed.data.vehicleId,
      deviceId,
      clockInAt: new Date(),
      clockInMileage: parsed.data.mileage,
    });

    res.json({ success: true, shiftId: shift.id });
  });

  // ---- Clock out: enter ending mileage, closes the shift ----
  app.post("/api/mobile/clock-out", requireMobileAuth, async (req: Request, res: Response) => {
    const { driverId, organizationId } = (req as any).mobileAuth as MobileTokenPayload;
    const parsed = z.object({ mileage: z.number().min(0) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter your ending mileage." });
      return;
    }

    const openShift = await db.getOpenShiftForDriver(organizationId, driverId);
    if (!openShift) {
      res.status(400).json({ error: "You're not currently clocked in." });
      return;
    }
    if (parsed.data.mileage < openShift.clockInMileage) {
      res.status(400).json({ error: `Ending mileage can't be less than your starting mileage (${openShift.clockInMileage}).` });
      return;
    }

    const clockOutAt = new Date();
    await db.closeDriverShift(openShift.id, clockOutAt, parsed.data.mileage);
    // Keep the vehicle's on-file mileage in sync with the latest odometer reading.
    await db.updateVehicle(organizationId, openShift.vehicleId, { mileage: parsed.data.mileage });

    const milesDriven = parsed.data.mileage - openShift.clockInMileage;
    const hoursWorked = (clockOutAt.getTime() - new Date(openShift.clockInAt).getTime()) / (1000 * 60 * 60);

    res.json({
      success: true,
      milesDriven,
      hoursWorked: Math.round(hoursWorked * 100) / 100,
    });
  });

  // ---- Location ping: only meaningful while clocked in. The app itself
  // stops sending these at clock-out, but we also double check server-side
  // so a stray late request can't keep a stale pin alive. ----
  app.post("/api/mobile/location", requireMobileAuth, async (req: Request, res: Response) => {
    const { driverId, organizationId } = (req as any).mobileAuth as MobileTokenPayload;
    const parsed = z.object({ latitude: z.number(), longitude: z.number() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing latitude/longitude." });
      return;
    }

    const openShift = await db.getOpenShiftForDriver(organizationId, driverId);
    if (!openShift) {
      res.status(400).json({ error: "Not currently clocked in — location updates are only accepted during a shift." });
      return;
    }

    await db.upsertDriverLocation(organizationId, driverId, openShift.vehicleId, parsed.data.latitude, parsed.data.longitude);
    res.json({ success: true });
  });

  // ---- Timesheet: a driver's own completed shifts within a date range.
  // The app computes its own local week boundaries and sends them here,
  // rather than the server guessing — the server's clock is UTC, but the
  // driver's "week" should follow their own phone's local time. Only
  // returns completed shifts (clockOutAt set); an open shift's hours
  // aren't finalized yet. ----
  app.get("/api/mobile/timesheet", requireMobileAuth, async (req: Request, res: Response) => {
    const { driverId, organizationId } = (req as any).mobileAuth as MobileTokenPayload;
    const parsed = z.object({
      startDate: z.coerce.number(),
      endDate: z.coerce.number(),
    }).safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid startDate/endDate." });
      return;
    }

    const shifts = await db.getDriverShifts(organizationId, { startDate: parsed.data.startDate, endDate: parsed.data.endDate });
    const ownCompletedShifts = shifts.filter(s => s.driverId === driverId && s.clockOutAt != null);

    res.json({
      shifts: ownCompletedShifts.map(s => ({
        clockInAt: s.clockInAt,
        clockOutAt: s.clockOutAt,
        hoursWorked: Math.round(((new Date(s.clockOutAt!).getTime() - new Date(s.clockInAt).getTime()) / (1000 * 60 * 60)) * 100) / 100,
      })),
    });
  });
}

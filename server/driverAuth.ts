// PIN-based session handling for the driver mobile portal — kept separate
// from server/auth.ts (email/password office login) since drivers aren't
// `users`/`organizationMembers`, just `drivers` rows given portal access via
// a PIN an admin sets from the Driver Abstracts page.
import { DRIVER_COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Driver } from "../drizzle/schema";
import * as db from "./db";
import { getSecretKey } from "./auth";
import { getSessionCookieOptions } from "./_core/cookies";

const BCRYPT_ROUNDS = 10;
const PIN_REGEX = /^\d{4}$/;

export function isValidPin(pin: string): boolean {
  return PIN_REGEX.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export type DriverSessionPayload = { driverId: number; organizationId: number };

export async function createDriverSessionToken(driverId: number, organizationId: number): Promise<string> {
  const issuedAt = Date.now();
  const expirationSeconds = Math.floor((issuedAt + ONE_YEAR_MS) / 1000);
  return new SignJWT({ driverId, organizationId, kind: "driver" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSecretKey());
}

async function verifyDriverSessionToken(token: string | undefined | null): Promise<DriverSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    const { driverId, organizationId, kind } = payload as Record<string, unknown>;
    if (kind !== "driver" || typeof driverId !== "number" || typeof organizationId !== "number") return null;
    return { driverId, organizationId };
  } catch {
    return null;
  }
}

// Resolves the driver session cookie into an active driver row, re-checking
// organizationId/status on every request so a deactivated driver or a PIN
// reset invalidates any existing session immediately.
export async function authenticateDriverRequest(req: Request): Promise<Driver | null> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies[DRIVER_COOKIE_NAME];
  const session = await verifyDriverSessionToken(token);
  if (!session) return null;
  const driver = await db.getDriverForPortalLogin(session.organizationId, session.driverId);
  if (!driver || !driver.driverPinHash) return null;
  return driver;
}

export function setDriverSessionCookie(req: Request, res: Response, token: string) {
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(DRIVER_COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
}

export function clearDriverSessionCookie(req: Request, res: Response) {
  const cookieOptions = getSessionCookieOptions(req);
  res.clearCookie(DRIVER_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

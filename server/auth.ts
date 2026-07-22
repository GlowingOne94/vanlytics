import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { User } from "../drizzle/schema";
import * as db from "./db";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { generateToken, hashToken } from "./_core/tokens";
import { sendPasswordResetEmail } from "./_core/email";

const BCRYPT_ROUNDS = 12;

const signupSchema = z.object({
  companyName: z.string().min(1).max(200),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

const acceptInviteSignupSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
});
const acceptInviteLoginSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
});

function slugify(name: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return base || "org";
}

function getSecretKey() {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(ENV.cookieSecret);
}

export type SessionPayload = { userId: number };

export async function createSessionToken(userId: number): Promise<string> {
  const issuedAt = Date.now();
  const expirationSeconds = Math.floor((issuedAt + ONE_YEAR_MS) / 1000);
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    const { userId } = payload as Record<string, unknown>;
    if (typeof userId !== "number") return null;
    return { userId };
  } catch {
    return null;
  }
}

export async function authenticateRequest(req: Request): Promise<User | null> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies[COOKIE_NAME];
  const session = await verifySessionToken(token);
  if (!session) return null;
  const user = await db.getUserById(session.userId);
  return user ?? null;
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid signup data", details: parsed.error.flatten() });
      return;
    }
    const { companyName, name, email, password } = parsed.data;

    const existing = await db.getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: "An account with that email already exists" });
      return;
    }

    const baseSlug = slugify(companyName);
    let slug = baseSlug;
    let attempt = 1;
    while (await db.getOrganizationBySlug(slug)) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    const organization = await db.createOrganization({ name: companyName, slug });
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await db.createUser({
      email,
      passwordHash,
      name,
      lastSignedIn: new Date(),
    });
    // First user of a new company is its admin.
    await db.createOrganizationMember({ organizationId: organization.id, userId: user.id, role: "admin" });

    const token = await createSessionToken(user.id);
    setSessionCookie(req, res, token);
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid login data" });
      return;
    }
    const { email, password } = parsed.data;

    const user = await db.getUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    await db.touchLastSignedIn(user.id);
    const token = await createSessionToken(user.id);
    setSessionCookie(req, res, token);
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please enter a valid email address." });
      return;
    }
    const { email } = parsed.data;
    const user = await db.getUserByEmail(email);

    if (user) {
      const token = generateToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.createPasswordResetToken({ userId: user.id, tokenHash, expiresAt });
      await sendPasswordResetEmail({ to: user.email, token });
    }

    // Always return the same response whether or not the email exists, so
    // this endpoint can't be used to discover which emails have accounts.
    res.json({ success: true, message: "If an account exists for that email, we've sent a reset link." });
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    const { token, newPassword } = parsed.data;
    const resetToken = await db.getPasswordResetTokenByHash(hashToken(token));

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() < Date.now()) {
      res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.updateUserPassword(resetToken.userId, passwordHash);
    await db.markPasswordResetTokenUsed(resetToken.id);
    res.json({ success: true });
  });

  // Accept a team invite by creating a brand new account (no existing user
  // for the invited email yet).
  app.post("/api/invites/accept-signup", async (req: Request, res: Response) => {
    const parsed = acceptInviteSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please fill in your name and a password (8+ characters)." });
      return;
    }
    const { token, name, password } = parsed.data;
    const invite = await db.getInviteByTokenHash(hashToken(token));
    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
      res.status(400).json({ error: "This invite is invalid or has expired." });
      return;
    }
    const existing = await db.getUserByEmail(invite.email);
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists. Please log in instead." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await db.createUser({ email: invite.email, passwordHash, name, lastSignedIn: new Date() });
    await db.createOrganizationMember({ organizationId: invite.organizationId, userId: user.id, role: invite.role });
    await db.markInviteAccepted(invite.id);

    const sessionToken = await createSessionToken(user.id);
    setSessionCookie(req, res, sessionToken);
    res.json({ success: true, organizationId: invite.organizationId });
  });

  // Accept a team invite by logging into an existing account with that email.
  app.post("/api/invites/accept-login", async (req: Request, res: Response) => {
    const parsed = acceptInviteLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please enter your password." });
      return;
    }
    const { token, password } = parsed.data;
    const invite = await db.getInviteByTokenHash(hashToken(token));
    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
      res.status(400).json({ error: "This invite is invalid or has expired." });
      return;
    }
    const user = await db.getUserByEmail(invite.email);
    if (!user) {
      res.status(404).json({ error: "No account found for this email. Use the sign-up option instead." });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Incorrect password." });
      return;
    }

    const existingMembership = await db.getMembership(user.id, invite.organizationId);
    if (!existingMembership) {
      await db.createOrganizationMember({ organizationId: invite.organizationId, userId: user.id, role: invite.role });
    }
    await db.markInviteAccepted(invite.id);
    await db.touchLastSignedIn(user.id);

    const sessionToken = await createSessionToken(user.id);
    setSessionCookie(req, res, sessionToken);
    res.json({ success: true, organizationId: invite.organizationId });
  });
}

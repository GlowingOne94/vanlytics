import { createHash, randomUUID } from "node:crypto";

// One-way hash of a token before storing it — so a leaked database never
// exposes usable reset/invite links, only their hashes.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

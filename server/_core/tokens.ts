import { createHash, randomUUID } from "node:crypto";

// One-way hash of a token before storing it — so a leaked database never
// exposes usable reset/invite links, only their hashes.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

// Short, human-typeable organization code (e.g. for mobile app pairing) —
// avoids visually ambiguous characters like 0/O and 1/I/L.
const ORG_CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateOrgCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ORG_CODE_CHARSET[Math.floor(Math.random() * ORG_CODE_CHARSET.length)];
  }
  return code;
}

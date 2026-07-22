// Tracks which organization the user is currently viewing, on this device.
// Sent as a header on every API request so the server knows which company's
// data to read/write (validated server-side against real memberships).
const KEY = "fg_active_organization_id";

export function getActiveOrgId(): number | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function setActiveOrgId(id: number) {
  localStorage.setItem(KEY, String(id));
}

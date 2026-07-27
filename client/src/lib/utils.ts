import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Safely formats an epoch-ms value for a native <input type="date">'s
// `value` prop. Returns "" for null/undefined/NaN instead of throwing —
// this is what prevents the "RangeError: Invalid time value" crash that
// happens when a date field gets cleared or is mid-edit.
export function toDateInputValue(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

// Safely parses a native date <input>'s onChange value back into epoch ms.
// Returns `fallback` (defaults to now) instead of NaN when the field is
// empty or mid-edit, so invalid intermediate states never reach state.
export function fromDateInputValue(value: string, fallback: number = Date.now()): number {
  if (!value) return fallback;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : fallback;
}

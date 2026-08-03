import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Safely formats an epoch-ms value for a native <input type="date">'s
// `value` prop. Returns "" for null/undefined/NaN instead of throwing —
// this is what prevents the "RangeError: Invalid time value" crash that
// happens when a date field gets cleared or is mid-edit.
//
// Uses LOCAL date components (not toISOString, which converts to UTC
// first) — otherwise anyone in a timezone behind UTC (all of the US) sees
// the date shifted a day earlier than what was actually picked/stored.
export function toDateInputValue(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Safely parses a native date <input>'s onChange value back into epoch ms.
// Returns `fallback` (defaults to now) instead of NaN when the field is
// empty or mid-edit, so invalid intermediate states never reach state.
//
// Parses the Y/M/D components directly into a LOCAL midnight Date, rather
// than `new Date("2026-08-15")` — that form is parsed as UTC midnight per
// spec, which is the other half of the same off-by-one-day bug.
export function fromDateInputValue(value: string, fallback: number = Date.now()): number {
  if (!value) return fallback;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(p => !Number.isFinite(p))) return fallback;
  const [year, month, day] = parts;
  const d = new Date(year, month - 1, day);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : fallback;
}

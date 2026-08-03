export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// E-ZPass statements sometimes include account-level entries (like a
// balance top-up or the tag lease fee) under the "Exit Plaza" column
// instead of a real toll crossing. These should stay visible in the
// transaction list for record-keeping, but never count toward any total.
export const NON_TOLL_EXIT_PLAZAS = new Set(["PAYMENT", "TAG LEASING FEE"]);

export function isCountableToll(exitPlaza: string | null | undefined): boolean {
  return !NON_TOLL_EXIT_PLAZAS.has((exitPlaza ?? "").trim().toUpperCase());
}

export const COOKIE_NAME = "app_session_id";
// Separate cookie for the driver mobile portal (PIN-based session), kept
// distinct from the admin/office login cookie above so a phone can't
// accidentally mix the two, and so driver access can be revoked (by
// clearing a PIN) without touching office logins.
export const DRIVER_COOKIE_NAME = "driver_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

/**
 * Session cookie names, in a module free of `server-only` and of any database
 * import — the proxy (middleware) needs them too, and it cannot pull in Prisma.
 */
export const POS_COOKIE = "easy_drive_pos";
export const POS_COOKIE_PATH = "/";

export const PANEL_COOKIE = "easy_drive_panel";
export const PANEL_COOKIE_PATH = "/panel";

import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

/** Meta Pixel ids are 8-20 digits. Anything else (typo, placeholder) disables the integration. */
function metaPixelId(): string {
  const value = (process.env.META_PIXEL_ID ?? "").trim();
  return /^\d{8,20}$/.test(value) ? value : "";
}

export const env = {
  // Kimi OAuth is no longer used for admin login (see api/local-auth.ts) —
  // these stay optional so the server doesn't crash on hosts where they're unset.
  appId: process.env.APP_ID ?? "",
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  kimiAuthUrl: process.env.KIMI_AUTH_URL ?? "",
  kimiOpenUrl: process.env.KIMI_OPEN_URL ?? "",
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",
  // Bootstraps the one admin account on first server start — set these in
  // the hosting dashboard, no CLI/DB access needed.
  adminEmail: required("ADMIN_EMAIL"),
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  // Meta Pixel + Conversions API (docs/meta-pixel.md). Empty META_PIXEL_ID = the
  // whole integration is off: no script, no CSP entries, no requests to Meta.
  metaPixelId: metaPixelId(),
  // Secret, server-only: never sent to the browser, never logged.
  metaCapiToken: (process.env.META_CAPI_TOKEN ?? "").trim(),
  // Events Manager → Test events code (e.g. TEST12345); leave empty in production.
  metaCapiTestEventCode: (process.env.META_CAPI_TEST_EVENT_CODE ?? "").trim(),
};

import { platformAdminHandlers } from "@/lib/platform-admin-auth";

// Auth.js v5 splits handlers per HTTP verb. Spreading the handlers
// object keeps Next happy without us re-declaring each verb manually.
export const { GET, POST } = platformAdminHandlers;

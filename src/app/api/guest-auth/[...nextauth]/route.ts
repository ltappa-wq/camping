import { guestHandlers } from "@/lib/guest-auth";

// Re-export Auth.js's GET/POST handlers under a distinct base path so the
// operator-side handler at /api/auth/[...nextauth] stays untouched.
export const { GET, POST } = guestHandlers;

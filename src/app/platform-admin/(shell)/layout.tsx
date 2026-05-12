import { requirePlatformAdminSession } from "@/lib/platform-admin-auth";
import { PlatformSidebar } from "./_components/platform-sidebar";

export default async function PlatformAdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Every page under the shell requires a platform-admin session. The
  // helper redirects to the sign-in page when the cookie isn't valid.
  const session = await requirePlatformAdminSession();
  return (
    <div className="flex min-h-screen bg-muted/30">
      <PlatformSidebar adminEmail={session.email} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

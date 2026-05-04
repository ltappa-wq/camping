import { redirect } from "next/navigation";

import { requireOperatorProperty } from "@/lib/auth-property";
import { getSetupGap } from "@/lib/setup-status";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireOperatorProperty();

  if (!ctx.property || !ctx.propertyId) {
    redirect("/admin/setup");
  }

  const gap = await getSetupGap(ctx.propertyId);
  if (gap) {
    redirect("/admin/setup");
  }

  return (
    <SidebarProvider>
      <AppSidebar propertyName={ctx.property.name} />
      <SidebarInset>
        <AdminTopbar
          title={ctx.property.name}
          email={ctx.session.user!.email!}
        />
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

import { redirect } from "next/navigation";

import { requireOperatorProperty } from "@/lib/auth-property";
import { getSetupGap } from "@/lib/setup-status";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { OnboardingBanner } from "@/components/admin/onboarding-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toaster";

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

  const needsPaymentSetup =
    !ctx.organization.stripeOnboardingComplete ||
    !ctx.organization.stripeChargesEnabled;

  return (
    <SidebarProvider>
      <AppSidebar propertyName={ctx.property.name} />
      <SidebarInset>
        {ctx.isImpersonating ? (
          <ImpersonationBanner
            organizationName={ctx.impersonatingAdmin.actingAsOrganizationName}
            adminEmail={ctx.impersonatingAdmin.email}
          />
        ) : null}
        <AdminTopbar
          title={ctx.property.name}
          email={ctx.session.user!.email!}
        />
        <main className="flex-1 p-6">
          {needsPaymentSetup ? <OnboardingBanner /> : null}
          {children}
        </main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}

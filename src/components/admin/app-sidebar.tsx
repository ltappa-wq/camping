"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Calculator,
  CalendarDays,
  CalendarOff,
  Grid3x3,
  LayoutDashboard,
  Layers,
  Mail,
  MailOpen,
  TentTree,
  Tag,
  Sparkles,
  ShoppingBag,
  Receipt,
  Wand2,
  Banknote,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/grid", label: "Grid", icon: Grid3x3 },
  { href: "/admin/reservations", label: "Reservations", icon: CalendarDays },
  { href: "/admin/property", label: "Property", icon: Building2 },
  { href: "/admin/email-domain", label: "Email Domain", icon: Mail },
  { href: "/admin/emails", label: "Emails", icon: MailOpen },
  { href: "/admin/site-types", label: "Site Types", icon: Layers },
  { href: "/admin/sites", label: "Sites", icon: TentTree },
  { href: "/admin/rate-plans", label: "Rate Plans", icon: Tag },
  { href: "/admin/modifiers", label: "Modifiers", icon: Sparkles },
  { href: "/admin/addons", label: "Add-ons", icon: ShoppingBag },
  { href: "/admin/payouts", label: "Payouts", icon: Banknote },
  { href: "/admin/tax-rates", label: "Tax Rates", icon: Receipt },
  { href: "/admin/closed-dates", label: "Closed Dates", icon: CalendarOff },
  { href: "/admin/quote-tester", label: "Quote Tester", icon: Calculator },
] as const;

export function AppSidebar({ propertyName }: { propertyName: string }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="px-2 py-1.5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Property
          </div>
          <div className="truncate font-semibold">{propertyName}</div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                // /admin is a prefix of every other admin route, so it
                // would match all of them with startsWith. Special-case it
                // to require an exact match.
                const active =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname?.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/admin/setup">
                <Wand2 />
                <span>Re-run setup wizard</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

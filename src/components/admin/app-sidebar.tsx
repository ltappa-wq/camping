"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Layers,
  TentTree,
  Tag,
  Sparkles,
  ShoppingBag,
  Receipt,
  Wand2,
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
  { href: "/admin/property", label: "Property", icon: Building2 },
  { href: "/admin/site-types", label: "Site Types", icon: Layers },
  { href: "/admin/sites", label: "Sites", icon: TentTree },
  { href: "/admin/rate-plans", label: "Rate Plans", icon: Tag },
  { href: "/admin/modifiers", label: "Modifiers", icon: Sparkles },
  { href: "/admin/addons", label: "Add-ons", icon: ShoppingBag },
  { href: "/admin/tax-rates", label: "Tax Rates", icon: Receipt },
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
                const active = pathname?.startsWith(item.href);
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

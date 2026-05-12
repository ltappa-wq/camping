"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
} from "lucide-react";

const NAV = [
  { href: "/platform-admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/platform-admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/platform-admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/platform-admin/admins", label: "Admins", icon: ShieldCheck },
] as const;

/**
 * Distinct sidebar for the platform-admin back-office. Lightweight
 * (no collapsible Sidebar primitive — this surface is desktop-only
 * and concierge-grade, not the same density expectation as the
 * operator admin).
 *
 * The PLATFORM badge in the header makes the surface unmistakable
 * even when the URL bar isn't visible (e.g. screen-share, tab
 * thumbnail).
 */
export function PlatformSidebar({
  adminEmail,
}: {
  adminEmail: string;
}) {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r bg-card">
      <div className="border-b p-4">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-900">
          <Activity className="h-3 w-3" />
          Platform
        </span>
        <div className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
          Back-office
        </div>
        <div className="truncate text-sm font-medium">{adminEmail}</div>
      </div>
      <nav className="flex flex-col gap-0.5 p-2 text-sm">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/platform-admin"
              ? pathname === "/platform-admin"
              : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

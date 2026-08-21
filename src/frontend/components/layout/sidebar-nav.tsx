"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

import { cn } from "@/frontend/lib/utils";

const NAV_ITEMS = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/opportunities", label: "Opportunities", icon: Sparkles },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/campaign-builder", label: "Campaign Builder", icon: SlidersHorizontal },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/buyer", label: "AI Buyer (Demo)", icon: ShoppingBag },
  { href: "/ai-trust", label: "AI Trust", icon: ShieldCheck },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/audit", label: "Audit Trail", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function SidebarNav({
  gatewayMode,
  onNavigate,
}: {
  gatewayMode: "real" | "simulated";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="mb-4 px-3 py-2">
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
          Vriddhi
        </span>
      </div>

      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname?.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <Icon className={cn("size-4", active && "text-sidebar-primary")} />
            {label}
          </Link>
        );
      })}

      <div className="mt-auto flex items-center gap-2 rounded-lg border border-sidebar-border px-3 py-2.5">
        <span className="flex size-6 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
          D
        </span>
        <div className="flex flex-col text-xs leading-tight">
          <span className="font-medium text-sidebar-foreground">Demo merchant</span>
          <span className="text-sidebar-foreground/60">
            {gatewayMode === "real" ? "Razorpay test mode" : "Razorpay (simulated)"}
          </span>
        </div>
      </div>
    </nav>
  );
}

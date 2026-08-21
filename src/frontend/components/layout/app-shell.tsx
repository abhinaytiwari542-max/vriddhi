"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";

import { SidebarNav } from "@/frontend/components/layout/sidebar-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarNav />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 lg:hidden">
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
          Vriddhi
        </span>
        <button
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
          className="rounded-lg p-2 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25 }}
              className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar lg:hidden"
            >
              <div className="flex justify-end p-2">
                <button
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close navigation"
                  className="rounded-lg p-2 text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <X className="size-5" />
                </button>
              </div>
              <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="min-w-0 flex-1 pt-14 lg:pt-0">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}

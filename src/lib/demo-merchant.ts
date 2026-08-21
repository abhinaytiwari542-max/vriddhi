import { prisma } from "@/lib/db";

/**
 * Single-tenant stand-in until Auth.js sessions are wired (deferred from
 * Phase 5 — see project decisions). Every page currently operates on "the"
 * merchant; once login exists this is replaced by the session's merchantId.
 */
export async function getDemoMerchant() {
  return prisma.merchant.findFirst({ orderBy: { createdAt: "asc" } });
}

/**
 * Stand-in for "the currently logged-in user" until real sessions exist.
 * Approval records need a real actorUserId even in the demo, so this is
 * what fills that column for now.
 */
export async function getDemoUser(merchantId: string) {
  return prisma.user.findFirst({ where: { merchantId }, orderBy: { createdAt: "asc" } });
}

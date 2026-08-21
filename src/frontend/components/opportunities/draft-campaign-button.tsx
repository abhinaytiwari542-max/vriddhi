"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { draftCampaignAction } from "@/backend/actions/opportunities-actions";

export function DraftCampaignButton({ opportunityId }: { opportunityId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    status: "drafted" | "blocked" | "already_drafted" | "error";
    message?: string;
  } | null>(null);

  if (result?.status === "drafted" || result?.status === "already_drafted") {
    return (
      <Link
        href="/campaigns"
        className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        View in Campaigns →
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await draftCampaignAction(opportunityId));
          })
        }
        className="w-fit rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "Checking policy…" : "Draft recovery campaign"}
      </button>
      {result?.status === "blocked" && (
        <p className="text-xs text-destructive">{result.message}</p>
      )}
      {result?.status === "error" && (
        <p className="text-xs text-destructive">{result.message}</p>
      )}
    </div>
  );
}

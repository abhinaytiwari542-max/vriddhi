import { BuyerPanel } from "@/frontend/components/buyer/buyer-panel";

export default function BuyerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          AI Buyer (Demo)
        </h1>
        <p className="text-sm text-muted-foreground">
          Agentic commerce in the other direction — a simulated shopper&apos;s AI agent buying
          from this store&apos;s catalog. Not a merchant tool; a demonstration that the same
          guardrail discipline (propose → human authorizes → execute) works for a buyer too.
        </p>
      </div>
      <BuyerPanel />
    </div>
  );
}

import { AlertTriangle, FlaskConical, ShieldCheck, Target } from "lucide-react";

import { formatInr } from "@/frontend/lib/format";
import { CORPUS, REAL_FACTS, REAL_NARRATIVE, generateFuzzCases } from "@/backend/lib/ai/eval/corpus";
import { runGroundingEval } from "@/backend/lib/ai/eval/score";
import { MetricTile } from "@/frontend/components/dashboard/metric-tile";
import { Section } from "@/frontend/components/dashboard/section";
import { StatusBadge } from "@/frontend/components/status-badge";
import { VerifierPlayground } from "@/frontend/components/ai-trust/verifier-playground";
import { InjectionPlayground } from "@/frontend/components/ai-trust/injection-playground";

export const dynamic = "force-dynamic";

const FUZZ_COUNT = 300;

export default function AiTrustPage() {
  // Scored on request rather than baked in as a literal, so the figures on
  // this page cannot drift from what the code actually does — if the
  // verifier regresses, this page says so instead of reprinting a number
  // from the README.
  const labeled = runGroundingEval(CORPUS);
  const fuzz = runGroundingEval(generateFuzzCases(FUZZ_COUNT));
  const combined = runGroundingEval([...CORPUS, ...generateFuzzCases(FUZZ_COUNT)]);

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">AI trust layer</h1>
          <p className="text-sm text-muted-foreground">
            This product&rsquo;s safety story used to stop at the tool boundary: the agent
            can&rsquo;t <em>do</em> anything unapproved. But the prose it writes was rendered
            to you verbatim, so it could still <em>say</em> &ldquo;you could recover
            ₹85,000&rdquo;. Every number in that prose is now checked against the figures the
            rules engine actually computed, and prose that fails is never shown.
          </p>
        </div>
        <StatusBadge variant="success">
          <ShieldCheck className="size-3" /> Enforced at runtime
        </StatusBadge>
      </div>

      <Section title="Verifier accuracy" note="Measured, not asserted">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile
            label="Precision"
            value={pct(combined.precision)}
            icon={Target}
            hint="Flagged prose that really was wrong"
          />
          <MetricTile
            label="Recall"
            value={pct(combined.recall)}
            icon={ShieldCheck}
            hint="Corrupted prose that got caught"
          />
          <MetricTile
            label="Cases scored"
            value={String(combined.total)}
            icon={FlaskConical}
            hint={`${CORPUS.length} hand-labeled + ${FUZZ_COUNT} seeded`}
          />
          <MetricTile
            label="False positives"
            value={String(combined.falsePositives)}
            icon={AlertTriangle}
            hint="Clean narratives wrongly blocked"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ConfusionMatrix
            title={`Hand-labeled corpus (${labeled.total})`}
            note="Each case pins one specific behaviour"
            report={labeled}
          />
          <ConfusionMatrix
            title={`Seeded mutations (${fuzz.total})`}
            note="One real figure perturbed per case"
            report={fuzz}
          />
        </div>

        <p className="rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">What these numbers do not say.</span>{" "}
          The positives are all numeric corruptions, which is the failure class this verifier
          is built for — so a perfect score here is evidence that it does its job, not that
          the narration is trustworthy in general. It cannot detect a claim with no number in
          it (&ldquo;recovery is guaranteed&rdquo;), and the corpus is seeded from one real
          narrative, so it measures this prompt rather than the model as a whole. Both are
          real limits, stated rather than averaged away.
        </p>
      </Section>

      <Section
        title="Try to get a fake number past it"
        note="Runs the real verifier, live in your browser"
      >
        <VerifierPlayground
          initialText={[
            REAL_NARRATIVE.whatHappened,
            REAL_NARRATIVE.recommendedAction,
            REAL_NARRATIVE.ifYouApprove,
          ].join(" ")}
          facts={REAL_FACTS}
          factLabels={[
            { label: "Stalled value", value: formatInr(10_982_000) },
            { label: "High-intent cart value", value: formatInr(6_629_400) },
            { label: "Recovery range (low)", value: formatInr(994_410) },
            { label: "Recovery range (high)", value: formatInr(1_657_350) },
            { label: "Campaign cost", value: formatInr(210_000) },
            { label: "Discount / customer", value: formatInr(10_000) },
            { label: "Counts", value: "43, 21" },
            { label: "Assumed recovery", value: "15%, 25%" },
          ]}
        />
      </Section>

      <Section
        title="Indirect prompt injection"
        note="Customer names are attacker-controlled data"
      >
        <p className="max-w-3xl text-xs text-muted-foreground">
          The narration prompt interpolates real customer names as evidence. Anyone who can
          get a record into the store chooses what those say, so they are screened and
          neutralised before they reach the prompt. To be precise about the stakes: this call
          passes no tools and is pinned to a four-string schema, so injected text could never
          move money — what it could do is corrupt the advice you read.
        </p>
        <InjectionPlayground />
      </Section>
    </div>
  );
}

function ConfusionMatrix({
  title,
  note,
  report,
}: {
  title: string;
  note: string;
  report: ReturnType<typeof runGroundingEval>;
}) {
  const cells = [
    { label: "True positive", value: report.truePositives, tone: "text-success" },
    { label: "False negative", value: report.falseNegatives, tone: "text-destructive" },
    { label: "False positive", value: report.falsePositives, tone: "text-destructive" },
    { label: "True negative", value: report.trueNegatives, tone: "text-success" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="mb-3 text-[11px] text-muted-foreground">{note}</p>
      <dl className="grid grid-cols-2 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg bg-muted p-2.5">
            <dt className="text-[11px] text-muted-foreground">{c.label}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${c.tone}`}>{c.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

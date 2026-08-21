// ---------------------------------------------------------------------------
// Scorer for the grounding verifier.
//
// Runs the verifier over the labeled corpus and reports a confusion matrix
// with precision, recall and F1. Entirely deterministic and offline: no
// model is called, so this runs in CI, runs with the API quota exhausted,
// and gives the same answer every time. That is a deliberate property — an
// eval whose own scorer is an LLM call cannot be a regression gate.
//
// The detection rule under test is `!report.ok`, i.e. "at least one critical
// finding". Warnings are recorded but do not count as detections, because
// the runtime does not block on them either; scoring a signal the product
// ignores would measure something nobody ships.
// ---------------------------------------------------------------------------

import { verifyGrounding, type GroundingFinding } from "@/backend/lib/ai/grounding";
import { CORPUS, REAL_FACTS, type CorpusCase } from "@/backend/lib/ai/eval/corpus";

export type CaseOutcome = {
  id: string;
  operator: string;
  intent: string;
  expectedUngrounded: boolean;
  detected: boolean;
  /** TP / FP / TN / FN — the cell of the confusion matrix this case landed in. */
  cell: "TP" | "FP" | "TN" | "FN";
  criticalFindings: GroundingFinding[];
  warningFindings: GroundingFinding[];
};

export type EvalReport = {
  total: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  /** Of the narratives flagged, how many really were ungrounded. */
  precision: number;
  /** Of the ungrounded narratives, how many were caught. */
  recall: number;
  f1: number;
  accuracy: number;
  outcomes: CaseOutcome[];
};

function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function scoreCase(testCase: CorpusCase): CaseOutcome {
  const report = verifyGrounding({ ...testCase.fields }, REAL_FACTS);
  const detected = !report.ok;

  const cell = testCase.ungrounded
    ? detected
      ? "TP"
      : "FN"
    : detected
      ? "FP"
      : "TN";

  return {
    id: testCase.id,
    operator: testCase.operator,
    intent: testCase.intent,
    expectedUngrounded: testCase.ungrounded,
    detected,
    cell,
    criticalFindings: report.findings.filter((f) => f.severity === "critical"),
    warningFindings: report.findings.filter((f) => f.severity === "warning"),
  };
}

export function runGroundingEval(corpus: CorpusCase[] = CORPUS): EvalReport {
  const outcomes = corpus.map(scoreCase);

  const count = (cell: CaseOutcome["cell"]) => outcomes.filter((o) => o.cell === cell).length;
  const truePositives = count("TP");
  const falsePositives = count("FP");
  const trueNegatives = count("TN");
  const falseNegatives = count("FN");

  const precision = safeDiv(truePositives, truePositives + falsePositives);
  const recall = safeDiv(truePositives, truePositives + falseNegatives);

  return {
    total: outcomes.length,
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    precision,
    recall,
    f1: safeDiv(2 * precision * recall, precision + recall),
    accuracy: safeDiv(truePositives + trueNegatives, outcomes.length),
    outcomes,
  };
}

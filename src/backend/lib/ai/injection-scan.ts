// ---------------------------------------------------------------------------
// Indirect prompt-injection screening for untrusted data.
//
// explain-opportunity.ts builds its prompt by interpolating customer names
// straight into the instruction text ("Sample evidence (real customers)").
// Those names are attacker-controlled: anyone who can get a record into the
// merchant's store can choose what they say. That is textbook indirect
// prompt injection — the payload arrives through data the system legitimately
// reads, not through anything the merchant typed.
//
// What is and is not at risk here, stated precisely, because overclaiming
// would be the same sin as the thesis this module exists to shore up:
// the narration call passes no tools and is pinned to a four-string JSON
// schema, so injected text CANNOT move money or trigger an action. What it
// can do is corrupt the prose a merchant reads and trusts — bogus advice, a
// fabricated "verified by Razorpay" claim, a lure toward an external URL.
//
// Two separate mechanisms, because detection alone is not a defense:
//   1. neutralizeForPrompt() — always applied. Structural: strips control
//      characters, collapses newlines, caps length, and quotes the value so
//      it cannot escape its slot. This is what actually holds.
//   2. scanUntrustedText() — advisory. Pattern-matches known injection
//      shapes so the attempt can be logged, surfaced, and counted. A
//      denylist can always be paraphrased around; it is monitoring, not a
//      wall, and is treated as such.
// ---------------------------------------------------------------------------

export type InjectionRisk = "none" | "low" | "high";

export type InjectionSignal = {
  /** Stable identifier for the rule that fired, for logging and tests. */
  rule: string;
  /** What the rule is looking for, in plain language. */
  description: string;
  /** The offending substring, truncated for safe logging. */
  match: string;
  severity: "low" | "high";
};

export type InjectionScanResult = {
  suspicious: boolean;
  risk: InjectionRisk;
  signals: InjectionSignal[];
};

type Rule = {
  rule: string;
  description: string;
  severity: "low" | "high";
  pattern: RegExp;
};

/** Zero-width and bidi-override characters, as an escaped class. */
const INVISIBLE_CLASS = "\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF";
/** C0/C1 control characters. */
const CONTROL_CLASS = "\\u0000-\\u001F\\u007F";

/**
 * Ordered high-signal first. Every pattern here corresponds to a shape seen
 * in real indirect-injection payloads rather than a guess: instruction
 * override, role impersonation, fake system/tool framing, data exfiltration,
 * and the invisible-character tricks used to hide any of the above from a
 * human reviewing the record in a dashboard.
 */
const RULES: Rule[] = [
  {
    rule: "instruction_override",
    description: "Tries to cancel earlier instructions",
    severity: "high",
    pattern:
      /\b(?:ignore|disregard|forget|override|discard)\b[^.]{0,30}\b(?:previous|prior|earlier|above|all)\b|\bnew\s+instructions?\b/i,
  },
  {
    rule: "role_impersonation",
    description: "Impersonates the system or a new persona",
    severity: "high",
    pattern:
      /\b(?:system|assistant|developer)\s*:|\byou\s+are\s+(?:now|a)\b|\bact\s+as\b|\bpretend\s+(?:to\s+be|you)\b/i,
  },
  {
    rule: "tool_invocation",
    description: "Mimics a tool or function call",
    severity: "high",
    pattern:
      /\b(?:function_call|tool_call|tool_code|create_campaign|create_payment_order|call\s+the\s+tool)\b/i,
  },
  {
    rule: "prompt_delimiter",
    description: "Injects prompt or chat delimiters",
    severity: "high",
    pattern: /<\|[^|>]{1,40}\|>|\[\/?INST\]|<\/?(?:system|user|assistant)>|```/i,
  },
  {
    rule: "exfiltration",
    description: "Points at an external destination",
    severity: "high",
    pattern: /\bhttps?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]{2,}|\bsend\s+(?:it|this|data)\s+to\b/i,
  },
  {
    rule: "authority_claim",
    description: "Claims false verification or authority",
    severity: "low",
    pattern: /\b(?:verified|approved|authorized|certified)\s+by\b|\bofficial\s+(?:notice|message)\b/i,
  },
  {
    rule: "invisible_characters",
    description: "Hides text with zero-width or direction-override characters",
    severity: "high",
    pattern: new RegExp(`[${INVISIBLE_CLASS}]`),
  },
  {
    rule: "control_characters",
    description: "Embeds newlines or control characters to break out of its slot",
    severity: "low",
    pattern: new RegExp(`[${CONTROL_CLASS}]`),
  },
];

/**
 * A customer name is a name. Well past this and it is being used as a
 * carrier for something else, whatever the words say.
 */
const IMPLAUSIBLE_LENGTH = 80;

function truncate(value: string, max = 60): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/** Pattern-matches known injection shapes. Advisory only — see header. */
export function scanUntrustedText(value: string): InjectionScanResult {
  const signals: InjectionSignal[] = [];

  for (const rule of RULES) {
    const m = value.match(rule.pattern);
    if (m) {
      signals.push({
        rule: rule.rule,
        description: rule.description,
        match: truncate(m[0]),
        severity: rule.severity,
      });
    }
  }

  if (value.length > IMPLAUSIBLE_LENGTH) {
    signals.push({
      rule: "implausible_length",
      description: "Far longer than a real name",
      match: `${value.length} characters`,
      severity: "low",
    });
  }

  const risk: InjectionRisk = signals.some((s) => s.severity === "high")
    ? "high"
    : signals.length > 0
      ? "low"
      : "none";

  return { suspicious: signals.length > 0, risk, signals };
}

/**
 * Makes an untrusted value safe to drop into a prompt slot.
 *
 * This is the part that actually defends: regardless of what any rule
 * matched, the value loses its control characters, cannot span lines, is
 * length-capped, and is wrapped in quotes so it reads as a quoted datum
 * rather than as continuing prose. A value scored `high` is replaced
 * outright with a neutral placeholder — for a customer name the model needs
 * only enough to refer to someone, so discarding a hostile one costs the
 * narration nothing, which makes failing closed the cheap option.
 */
export function neutralizeForPrompt(
  value: string | null | undefined,
  placeholder: string
): { safe: string; scan: InjectionScanResult; replaced: boolean } {
  const raw = (value ?? "").trim();
  const scan = scanUntrustedText(raw);

  if (!raw || scan.risk === "high") {
    return { safe: placeholder, scan, replaced: true };
  }

  const flattened = raw
    .replace(new RegExp(`[${CONTROL_CLASS}${INVISIBLE_CLASS}]`, "g"), " ")
    .replace(/\s+/g, " ")
    .replace(/"/g, "'")
    .trim();

  const capped = flattened.slice(0, IMPLAUSIBLE_LENGTH);
  return { safe: `"${capped}"`, scan, replaced: false };
}

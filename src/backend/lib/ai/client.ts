import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// Multi-key fallback — added because the free-tier Gemini quota (20
// requests/day per key) has repeatedly blocked live testing throughout this
// project (see project memory, Phase 18 onward). GEMINI_API_KEYS holds a
// comma-separated list; GEMINI_API_KEY (singular) still works as a
// single-key fallback for backward compatibility. Only advances to the next
// key on a quota/rate-limit error — any other error (bad request, network)
// is not retried with a different key, since a different key wouldn't fix it.
// ---------------------------------------------------------------------------

function loadApiKeys(): string[] {
  const list = process.env.GEMINI_API_KEYS;
  if (list && list.trim()) {
    return list
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }
  return process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : [];
}

const API_KEYS = loadApiKeys();
const clients: (GoogleGenAI | undefined)[] = [];

/** Sticky index — a call that succeeds with key N means the next call
 * starts trying from key N too, instead of re-trying already-exhausted
 * keys from the front every single time within this process's lifetime. */
let currentKeyIndex = 0;

/**
 * Per-key cooldown. The sticky index alone wasn't enough: the free-tier
 * quota is a *daily* limit, so once 8 of 9 keys are spent for the day, the
 * first call in every fresh process still paid 8 failed network
 * round-trips before reaching the one working key — several seconds of
 * dead air that made the UI look broken rather than slow. Marking a key
 * as exhausted and skipping it for a cooldown window turns that into one
 * attempt. Cooldown (not permanent) because a rate-limit is often
 * per-minute rather than per-day, and because quotas do reset.
 */
const KEY_COOLDOWN_MS = 15 * 60 * 1000;
const exhaustedUntil: number[] = [];

function isCoolingDown(index: number): boolean {
  const until = exhaustedUntil[index];
  return typeof until === "number" && Date.now() < until;
}

function clientForIndex(i: number): GoogleGenAI {
  if (!clients[i]) clients[i] = new GoogleGenAI({ apiKey: API_KEYS[i] });
  return clients[i]!;
}

export function hasGeminiKey(): boolean {
  return API_KEYS.length > 0;
}

/**
 * Lets callers tell "we're out of free-tier quota for the day" apart from
 * "something broke", so the UI can say which one is true instead of
 * showing a generic "try again in a moment" for a wall that won't move
 * until the quota resets.
 */
export function isQuotaExhausted(err: unknown): boolean {
  return isQuotaOrRateLimitError(err);
}

function isQuotaOrRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("429") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("RATE_LIMIT") ||
    message.includes("quota")
  );
}

/**
 * Transient, model-side failures — not the key's fault. Gemini returns
 * `503 UNAVAILABLE "This model is currently experiencing high demand"`
 * fairly often on the free tier. This used to abort the whole rotation
 * instantly (only quota errors were retryable), so a single transient 503
 * killed the request even with eight untried keys left, and the UI showed
 * "AI explanation unavailable" for a problem that a retry would have
 * cleared. Worth retrying, but NOT worth putting the key in cooldown,
 * since the key itself is fine.
 */
function isTransientServerError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("503") ||
    message.includes("UNAVAILABLE") ||
    message.includes("overloaded") ||
    message.includes("500") ||
    message.includes("INTERNAL")
  );
}

/**
 * Runs `fn` against each configured Gemini API key in turn, starting from
 * the last key known to work. Every caller (agent.ts, buyer-agent.ts,
 * explain-opportunity.ts) routes its actual `generateContent` call through
 * this instead of holding its own client, so key rotation is the single
 * behavior of this module, not duplicated per caller.
 */
export async function callGemini<T>(fn: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  if (API_KEYS.length === 0) {
    throw new Error("No Gemini API key configured (set GEMINI_API_KEY or GEMINI_API_KEYS).");
  }

  const fresh: number[] = [];
  const cooling: number[] = [];
  for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
    const index = (currentKeyIndex + attempt) % API_KEYS.length;
    (isCoolingDown(index) ? cooling : fresh).push(index);
  }

  // Try every key not in cooldown, but when they're ALL cooling down probe
  // only ONE — the one whose cooldown expires soonest — instead of the
  // whole list. This is the difference between failing in ~1 second and
  // failing in ~82: measured live with all 9 keys out of daily quota, the
  // agent's 6-turn tool loop was making up to 54 doomed network calls per
  // question while the UI sat on "Thinking…", which reads as a hung app
  // rather than an exhausted quota. One probe still lets a genuinely
  // recovered key back in, since a cooldown is a hint, not proof.
  const soonestCooling = cooling
    .slice()
    .sort((a, b) => (exhaustedUntil[a] ?? 0) - (exhaustedUntil[b] ?? 0))
    .slice(0, 1);
  const order = fresh.length > 0 ? fresh : soonestCooling;

  let lastError: unknown;
  for (const index of order) {
    try {
      const result = await fn(clientForIndex(index));
      currentKeyIndex = index;
      exhaustedUntil[index] = 0;
      return result;
    } catch (err) {
      lastError = err;
      if (isQuotaOrRateLimitError(err)) {
        exhaustedUntil[index] = Date.now() + KEY_COOLDOWN_MS;
        console.error(`[gemini] key #${index + 1}/${API_KEYS.length} exhausted or rate-limited — trying next key`);
        // A *per-day* quota is scoped to the Google Cloud project, not the
        // key (established earlier in this project: 7 of these 9 keys share
        // one project). So when the daily limit is what got hit, the other
        // keys on that project are already spent too — cooling them all
        // down now avoids re-discovering that one doomed round-trip at a
        // time. Deliberately only for the PerDay signature, not for a
        // per-minute rate limit, which really is per-key transient.
        if (/PerDay|per day|generate_content_free_tier_requests/i.test(String(err))) {
          const until = Date.now() + KEY_COOLDOWN_MS;
          for (let k = 0; k < API_KEYS.length; k++) {
            if (!isCoolingDown(k)) exhaustedUntil[k] = until;
          }
          console.error("[gemini] daily project quota hit — cooling down all keys");
        }
        continue;
      }
      if (isTransientServerError(err)) {
        console.error(`[gemini] key #${index + 1}/${API_KEYS.length} hit a transient server error — trying next key`);
        continue;
      }
      // A real error (bad request, bad schema, auth) — another key won't
      // fix it, so fail fast rather than burning the whole key list.
      throw err;
    }
  }
  throw lastError;
}

// Using Gemini instead of Anthropic Claude (the Phase 0/3 plan) — no
// Anthropic key was available; a working Gemini key was provided instead.
export const OPPORTUNITY_EXPLANATION_MODEL = "gemini-3.6-flash";

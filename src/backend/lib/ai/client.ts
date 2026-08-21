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

function clientForIndex(i: number): GoogleGenAI {
  if (!clients[i]) clients[i] = new GoogleGenAI({ apiKey: API_KEYS[i] });
  return clients[i]!;
}

export function hasGeminiKey(): boolean {
  return API_KEYS.length > 0;
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

  let lastError: unknown;
  for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
    const index = (currentKeyIndex + attempt) % API_KEYS.length;
    try {
      const result = await fn(clientForIndex(index));
      currentKeyIndex = index;
      return result;
    } catch (err) {
      lastError = err;
      if (!isQuotaOrRateLimitError(err)) throw err;
      console.error(`[gemini] key #${index + 1}/${API_KEYS.length} exhausted or rate-limited — trying next key`);
    }
  }
  throw lastError;
}

// Using Gemini instead of Anthropic Claude (the Phase 0/3 plan) — no
// Anthropic key was available; a working Gemini key was provided instead.
export const OPPORTUNITY_EXPLANATION_MODEL = "gemini-3.6-flash";

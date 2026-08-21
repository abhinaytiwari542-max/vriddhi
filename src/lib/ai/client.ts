import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

/** Returns null (never throws) when no API key is configured, so callers
 * can degrade gracefully instead of crashing a page render. */
export function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

// Using Gemini instead of Anthropic Claude (the Phase 0/3 plan) — no
// Anthropic key was available; a working Gemini key was provided instead.
export const OPPORTUNITY_EXPLANATION_MODEL = "gemini-3.6-flash";

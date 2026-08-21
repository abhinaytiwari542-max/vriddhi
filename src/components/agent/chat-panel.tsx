"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowRight, Bot, Send, User, Wrench } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { sendAgentMessage } from "@/app/(app)/agent/actions";
import type { AgentTraceEntry, ChatTurn } from "@/lib/ai/agent";

type Message = {
  role: "user" | "assistant";
  text: string;
  trace?: AgentTraceEntry[];
  isError?: boolean;
};

const SUGGESTED_PROMPTS = [
  "What opportunities do you see today?",
  "What can I do about abandoned checkout?",
  "Run the highest-impact safe action.",
  "How many customers do I have?",
];

function reasonCopy(reason: "no_api_key" | "api_error" | "max_turns_exceeded") {
  switch (reason) {
    case "no_api_key":
      return "Agent chat is disabled — add GEMINI_API_KEY to enable it.";
    case "api_error":
      return "The Gemini API call failed. Try again in a moment.";
    case "max_turns_exceeded":
      return "This question needed more tool calls than allowed and was stopped for safety.";
  }
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  function send(text: string) {
    if (!text.trim() || pending) return;
    const history: ChatTurn[] = messages
      .filter((m) => !m.isError)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");

    startTransition(async () => {
      const result = await sendAgentMessage(text, history);
      if (result.ok) {
        setMessages((prev) => [...prev, { role: "assistant", text: result.answer, trace: result.trace }]);
      } else {
        // Tool calls can succeed (and already be persisted — e.g. a real
        // draft campaign) even if the final summary text then fails to
        // generate. Don't let a narration failure hide real actions taken.
        const actedText =
          result.trace.length > 0
            ? `I made some progress before hitting an error generating a summary: ${result.trace
                .map((t) => t.tool)
                .join(", ")}. Check Campaigns/Overview to see the result — nothing executed without going through the normal policy and approval checks.`
            : reasonCopy(result.reason);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: actedText, isError: true, trace: result.trace },
        ]);
      }
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    });
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs text-muted-foreground">
        <span>Agent</span>
        <ArrowRight className="size-3" />
        <span>Policy</span>
        <ArrowRight className="size-3" />
        <span>Approval</span>
        <ArrowRight className="size-3" />
        <span>Execution</span>
        <span className="ml-auto text-foreground">
          Nothing the agent proposes executes without your approval.
        </span>
      </div>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Bot className="size-8 text-ai" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Ask about your orders, customers, or opportunities. The agent can also draft a
              recovery campaign — it will always land in Campaigns awaiting your approval.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ai/10 text-ai">
                <Bot className="size-3.5" />
              </span>
            )}
            <div className={`max-w-[80%] space-y-2 ${m.role === "user" ? "order-first" : ""}`}>
              <div
                className={
                  m.role === "user"
                    ? "rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground"
                    : m.isError
                      ? "rounded-2xl bg-warning/10 px-4 py-2 text-sm text-warning"
                      : "rounded-2xl bg-muted px-4 py-2 text-sm text-foreground"
                }
              >
                {m.text}
              </div>
              {m.trace && m.trace.length > 0 && <ToolTrace trace={m.trace} />}
            </div>
            {m.role === "user" && (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="size-3.5" />
              </span>
            )}
          </div>
        ))}

        {pending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Bot className="size-4 text-ai" />
            Thinking…
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask about your revenue, opportunities, or customers…"
          disabled={pending}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring disabled:opacity-50"
        />
        <button
          disabled={pending || !input.trim()}
          onClick={() => send(input)}
          aria-label="Send message"
          className="flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}

function ToolTrace({ trace }: { trace: AgentTraceEntry[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {trace.map((t, i) => (
        <StatusBadge key={i} variant={t.ok ? "info" : "danger"}>
          <Wrench className="size-3" />
          {t.tool}
        </StatusBadge>
      ))}
    </div>
  );
}

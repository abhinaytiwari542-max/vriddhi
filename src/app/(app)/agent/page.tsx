import { ChatPanel } from "@/components/agent/chat-panel";

export default function AgentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Agent
        </h1>
        <p className="text-sm text-muted-foreground">
          Ask Vriddhi about your revenue, opportunities, or what to do next.
        </p>
      </div>
      <ChatPanel />
    </div>
  );
}

import { AppShell } from "@/frontend/components/layout/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Read on the server and passed down, so the sidebar states the real
  // gateway instead of a hardcoded "Razorpay test mode" that stayed put
  // even when the app was running against the simulated gateway.
  const gatewayMode = process.env.RAZORPAY_KEY_ID ? "real" : "simulated";
  return <AppShell gatewayMode={gatewayMode}>{children}</AppShell>;
}

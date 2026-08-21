import { prisma } from "@/lib/db";

export default async function Home() {
  let dbStatus: "connected" | "unreachable" = "unreachable";
  let merchantCount = 0;

  try {
    merchantCount = await prisma.merchant.count();
    dbStatus = "connected";
  } catch {
    dbStatus = "unreachable";
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 font-sans">
      <h1 className="text-2xl font-semibold">Vriddhi — project scaffold</h1>
      <p className="text-sm text-zinc-500">
        Phase 4 checkpoint: this page confirms the app, backend, and database
        are wired together. The real landing page and dashboard UI come in
        Phase 5.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <dt className="text-zinc-500">Database</dt>
        <dd className={dbStatus === "connected" ? "text-green-600" : "text-red-600"}>
          {dbStatus}
        </dd>
        <dt className="text-zinc-500">Merchants seeded</dt>
        <dd>{merchantCount}</dd>
      </dl>
      <p className="mt-4 text-xs text-zinc-400">
        API health check: <code>/api/health</code>
      </p>
    </main>
  );
}

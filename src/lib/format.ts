// Pure formatting helpers with zero server-only dependencies (no Prisma, no
// Node built-ins) so they're safe to import from both server and client
// components without dragging the `pg` driver into a browser bundle.
export function formatInr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

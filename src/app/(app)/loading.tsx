import { BrandedLoader } from "@/components/ui/states";

// Shown automatically while an authed route segment is loading on the server
// (e.g. a cold Neon connection) — gives instant, on-brand feedback.
export default function Loading() {
  return <BrandedLoader />;
}

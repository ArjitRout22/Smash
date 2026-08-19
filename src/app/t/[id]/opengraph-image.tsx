import { ImageResponse } from "next/og";
import { getPublicTournamentView } from "@/lib/services/public.service";

// Prisma needs the Node runtime (not Edge).
export const runtime = "nodejs";
export const alt = "Tournament on Smash";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#22c55e";
const BG = "#0b1220";

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STATUS_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  upcoming: { label: "Upcoming", bg: "rgba(59,130,246,0.18)", fg: "#93c5fd" },
  ongoing: { label: "Ongoing", bg: "rgba(34,197,94,0.18)", fg: "#86efac" },
  completed: { label: "Completed", bg: "rgba(148,163,184,0.18)", fg: "#cbd5e1" },
  cancelled: { label: "Cancelled", bg: "rgba(239,68,68,0.18)", fg: "#fca5a5" },
};

/**
 * Branded 1200×630 share card for a public tournament — what WhatsApp / iMessage
 * / social render when a /t/[id] link is shared. Self-contained (no external
 * assets or fonts); data reuses getPublicTournamentView.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getPublicTournamentView(id).catch(() => null);

  const name = t?.name ?? "Badminton on Smash";
  const status = t ? (STATUS_STYLE[t.status] ?? STATUS_STYLE.upcoming) : null;
  const leader = t?.standings?.[0];
  const metaParts = t
    ? [titleCase(t.format), `${t.players.length} player${t.players.length === 1 ? "" : "s"}`, t.location].filter(Boolean)
    : ["Run tournaments, matches & live standings"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: `linear-gradient(135deg, ${BG} 0%, #10182b 100%)`,
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        {/* Header: wordmark + status */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 64,
                height: 64,
                borderRadius: 16,
                background: GREEN,
                color: "#052e16",
                fontSize: 40,
                fontWeight: 800,
                marginRight: 20,
              }}
            >
              S
            </div>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.5 }}>Smash</div>
          </div>
          {status && (
            <div
              style={{
                display: "flex",
                fontSize: 28,
                fontWeight: 600,
                color: status.fg,
                background: status.bg,
                padding: "10px 24px",
                borderRadius: 999,
              }}
            >
              {status.label}
            </div>
          )}
        </div>

        {/* Body: tournament name + meta pills */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5 }}>{name}</div>
          <div style={{ display: "flex", marginTop: 28, gap: 16 }}>
            {metaParts.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  fontSize: 28,
                  color: "#e2e8f0",
                  background: "rgba(148,163,184,0.14)",
                  padding: "10px 22px",
                  borderRadius: 999,
                }}
              >
                {m}
              </div>
            ))}
          </div>
        </div>

        {/* Footer: leader / tagline + domain */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 30, color: "#e2e8f0" }}>
            {leader
              ? `Leading: ${leader.name} · ${leader.points} pts`
              : "Follow live standings & results"}
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: GREEN }}>smashhero.app</div>
        </div>
      </div>
    ),
    { ...size }
  );
}

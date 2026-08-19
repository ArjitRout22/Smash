import { ImageResponse } from "next/og";
import { getPublicPlayerProfile } from "@/lib/services/public.service";

export const runtime = "nodejs";
export const alt = "Player on Smash";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#22c55e";
const BG = "#0b1220";
const SUBTLE = "#94a3b8";

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 22, letterSpacing: 2, color: SUBTLE }}>{label}</div>
      <div style={{ display: "flex", fontSize: 40, fontWeight: 800, color: "#f8fafc" }}>{value}</div>
    </div>
  );
}

/**
 * Shareable "player card" — the viral hook. Big SmashHero Rating + record, on the
 * app's dark/green brand. Self-contained (no external assets/fonts).
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPublicPlayerProfile(id).catch(() => null);

  const name = (p?.displayName ?? "Smash Player").toUpperCase();

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
        {/* Header: wordmark */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 14,
              background: GREEN,
              color: "#052e16",
              fontSize: 34,
              fontWeight: 800,
              marginRight: 18,
            }}
          >
            S
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>SmashHero</div>
        </div>

        {/* Body: name + rating */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, letterSpacing: 2 }}>{name}</div>
          <div style={{ display: "flex", marginTop: 18, fontSize: 26, fontWeight: 600, letterSpacing: 3, color: GREEN }}>
            SMASHHERO RATING
          </div>
          <div style={{ display: "flex", fontSize: 132, fontWeight: 800, lineHeight: 1, marginTop: 4 }}>{String(p?.rating ?? 1000)}</div>
        </div>

        {/* Footer: stat chips + domain */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          {p ? (
            <div style={{ display: "flex", gap: 56 }}>
              <Chip label="RANK" value={p.rank != null ? `#${p.rank}` : "—"} />
              <Chip label="RECORD" value={`${p.wins}W · ${p.losses}L`} />
              <Chip label="TITLES" value={String(p.titles)} />
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 34, color: "#e2e8f0" }}>Play. Win. Climb.</div>
          )}
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: GREEN }}>smashhero.app</div>
        </div>
      </div>
    ),
    { ...size }
  );
}

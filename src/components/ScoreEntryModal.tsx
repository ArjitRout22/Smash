"use client";

import { useMemo, useState } from "react";
import { api, ApiClientError } from "@/lib/client/api";
import { resolveMatch } from "@/lib/engines/scoring";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export type ScorableMatch = {
  id: string;
  bestOf: number;
  version: number;
  sides: { side: string; label: string }[];
  games?: { scoreA: number; scoreB: number }[];
};

/**
 * Fast, mobile-friendly score entry. Validates live against the badminton
 * scoring engine (the same pure logic the backend enforces) before submitting.
 */
export function ScoreEntryModal({
  open,
  onClose,
  match,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  match: ScorableMatch | null;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const bestOf = match?.bestOf ?? 3;
  const [rows, setRows] = useState<{ a: string; b: string }[]>(() => initialRows(match));
  const [loading, setLoading] = useState(false);

  // Reset rows whenever a different match opens.
  const [lastId, setLastId] = useState<string | null>(match?.id ?? null);
  if (match && match.id !== lastId) {
    setLastId(match.id);
    setRows(initialRows(match));
  }

  const filled = useMemo(
    () =>
      rows
        .filter((r) => r.a !== "" && r.b !== "")
        .map((r) => ({ scoreA: Number(r.a), scoreB: Number(r.b) })),
    [rows]
  );

  const preview = useMemo(() => {
    if (filled.length === 0) return { ok: true, text: "Enter game scores" };
    try {
      const r = resolveMatch(bestOf, filled);
      if (!r.complete) return { ok: true, text: "In progress — winner not yet decided" };
      const winner = r.winnerSide === "A" ? match?.sides[0]?.label : match?.sides[1]?.label;
      return { ok: true, text: `Winner: ${winner} (${r.gamesWonA}–${r.gamesWonB})` };
    } catch (e) {
      return { ok: false, text: e instanceof Error ? e.message : "Invalid score" };
    }
  }, [filled, bestOf, match]);

  if (!match) return null;
  const [aLabel, bLabel] = [match.sides[0]?.label ?? "Side A", match.sides[1]?.label ?? "Side B"];

  async function save() {
    if (!preview.ok || filled.length === 0) {
      toast.error(preview.text);
      return;
    }
    setLoading(true);
    try {
      await api.post(`/api/matches/${match!.id}/scores`, {
        games: filled,
        expectedVersion: match!.version,
      });
      toast.success("Score saved");
      onSaved?.();
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "CONCURRENCY_CONFLICT") {
        toast.error("Someone else updated this match. Reloading…");
        onSaved?.();
        onClose();
      } else {
        toast.error(err instanceof ApiClientError ? err.message : "Could not save score");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enter score"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={save} loading={loading} disabled={!preview.ok || filled.length === 0}>Save score</Button>
        </>
      }
    >
      <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-medium">
        <span className="truncate text-right">{aLabel}</span>
        <span className="text-muted">vs</span>
        <span className="truncate">{bLabel}</span>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <input
              inputMode="numeric"
              aria-label={`Game ${i + 1} ${aLabel} score`}
              className="h-14 w-full rounded-lg border border-[var(--border)] bg-surface text-center text-2xl font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              value={r.a}
              onChange={(e) => update(i, "a", e.target.value, setRows)}
            />
            <span className="text-xs text-muted">G{i + 1}</span>
            <input
              inputMode="numeric"
              aria-label={`Game ${i + 1} ${bLabel} score`}
              className="h-14 w-full rounded-lg border border-[var(--border)] bg-surface text-center text-2xl font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              value={r.b}
              onChange={(e) => update(i, "b", e.target.value, setRows)}
            />
          </div>
        ))}
      </div>

      <p className={`mt-3 text-sm ${preview.ok ? "text-muted" : "text-[var(--danger)]"}`}>{preview.text}</p>
      <p className="mt-1 text-xs text-muted">Best of {bestOf} · standard rules: 21 points, win by 2, cap 30.</p>
    </Modal>
  );
}

function initialRows(match: ScorableMatch | null): { a: string; b: string }[] {
  const bestOf = match?.bestOf ?? 3;
  const existing = match?.games ?? [];
  const rows = existing.map((g) => ({ a: String(g.scoreA), b: String(g.scoreB) }));
  while (rows.length < bestOf) rows.push({ a: "", b: "" });
  return rows.slice(0, bestOf);
}

function update(
  i: number,
  key: "a" | "b",
  value: string,
  setRows: React.Dispatch<React.SetStateAction<{ a: string; b: string }[]>>
) {
  const clean = value.replace(/\D/g, "").slice(0, 2);
  setRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: clean } : r)));
}

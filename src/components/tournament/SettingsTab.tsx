"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { X } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { Card, CardHeader, Button, Input, Textarea, Select, Field } from "@/components/ui/primitives";
import { LocationPicker } from "@/components/LocationPicker";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";
import { TOURNAMENT_STATUSES } from "@/lib/domain/constants";
import {
  STANDARD_POINTS_CONFIG,
  LEAGUE_POINTS_CONFIG,
  resolvePointsConfig,
  pointsSystemOf,
  describePointsSystem,
  type PointsSystem,
} from "@/lib/engines/points";
import { titleCase } from "@/lib/client/format";
import type { TournamentDetail, TournamentPlayerDTO } from "./types";

export function SettingsTab({ tournament, onChanged }: { tournament: TournamentDetail; onChanged: () => void }) {
  const { can } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const canEdit = can(PERMS.TOURNAMENT_EDIT);
  const canDelete = can(PERMS.TOURNAMENT_DELETE);

  const [form, setForm] = useState({
    name: tournament.name,
    description: tournament.description ?? "",
    location: tournament.location ?? "",
    locationLat: tournament.locationLat ?? null,
    locationLng: tournament.locationLng ?? null,
    status: tournament.status,
    visibility: tournament.visibility,
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!canEdit && !canDelete) {
    return <Card className="p-6"><p className="text-sm text-muted">You don&apos;t have permission to edit this tournament.</p></Card>;
  }

  async function save() {
    setSaving(true);
    try {
      await api.put(`/api/tournaments/${tournament.id}`, {
        name: form.name,
        description: form.description || null,
        location: form.location || null,
        locationLat: form.location ? form.locationLat : null,
        locationLng: form.location ? form.locationLng : null,
        status: form.status,
        visibility: form.visibility,
      });
      toast.success("Saved");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api.del(`/api/tournaments/${tournament.id}`);
      toast.success("Tournament deleted");
      router.push("/tournaments");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not delete");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <CardHeader title="Tournament settings" subtitle="Status changes follow allowed transitions (upcoming → ongoing → completed)." />
          <div className="space-y-4 p-5">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {TOURNAMENT_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </Select>
              </Field>
              <Field label="Visibility" hint="Public = discoverable + accepts join requests.">
                <Select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </Select>
              </Field>
            </div>
            <Field label="Location" hint="Search for a venue, or just type an address.">
              <LocationPicker
                value={{ name: form.location, lat: form.locationLat, lng: form.locationLng }}
                onChange={(v) => setForm((f) => ({ ...f, location: v.name, locationLat: v.lat, locationLng: v.lng }))}
              />
            </Field>
            <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="flex justify-end">
              <Button onClick={save} loading={saving} disabled={form.name.trim().length < 2}>Save changes</Button>
            </div>
          </div>
        </Card>
      )}

      {canEdit && <ScoringCard tournament={tournament} onChanged={onChanged} />}

      {canEdit && <ScorersCard tournamentId={tournament.id} />}

      {canDelete && (
        <Card className="border-[var(--danger)]/40">
          <CardHeader title="Danger zone" />
          <div className="flex items-center justify-between p-5">
            <div>
              <p className="font-medium">Delete tournament</p>
              <p className="text-sm text-muted">Soft-deletes the tournament and hides it from listings.</p>
            </div>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete this tournament?"
        message="It will be removed from listings. This action can only be reversed by an administrator."
        confirmLabel="Delete tournament"
        danger
        loading={deleting}
      />
    </div>
  );
}

const SCORING_OPTIONS: { value: PointsSystem; title: string; hint: string }[] = [
  { value: "league", title: "League", hint: describePointsSystem(LEAGUE_POINTS_CONFIG) },
  { value: "standard", title: "International", hint: describePointsSystem(STANDARD_POINTS_CONFIG) },
];

/**
 * Choose how the per-tournament points table is scored. Switching recomputes the
 * standings from stored results, so the table updates immediately. The League
 * system additionally exposes editable point values (win / loss) and an optional
 * close-loss bonus; International stays a fixed BWF-style preset.
 */
function ScoringCard({ tournament, onChanged }: { tournament: TournamentDetail; onChanged: () => void }) {
  const toast = useToast();
  const resolved = resolvePointsConfig(tournament.pointsConfig ?? undefined);
  const current = pointsSystemOf(resolved);
  const [system, setSystem] = useState<PointsSystem>(current);
  const [saving, setSaving] = useState(false);

  // Editable League values — seeded from the current config (or the League
  // preset when the tournament is currently on International).
  const seed = current === "league" ? resolved : LEAGUE_POINTS_CONFIG;
  const [win, setWin] = useState(String(seed.matchWin));
  const [loss, setLoss] = useState(String(seed.matchLoss));
  const [bonusOn, setBonusOn] = useState(seed.lossBonusThreshold != null);
  const [threshold, setThreshold] = useState(String(seed.lossBonusThreshold ?? 15));
  const [bonusPts, setBonusPts] = useState(String(seed.lossBonusPoints ?? 1));

  const winN = Number(win);
  const lossN = Number(loss);
  const thresholdN = Number(threshold);
  const bonusPtsN = Number(bonusPts);
  const valid =
    Number.isInteger(winN) && winN >= 0 &&
    Number.isInteger(lossN) && lossN >= 0 &&
    (!bonusOn || (Number.isInteger(thresholdN) && thresholdN >= 0 && Number.isInteger(bonusPtsN) && bonusPtsN >= 0));

  function leagueConfig() {
    return {
      ...LEAGUE_POINTS_CONFIG,
      matchWin: winN,
      matchLoss: lossN,
      lossBonusThreshold: bonusOn ? thresholdN : null,
      lossBonusPoints: bonusOn ? bonusPtsN : null,
    };
  }

  // "Dirty" when the system changed, or (on League) any point value changed.
  const leagueChanged =
    system === "league" &&
    (current !== "league" ||
      winN !== resolved.matchWin ||
      lossN !== resolved.matchLoss ||
      (bonusOn ? thresholdN : null) !== resolved.lossBonusThreshold ||
      (bonusOn ? bonusPtsN : null) !== resolved.lossBonusPoints);
  const dirty = (system !== current || leagueChanged) && (system === "standard" || valid);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/api/tournaments/${tournament.id}`, {
        pointsConfig: system === "league" ? leagueConfig() : STANDARD_POINTS_CONFIG,
      });
      toast.success("Scoring updated — standings recomputed");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not update scoring");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Scoring system"
        subtitle="How the Leaderboard (points table) awards points. Changing this rescores the existing standings."
      />
      <div className="space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {SCORING_OPTIONS.map((o) => {
            const active = system === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setSystem(o.value)}
                className={`rounded-xl border p-4 text-left transition ${
                  active ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)] hover:bg-surface-2"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{o.title}</span>
                  <span className={`h-4 w-4 rounded-full border-2 ${active ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border)]"}`} />
                </div>
                <p className="mt-1 text-xs text-muted">{o.hint}</p>
              </button>
            );
          })}
        </div>

        {system === "league" && (
          <div className="rounded-xl border border-[var(--border)] bg-surface-2/40 p-4">
            <p className="mb-3 text-sm font-medium text-foreground">League points</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Points for a win">
                <Input type="number" min={0} step={1} value={win} onChange={(e) => setWin(e.target.value)} />
              </Field>
              <Field label="Points for a loss">
                <Input type="number" min={0} step={1} value={loss} onChange={(e) => setLoss(e.target.value)} />
              </Field>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={bonusOn} onChange={(e) => setBonusOn(e.target.checked)} className="h-4 w-4" />
              Award a close-loss bonus
            </label>
            {bonusOn && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Loser reaches at least" hint="Best single-game score">
                  <Input type="number" min={0} step={1} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
                </Field>
                <Field label="Bonus points">
                  <Input type="number" min={0} step={1} value={bonusPts} onChange={(e) => setBonusPts(e.target.value)} />
                </Field>
              </div>
            )}

            <p className="mt-3 text-xs text-muted">
              {valid ? describePointsSystem(leagueConfig()) : "Enter whole numbers (0 or more)."}
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={save} loading={saving} disabled={!dirty || saving}>Save scoring</Button>
        </div>
      </div>
    </Card>
  );
}

type Scorer = { userId: string; playerId: string | null; name: string };

/** Owner-only: nominate registered players to also enter match scores. */
function ScorersCard({ tournamentId }: { tournamentId: string }) {
  const toast = useToast();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: scorers, mutate } = useSWR<Scorer[]>(`/api/tournaments/${tournamentId}/scorers`, swrFetcher);
  const { data: players } = useSWR<TournamentPlayerDTO[]>(`/api/tournaments/${tournamentId}/players`, swrFetcher);

  const scorerPlayerIds = new Set((scorers ?? []).map((s) => s.playerId));
  const candidates = (players ?? []).filter((tp) => !scorerPlayerIds.has(tp.player.id));

  async function add() {
    if (!pick) return;
    setBusy(true);
    try {
      await api.post(`/api/tournaments/${tournamentId}/scorers`, { playerId: pick });
      toast.success("Scorer nominated");
      setPick("");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not nominate");
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    try {
      await api.del(`/api/tournaments/${tournamentId}/scorers/${userId}`);
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not remove");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Scorers"
        subtitle="You (the organizer) can always enter scores. Nominate registered players to help — everyone else can only view. A completed score is locked."
      />
      <div className="space-y-4 p-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} className="sm:flex-1">
            <option value="">Select a registered player…</option>
            {candidates.map((tp) => (
              <option key={tp.player.id} value={tp.player.id}>{tp.player.displayName} · {tp.player.fullName}</option>
            ))}
          </Select>
          <Button onClick={add} loading={busy} disabled={!pick}>Nominate</Button>
        </div>

        {(scorers?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">No nominated scorers yet — only you can enter scores.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {scorers!.map((s) => (
              <li key={s.userId} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium">{s.name}</span>
                <button onClick={() => remove(s.userId)} className="text-muted hover:text-[var(--danger)]" aria-label={`Remove ${s.name}`}>
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

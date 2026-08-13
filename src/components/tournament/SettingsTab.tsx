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

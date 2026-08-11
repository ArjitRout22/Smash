"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, Trash2 } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { Card, Button, Badge, Input, Select, Field } from "@/components/ui/primitives";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";
import type { TeamDTO, TournamentPlayerDTO } from "./types";

export function TeamsTab({ tournamentId }: { tournamentId: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<TeamDTO[]>(
    `/api/teams?tournamentId=${tournamentId}`,
    swrFetcher
  );

  async function remove() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.del(`/api/teams/${deleteId}`);
      toast.success("Team deleted");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not delete team");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {can(PERMS.TEAM_MANAGE) && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New team</Button>}
      </div>

      {isLoading && <ListSkeleton rows={3} />}
      {error && <ErrorState onRetry={() => mutate()} />}
      {data && data.length === 0 && <EmptyState title="No teams yet" message="Create doubles teams for this tournament." />}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.map((team) => (
            <Card key={team.id} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold">{team.name}</h3>
                <div className="flex items-center gap-2">
                  <Badge color="slate">{team.teamType}</Badge>
                  {can(PERMS.TEAM_MANAGE) && (
                    <button onClick={() => setDeleteId(team.id)} className="text-muted hover:text-[var(--danger)]" aria-label="Delete team">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted">{team.teamPlayers.map((tp) => tp.player.displayName).join(" & ")}</p>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <CreateTeamModal
          tournamentId={tournamentId}
          onClose={() => setCreating(false)}
          onCreated={() => { mutate(); toast.success("Team created"); }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={remove}
        title="Delete team?"
        message="This cannot be undone. Teams already used in matches cannot be deleted."
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}

function CreateTeamModal({
  tournamentId,
  onClose,
  onCreated,
}: {
  tournamentId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [teamType, setTeamType] = useState("doubles");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [saving, setSaving] = useState(false);

  const { data } = useSWR<TournamentPlayerDTO[]>(`/api/tournaments/${tournamentId}/players`, swrFetcher);
  const players = data ?? [];
  const sameError = p1 && p2 && p1 === p2 ? "Pick two different players" : undefined;

  async function save() {
    if (!name.trim() || !p1 || !p2 || sameError) return;
    setSaving(true);
    try {
      await api.post("/api/teams", { name: name.trim(), teamType, tournamentId, playerIds: [p1, p2] });
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not create team");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New team"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!name.trim() || !p1 || !p2 || Boolean(sameError)}>Create team</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {players.length < 2 && (
          <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">Register at least two players in this tournament first (Players tab).</p>
        )}
        <Field label="Team name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="The Smashers" /></Field>
        <Field label="Type"><Select value={teamType} onChange={(e) => setTeamType(e.target.value)}><option value="doubles">Doubles</option><option value="mixed">Mixed doubles</option></Select></Field>
        <Field label="Player 1" required>
          <Select value={p1} onChange={(e) => setP1(e.target.value)}>
            <option value="">Select…</option>
            {players.map((tp) => <option key={tp.player.id} value={tp.player.id}>{tp.player.displayName}</option>)}
          </Select>
        </Field>
        <Field label="Player 2" required error={sameError}>
          <Select value={p2} onChange={(e) => setP2(e.target.value)}>
            <option value="">Select…</option>
            {players.map((tp) => <option key={tp.player.id} value={tp.player.id}>{tp.player.displayName}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

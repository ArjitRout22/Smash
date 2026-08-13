"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Plus, Trash2, Shuffle, Swords } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { Card, Button, Badge, Input, Select, Field } from "@/components/ui/primitives";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";
import { GenerateFixturesModal } from "./FixtureModals";
import type { TeamDTO, TournamentPlayerDTO } from "./types";

export function TeamsTab({ tournamentId, format }: { tournamentId: string; format: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const canManage = can(PERMS.TEAM_MANAGE);
  const [creating, setCreating] = useState(false);
  const [randomOpen, setRandomOpen] = useState(false);
  const [genMatches, setGenMatches] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<TeamDTO[]>(
    `/api/teams?tournamentId=${tournamentId}`,
    swrFetcher
  );
  const { data: players, mutate: mutatePlayers } = useSWR<TournamentPlayerDTO[]>(
    `/api/tournaments/${tournamentId}/players`,
    swrFetcher
  );

  const teams = useMemo(() => data ?? [], [data]);

  // Registered players not already on a team → available for random pairing.
  const unassigned = useMemo(() => {
    const registered = (players ?? []).filter((tp) => tp.status === "registered");
    const assigned = new Set(teams.flatMap((t) => t.teamPlayers.map((tp) => tp.player.id)));
    return registered.filter((tp) => !assigned.has(tp.player.id)).map((tp) => tp.player);
  }, [players, teams]);

  async function refresh() {
    await Promise.all([mutate(), mutatePlayers()]);
  }

  async function remove() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.del(`/api/teams/${deleteId}`);
      toast.success("Team deleted — its players are available again");
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not delete team");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        {canManage && (
          <>
            <Button variant="outline" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New team</Button>
            <Button variant="outline" onClick={() => setRandomOpen(true)}><Shuffle className="h-4 w-4" /> Create random teams</Button>
            {teams.length >= 2 && (
              <Button onClick={() => setGenMatches(true)}><Swords className="h-4 w-4" /> Generate matches</Button>
            )}
          </>
        )}
      </div>

      {isLoading && <ListSkeleton rows={3} />}
      {error && <ErrorState onRetry={() => mutate()} />}
      {data && teams.length === 0 && (
        <EmptyState
          title="No teams yet"
          message="Create doubles teams manually, or use “Create random teams” to auto-pair everyone who's joined."
        />
      )}

      {data && teams.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {teams.map((team) => (
            <Card key={team.id} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold">{team.name}</h3>
                <div className="flex items-center gap-2">
                  <Badge color="slate">{team.teamType}</Badge>
                  {canManage && (
                    <button onClick={() => setDeleteId(team.id)} className="text-muted hover:text-[var(--danger)]" aria-label="Delete team">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted">{team.teamPlayers.map((tp) => tp.player.displayName).join(" + ")}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Any registered player not yet on a team — so odd/leftover players are obvious. */}
      {canManage && unassigned.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-2 text-sm font-semibold text-muted">Unassigned players ({unassigned.length})</h4>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <Badge key={p.id} color="amber">{p.displayName}</Badge>
            ))}
          </div>
        </div>
      )}

      {creating && (
        <CreateTeamModal
          tournamentId={tournamentId}
          onClose={() => setCreating(false)}
          onCreated={() => { refresh(); toast.success("Team created"); }}
        />
      )}

      {randomOpen && (
        <RandomTeamsModal
          tournamentId={tournamentId}
          available={unassigned.length}
          onClose={() => setRandomOpen(false)}
          onDone={(created) => { refresh(); toast.success(`${created} team${created === 1 ? "" : "s"} created`); }}
        />
      )}

      {genMatches && (
        <GenerateFixturesModal
          tournamentId={tournamentId}
          format={format}
          onClose={() => setGenMatches(false)}
          onDone={() => toast.success("Matches generated — see the Matches tab")}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={remove}
        title="Delete this team?"
        message="This team will be removed and its players will become available again. (Teams already used in matches can't be deleted.)"
        confirmLabel="Delete team"
        danger
        loading={deleting}
      />
    </div>
  );
}

/** Confirmation + generate for random doubles pairing. */
function RandomTeamsModal({
  tournamentId,
  available,
  onClose,
  onDone,
}: {
  tournamentId: string;
  available: number;
  onClose: () => void;
  onDone: (created: number) => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const teamsToCreate = Math.floor(available / 2);
  const leftover = available % 2;
  const canGenerate = teamsToCreate >= 1;

  async function generate() {
    if (!canGenerate) return;
    setSaving(true);
    try {
      const res = await api.post<{ created: number }>("/api/teams/random", { tournamentId });
      onDone(res.created);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not create teams");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Create random teams?"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={generate} loading={saving} disabled={!canGenerate}>Generate teams</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Players will be randomly paired into doubles teams. You can review or delete teams before generating matches.
        </p>
        <dl className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          <Row label="Available players" value={String(available)} />
          <Row label="Format" value="Doubles" />
          <Row label="Teams that will be created" value={String(teamsToCreate)} />
        </dl>
        {leftover > 0 && canGenerate && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            1 player will be left unassigned (odd number of available players).
          </p>
        )}
        {!canGenerate && (
          <p className="text-xs text-[var(--danger)]">
            Need at least 2 unassigned players to form a doubles team.
          </p>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
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

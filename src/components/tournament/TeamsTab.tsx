"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Plus, Trash2, Shuffle, Swords, Lock, LockOpen, Repeat, History } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { Card, Button, Badge, Input, Select, Field } from "@/components/ui/primitives";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";
import { formatDateTime } from "@/lib/client/format";
import { GenerateFixturesModal } from "./FixtureModals";
import type { TeamDTO, TournamentPlayerDTO, PairingChangeDTO } from "./types";

type PlayerLite = { id: string; displayName: string };

export function TeamsTab({ tournamentId, format }: { tournamentId: string; format: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const canManage = can(PERMS.TEAM_MANAGE);
  const [creating, setCreating] = useState(false);
  const [randomOpen, setRandomOpen] = useState(false);
  const [genMatches, setGenMatches] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pairFor, setPairFor] = useState<TeamDTO | null>(null);
  const [historyFor, setHistoryFor] = useState<TeamDTO | null>(null);
  const [lockBusy, setLockBusy] = useState<string | null>(null);

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

  async function toggleLock(team: TeamDTO) {
    setLockBusy(team.id);
    try {
      await api.post(`/api/teams/${team.id}/lock`, { locked: !team.lockedAt });
      toast.success(team.lockedAt ? "Team unlocked" : "Team locked");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not update lock");
    } finally {
      setLockBusy(null);
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
          {teams.map((team) => {
            const activeMembers = team.teamPlayers.filter((tp) => (tp.status ?? "active") === "active");
            const canPair = canManage && activeMembers.length === 2;
            return (
              <Card key={team.id} className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="flex min-w-0 items-center gap-1.5 font-semibold">
                    <span className="truncate">{team.name}</span>
                    {team.lockedAt && <Lock className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Locked" />}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Badge color="slate">{team.teamType}</Badge>
                    {canManage && (
                      <button onClick={() => setDeleteId(team.id)} className="text-muted hover:text-[var(--danger)]" aria-label="Delete team">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted">{activeMembers.map((tp) => tp.player.displayName).join(" + ")}</p>

                {canManage && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                    <Button size="sm" variant="outline" disabled={!canPair} onClick={() => setPairFor(team)}>
                      <Repeat className="h-3.5 w-3.5" /> Change pair
                    </Button>
                    <Button size="sm" variant="ghost" loading={lockBusy === team.id} onClick={() => toggleLock(team)}>
                      {team.lockedAt ? <><LockOpen className="h-3.5 w-3.5" /> Unlock</> : <><Lock className="h-3.5 w-3.5" /> Lock</>}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setHistoryFor(team)}>
                      <History className="h-3.5 w-3.5" /> History
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
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

      {pairFor && (
        <ChangePairModal
          team={pairFor}
          teams={teams}
          registered={(players ?? []).filter((tp) => tp.status === "registered").map((tp) => tp.player)}
          onClose={() => setPairFor(null)}
          onDone={() => { refresh(); toast.success("Team pair updated"); }}
        />
      )}

      {historyFor && (
        <PairingHistoryModal team={historyFor} onClose={() => setHistoryFor(null)} />
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

/**
 * Swap one player on a team. Team identity stays the same; only upcoming matches
 * pick up the new pairing, completed matches keep their original players.
 */
function ChangePairModal({
  team,
  teams,
  registered,
  onClose,
  onDone,
}: {
  team: TeamDTO;
  teams: TeamDTO[];
  registered: PlayerLite[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const members = team.teamPlayers.filter((tp) => (tp.status ?? "active") === "active").map((tp) => tp.player);
  const [outId, setOutId] = useState(members[0]?.id ?? "");
  const [inId, setInId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmedLock, setConfirmedLock] = useState(false);

  // Who's already on ANOTHER team in this tournament (→ unavailable, shown locked).
  const assignedElsewhere = new Map<string, string>();
  for (const t of teams) {
    if (t.id === team.id) continue;
    for (const tp of t.teamPlayers) if ((tp.status ?? "active") === "active") assignedElsewhere.set(tp.player.id, t.name);
  }
  const memberIds = new Set(members.map((m) => m.id));
  const candidates = registered.filter((p) => !memberIds.has(p.id));
  const available = candidates.filter((p) => !assignedElsewhere.has(p.id));
  const assigned = candidates.filter((p) => assignedElsewhere.has(p.id));

  const keptMember = members.find((m) => m.id !== outId);
  const needsLockConfirm = Boolean(team.lockedAt) && !confirmedLock;

  async function submit() {
    if (!outId || !inId) return;
    if (needsLockConfirm) { setConfirmedLock(true); return; } // extra confirm for a locked team
    setSaving(true);
    try {
      await api.post(`/api/teams/${team.id}/pair`, {
        outPlayerId: outId,
        inPlayerId: inId,
        reason: reason.trim() || undefined,
        force: Boolean(team.lockedAt),
      });
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not change the pair");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Change team pair"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={!inId} variant={needsLockConfirm ? "danger" : "primary"}>
            {needsLockConfirm ? "Confirm — team is locked" : "Confirm change"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span className="text-muted">Current:</span>{" "}
          <span className="font-medium text-foreground">{members.map((m) => m.displayName).join(" + ")}</span>
        </div>

        <Field label="Replace">
          <Select value={outId} onChange={(e) => { setOutId(e.target.value); }}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </Select>
        </Field>

        <div>
          <p className="mb-1 text-sm font-medium">Select new player</p>
          {keptMember && <p className="mb-2 text-xs text-muted">Keeping {keptMember.displayName}.</p>}
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-1">
            {available.length === 0 && assigned.length === 0 && (
              <p className="py-4 text-center text-sm text-muted">No other registered players available.</p>
            )}
            {available.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <input type="radio" name="newPlayer" checked={inId === p.id} onChange={() => setInId(p.id)} className="h-4 w-4 accent-[var(--primary)]" />
                <span className="text-sm font-medium">{p.displayName}</span>
              </label>
            ))}
            {assigned.length > 0 && (
              <>
                <p className="px-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Already assigned</p>
                {assigned.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 opacity-60">
                    <Lock className="h-3.5 w-3.5 text-muted" />
                    <span className="text-sm">{p.displayName}</span>
                    <span className="ml-auto text-xs text-muted">{assignedElsewhere.get(p.id)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <Field label="Reason (optional)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Player B unavailable" />
        </Field>

        <p className="text-xs text-muted">
          ⚠️ Upcoming fixtures will use the new pairing. Completed matches keep their original players and results.
        </p>
        {team.lockedAt && (
          <p className="text-xs text-amber-600 dark:text-amber-400">This team is locked — confirm to change its pairing.</p>
        )}
      </div>
    </Modal>
  );
}

/** Read-only audit trail of a team's pairing changes. */
function PairingHistoryModal({ team, onClose }: { team: TeamDTO; onClose: () => void }) {
  const { data, isLoading } = useSWR<PairingChangeDTO[]>(`/api/teams/${team.id}/pairing-history`, swrFetcher);
  const changes = data ?? [];
  return (
    <Modal open onClose={onClose} title={`${team.name} — pairing history`} footer={<Button onClick={onClose}>Close</Button>}>
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : changes.length === 0 ? (
        <p className="text-sm text-muted">No pairing changes yet — this team still has its original players.</p>
      ) : (
        <ol className="space-y-3">
          {changes.map((c) => (
            <li key={c.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">
                  {c.playersBefore.map((p) => p.name).join(" + ")} → {c.playersAfter.map((p) => p.name).join(" + ")}
                </span>
                <span className="text-xs text-muted">{formatDateTime(c.createdAt)}</span>
              </div>
              {c.reason && <p className="mt-1 text-xs text-muted">Reason: {c.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </Modal>
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

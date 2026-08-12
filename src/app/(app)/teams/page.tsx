"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, Trash2, UsersRound, Search } from "lucide-react";
import { api, ApiClientError, swrFetcher, swrFetcherWithMeta } from "@/lib/client/api";
import { PageHeader, EmptyState, ErrorState, CardGridSkeleton } from "@/components/ui/states";
import { Button, Card, Badge, Input, Select, Field } from "@/components/ui/primitives";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";

type Team = {
  id: string;
  name: string;
  teamType: string;
  tournament: { id: string; name: string } | null;
  teamPlayers: { player: { id: string; displayName: string }; status: string }[];
};

type PlayerOption = { id: string; displayName: string; fullName: string };

export default function TeamsPage() {
  const { can } = useAuth();
  const { success, error: errorToast } = useToast();
  const canManage = can(PERMS.TEAM_MANAGE);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<Team[]>("/api/teams", swrFetcher);
  const teams = data ?? [];

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.del(`/api/teams/${deleteTarget.id}`);
      success("Team deleted");
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      errorToast(err instanceof ApiClientError ? err.message : "Failed to delete team");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Teams"
        subtitle="Doubles and mixed pairings."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New team
            </Button>
          ) : undefined
        }
      />

      {isLoading && <CardGridSkeleton />}
      {error && <ErrorState onRetry={() => mutate()} />}

      {!isLoading && !error && teams.length === 0 && (
        <EmptyState
          title="No teams yet"
          message="Create a doubles or mixed pairing to get started."
          icon={UsersRound}
          action={
            canManage ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> New team
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && !error && teams.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-foreground">{t.name}</h3>
                  <div className="mt-1">
                    <Badge color="blue">{t.teamType}</Badge>
                  </div>
                </div>
                {canManage && (
                  <Button variant="ghost" size="sm" aria-label="Delete team" onClick={() => setDeleteTarget(t)}>
                    <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                  </Button>
                )}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                {t.teamPlayers.map((tp) => (
                  <p key={tp.player.id} className="flex items-center gap-2 text-foreground">
                    {tp.player.displayName}
                    {tp.status === "invited" && <Badge color="amber">Pending</Badge>}
                  </p>
                ))}
              </div>
              {t.tournament && (
                <p className="mt-3 text-xs text-muted">Tournament: {t.tournament.name}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {canManage && (
        <CreateTeamModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            success("Team created");
            setCreateOpen(false);
            mutate();
          }}
          onError={(m) => errorToast(m)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete team"
        message={`Delete "${deleteTarget?.name ?? ""}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}

// Searchable player picker over the WHOLE directory (so you can add players
// from other workspaces — they'll be invited).
function TeamPlayerPicker({
  label,
  selected,
  onSelect,
  excludeIds,
  error,
}: {
  label: string;
  selected: PlayerOption | null;
  onSelect: (p: PlayerOption | null) => void;
  excludeIds: string[];
  error?: string;
}) {
  const [search, setSearch] = useState("");
  const { data } = useSWR<{ data: PlayerOption[] }>(
    `/api/players?scope=all&pageSize=15${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`,
    swrFetcherWithMeta
  );
  const results = (data?.data ?? []).filter((p) => !excludeIds.includes(p.id));

  return (
    <Field label={label} required error={error}>
      {selected ? (
        <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
          <span><span className="font-medium">{selected.displayName}</span><span className="text-muted"> · {selected.fullName}</span></span>
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => onSelect(null)}>Change</button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search all players…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[var(--border)]">
            {results.length === 0 && <p className="px-3 py-3 text-sm text-muted">No players found.</p>}
            {results.map((p) => (
              <button key={p.id} type="button" onClick={() => onSelect(p)} className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-surface-2">
                <span className="font-medium">{p.displayName}</span>
                <span className="text-muted"> · {p.fullName}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Field>
  );
}

function CreateTeamModal({
  open,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [teamType, setTeamType] = useState("doubles");
  const [p1, setP1] = useState<PlayerOption | null>(null);
  const [p2, setP2] = useState<PlayerOption | null>(null);
  const [playerError, setPlayerError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName("");
    setTeamType("doubles");
    setP1(null);
    setP2(null);
    setPlayerError(undefined);
  }

  async function submit() {
    if (!p1 || !p2) {
      setPlayerError("Select two players.");
      return;
    }
    setPlayerError(undefined);
    setSubmitting(true);
    try {
      await api.post("/api/teams", { name: name.trim(), teamType, playerIds: [p1.id, p2.id] });
      reset();
      onCreated();
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "Failed to create team");
    } finally {
      setSubmitting(false);
    }
  }

  const picked = [p1, p2].filter(Boolean).map((p) => p!.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New team"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>Create team</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Team name" htmlFor="teamName" required>
          <Input id="teamName" value={name} onChange={(e) => setName(e.target.value)} placeholder="The Smashers" />
        </Field>
        <Field label="Team type" htmlFor="teamType" required>
          <Select id="teamType" value={teamType} onChange={(e) => setTeamType(e.target.value)}>
            <option value="doubles">Doubles</option>
            <option value="mixed">Mixed</option>
          </Select>
        </Field>
        <TeamPlayerPicker label="Player 1" selected={p1} onSelect={setP1} excludeIds={picked} error={playerError} />
        <TeamPlayerPicker label="Player 2" selected={p2} onSelect={setP2} excludeIds={picked} />
        <p className="text-xs text-muted">
          Players from another workspace will get an invite and show as “Pending” until they accept.
        </p>
      </div>
    </Modal>
  );
}

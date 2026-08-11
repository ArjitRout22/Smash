"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, Trash2, UsersRound } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
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
  teamPlayers: { player: { id: string; displayName: string } }[];
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
                  <p key={tp.player.id} className="text-foreground">
                    {tp.player.displayName}
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
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [playerError, setPlayerError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const { data } = useSWR<{ data: PlayerOption[] }>(
    open ? "/api/players?pageSize=100" : null,
    swrFetcher
  );
  const players = data?.data ?? [];

  function reset() {
    setName("");
    setTeamType("doubles");
    setPlayer1("");
    setPlayer2("");
    setPlayerError(undefined);
  }

  async function submit() {
    if (!player1 || !player2) {
      setPlayerError("Select two players.");
      return;
    }
    if (player1 === player2) {
      setPlayerError("Players must be distinct.");
      return;
    }
    setPlayerError(undefined);
    setSubmitting(true);
    try {
      await api.post("/api/teams", {
        name: name.trim(),
        teamType,
        playerIds: [player1, player2],
      });
      reset();
      onCreated();
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "Failed to create team");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New team"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            Create team
          </Button>
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
        <Field label="Player 1" htmlFor="player1" required error={playerError}>
          <Select id="player1" value={player1} onChange={(e) => setPlayer1(e.target.value)}>
            <option value="">Select a player…</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName} ({p.fullName})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Player 2" htmlFor="player2" required>
          <Select id="player2" value={player2} onChange={(e) => setPlayer2(e.target.value)}>
            <option value="">Select a player…</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName} ({p.fullName})
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

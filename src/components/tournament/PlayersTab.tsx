"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Send } from "lucide-react";
import { api, ApiClientError, swrFetcher, swrFetcherWithMeta } from "@/lib/client/api";
import { Card, Button, Badge, Input } from "@/components/ui/primitives";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";
import type { TournamentPlayerDTO } from "./types";

type PlayerLite = { id: string; displayName: string; fullName: string };

export function PlayersTab({ tournamentId }: { tournamentId: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const canManage = can(PERMS.TOURNAMENT_EDIT);

  const { data, error, isLoading, mutate } = useSWR<TournamentPlayerDTO[]>(
    `/api/tournaments/${tournamentId}/players`,
    swrFetcher
  );
  const { data: requests, mutate: mutateReq } = useSWR<TournamentPlayerDTO[]>(
    canManage ? `/api/tournaments/${tournamentId}/requests` : null,
    swrFetcher
  );

  // The roster shows confirmed (registered) players and those still pending an
  // invite response. Join requests get their own card; declined/removed are hidden.
  const roster = (data ?? []).filter((tp) => tp.status === "registered" || tp.status === "invited");

  async function respond(playerId: string, action: "accept" | "decline") {
    setBusy(playerId);
    try {
      await api.post(`/api/tournaments/${tournamentId}/requests`, { playerId, action });
      toast.success(action === "accept" ? "Player added" : "Request declined");
      mutateReq(); mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(playerId: string, wasInvite = false) {
    setBusy(playerId);
    try {
      await api.del(`/api/tournaments/${tournamentId}/players/${playerId}`);
      toast.success(wasInvite ? "Invitation cancelled" : "Player removed");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not remove");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        {canManage && (
          <Button onClick={() => setInviting(true)}><Send className="h-4 w-4" /> Invite players</Button>
        )}
      </div>

      {canManage && requests && requests.length > 0 && (
        <Card className="mb-4 border-amber-500/40">
          <div className="border-b border-[var(--border)] px-5 py-3 text-sm font-semibold">
            Join requests ({requests.length})
          </div>
          <div className="divide-y divide-[var(--border)]">
            {requests.map((tp) => (
              <div key={tp.id} className="flex items-center justify-between gap-2 px-5 py-3">
                <Link href={`/players/${tp.player.id}`} className="min-w-0 hover:underline">
                  <span className="font-medium">{tp.player.displayName}</span>
                  <span className="ml-2 text-sm text-muted">{tp.player.fullName}</span>
                </Link>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => respond(tp.player.id, "accept")} loading={busy === tp.player.id}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => respond(tp.player.id, "decline")} disabled={busy === tp.player.id}>Decline</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isLoading && <ListSkeleton rows={4} />}
      {error && <ErrorState onRetry={() => mutate()} />}
      {data && roster.length === 0 && (
        <EmptyState title="No players yet" message="Invite players to this tournament, or accept join requests on public tournaments." />
      )}

      {roster.length > 0 && (
        <Card>
          <div className="divide-y divide-[var(--border)]">
            {roster.map((tp) => (
              <div key={tp.id} className="flex items-center justify-between px-5 py-3">
                <Link href={`/players/${tp.player.id}`} className="hover:underline">
                  <span className="font-medium">{tp.player.displayName}</span>
                  <span className="ml-2 text-sm text-muted">{tp.player.fullName}</span>
                </Link>
                <div className="flex items-center gap-3 text-sm text-muted">
                  {tp.player.ranking && <span>{tp.player.ranking.wins}W · {tp.player.ranking.losses}L</span>}
                  <StatusBadge status={tp.status} />
                  {canManage && (
                    <button onClick={() => remove(tp.player.id, tp.status === "invited")} disabled={busy === tp.player.id} className="text-xs text-muted hover:text-[var(--danger)] disabled:opacity-50">
                      {tp.status === "invited" ? "Cancel invite" : "Remove"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {inviting && (
        <InvitePlayersModal
          tournamentId={tournamentId}
          tournamentPlayers={data ?? []}
          onClose={() => setInviting(false)}
          onInvited={() => mutate()}
        />
      )}
    </div>
  );
}

// Tournament-membership status → badge (shared by the roster + the invite modal).
const STATUS_BADGE: Record<string, { label: string; color: "green" | "amber" | "blue" | "red" | "slate" | "neutral" }> = {
  registered: { label: "Joined", color: "green" },
  invited: { label: "Invited", color: "amber" },
  requested: { label: "Requested", color: "blue" },
  declined: { label: "Declined", color: "red" },
  removed: { label: "Removed", color: "neutral" },
  withdrawn: { label: "Withdrawn", color: "neutral" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? { label: status, color: "slate" as const };
  return <Badge color={s.color}>{s.label}</Badge>;
}

// A player is (re-)invitable when they aren't currently in the tournament: no
// row at all, or a terminal negative outcome that can be reversed.
function isInvitable(status: string | undefined): boolean {
  return status === undefined || status === "declined" || status === "removed" || status === "withdrawn";
}

// Single entry point for putting players in a tournament. Shows the FULL result
// set annotated with each player's current status (Available / Invited / Joined /
// Requested / Declined) instead of hiding anyone. The action label adapts:
// account-holders are "Invite"d (they accept); managed players are added directly
// — the server decides, and the toast reflects what actually happened.
function InvitePlayersModal({
  tournamentId,
  tournamentPlayers,
  onClose,
  onInvited,
}: {
  tournamentId: string;
  tournamentPlayers: TournamentPlayerDTO[];
  onClose: () => void;
  onInvited: () => void;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useSWR<{ data: PlayerLite[] }>(
    `/api/players?scope=all&pageSize=50&search=${encodeURIComponent(search)}`,
    swrFetcherWithMeta
  );

  const statusById = new Map(tournamentPlayers.map((tp) => [tp.player.id, tp.status]));

  async function invite(playerId: string) {
    setBusy(playerId);
    try {
      const tp = await api.post<{ status: string }>(`/api/tournaments/${tournamentId}/invite`, { playerId });
      toast.success(tp?.status === "registered" ? "Player added" : "Invitation sent");
      onInvited();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not invite");
    } finally {
      setBusy(null);
    }
  }

  // Never hide in-tournament players; float the invitable ones to the top.
  const players = (data?.data ?? []).slice().sort((a, b) => {
    return (isInvitable(statusById.get(a.id)) ? 0 : 1) - (isInvitable(statusById.get(b.id)) ? 0 : 1);
  });

  return (
    <Modal open onClose={onClose} title="Invite players" footer={<Button variant="ghost" onClick={onClose}>Done</Button>}>
      <p className="mb-3 text-sm text-muted">
        Invite any player across Smash. Players with an account get an invitation to accept; players without one are added directly.
      </p>
      <Input placeholder="Search all players…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
      {isLoading && <ListSkeleton rows={4} />}
      {!isLoading && players.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">No players found.</p>
      )}
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {players.map((p) => {
          const status = statusById.get(p.id);
          return (
            <div key={p.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-2">
              <div className="min-w-0">
                <span className="font-medium">{p.displayName}</span>
                <span className="ml-2 text-sm text-muted">{p.fullName}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {status && <StatusBadge status={status} />}
                {isInvitable(status) && (
                  <Button size="sm" variant="outline" onClick={() => invite(p.id)} loading={busy === p.id}>
                    {status ? "Re-invite" : "Invite"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

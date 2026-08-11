"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { UserPlus } from "lucide-react";
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
  const [adding, setAdding] = useState(false);
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

  const registered = (data ?? []).filter((tp) => tp.status === "registered");

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

  async function remove(playerId: string) {
    setBusy(playerId);
    try {
      await api.del(`/api/tournaments/${tournamentId}/players/${playerId}`);
      toast.success("Player removed");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not remove");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {canManage && (
          <Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add players</Button>
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
      {data && registered.length === 0 && (
        <EmptyState title="No players registered" message="Add existing players, or accept join requests on public tournaments." />
      )}

      {registered.length > 0 && (
        <Card>
          <div className="divide-y divide-[var(--border)]">
            {registered.map((tp) => (
              <div key={tp.id} className="flex items-center justify-between px-5 py-3">
                <Link href={`/players/${tp.player.id}`} className="hover:underline">
                  <span className="font-medium">{tp.player.displayName}</span>
                  <span className="ml-2 text-sm text-muted">{tp.player.fullName}</span>
                </Link>
                <div className="flex items-center gap-3 text-sm text-muted">
                  {tp.player.ranking && <span>{tp.player.ranking.wins}W · {tp.player.ranking.losses}L</span>}
                  <Badge color="green">registered</Badge>
                  {canManage && (
                    <button onClick={() => remove(tp.player.id)} disabled={busy === tp.player.id} className="text-xs text-muted hover:text-[var(--danger)] disabled:opacity-50">Remove</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {adding && (
        <AddPlayersModal
          tournamentId={tournamentId}
          existingIds={new Set((data ?? []).map((tp) => tp.player.id))}
          onClose={() => setAdding(false)}
          onAdded={() => { mutate(); toast.success("Players added"); }}
        />
      )}
    </div>
  );
}

function AddPlayersModal({
  tournamentId,
  existingIds,
  onClose,
  onAdded,
}: {
  tournamentId: string;
  existingIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useSWR<{ data: PlayerLite[] }>(
    `/api/players?pageSize=100&search=${encodeURIComponent(search)}`,
    swrFetcherWithMeta
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function save() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      await api.post(`/api/tournaments/${tournamentId}/players`, { playerIds: [...selected] });
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not add players");
    } finally {
      setSaving(false);
    }
  }

  const candidates = (data?.data ?? []).filter((p) => !existingIds.has(p.id));

  return (
    <Modal
      open
      onClose={onClose}
      title="Add players"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={selected.size === 0}>
            Add {selected.size || ""}
          </Button>
        </>
      }
    >
      <Input placeholder="Search players…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
      {isLoading && <ListSkeleton rows={4} />}
      {!isLoading && candidates.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">No more players to add. Create players from the Players page first.</p>
      )}
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {candidates.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2">
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-[var(--primary)]" />
            <span className="font-medium">{p.displayName}</span>
            <span className="text-sm text-muted">{p.fullName}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

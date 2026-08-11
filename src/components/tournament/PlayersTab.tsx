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

  const { data, error, isLoading, mutate } = useSWR<TournamentPlayerDTO[]>(
    `/api/tournaments/${tournamentId}/players`,
    swrFetcher
  );

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {can(PERMS.TOURNAMENT_EDIT) && (
          <Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add players</Button>
        )}
      </div>

      {isLoading && <ListSkeleton rows={4} />}
      {error && <ErrorState onRetry={() => mutate()} />}
      {data && data.length === 0 && (
        <EmptyState title="No players registered" message="Add existing players to this tournament." />
      )}

      {data && data.length > 0 && (
        <Card>
          <div className="divide-y divide-[var(--border)]">
            {data.map((tp) => (
              <div key={tp.id} className="flex items-center justify-between px-5 py-3">
                <Link href={`/players/${tp.player.id}`} className="hover:underline">
                  <span className="font-medium">{tp.player.displayName}</span>
                  <span className="ml-2 text-sm text-muted">{tp.player.fullName}</span>
                </Link>
                <div className="flex items-center gap-3 text-sm text-muted">
                  {tp.player.ranking && <span>{tp.player.ranking.wins}W · {tp.player.ranking.losses}L</span>}
                  <Badge color={tp.status === "registered" ? "green" : "slate"}>{tp.status}</Badge>
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

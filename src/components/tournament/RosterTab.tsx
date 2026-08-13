"use client";

import Link from "next/link";
import useSWR from "swr";
import { Users } from "lucide-react";
import { swrFetcher } from "@/lib/client/api";
import { Card } from "@/components/ui/primitives";
import { EmptyState, ListSkeleton } from "@/components/ui/states";
import type { TournamentPlayerDTO } from "./types";

/**
 * Read-only roster — who has joined a tournament. Visible to any viewer (used on
 * the public tournament page). The API returns only confirmed (registered)
 * players to non-managers, so pending invites/declines aren't shown here.
 */
export function RosterTab({ tournamentId }: { tournamentId: string }) {
  const { data, isLoading } = useSWR<TournamentPlayerDTO[]>(
    `/api/tournaments/${tournamentId}/players`,
    swrFetcher
  );
  const players = (data ?? []).filter((tp) => tp.status === "registered");

  if (isLoading) return <ListSkeleton rows={5} />;
  if (players.length === 0) {
    return <EmptyState title="No players yet" message="Nobody has joined this tournament yet." icon={Users} />;
  }

  return (
    <Card>
      <div className="border-b border-[var(--border)] px-5 py-3 text-sm font-semibold">
        {players.length} player{players.length === 1 ? "" : "s"} joined
      </div>
      <div className="divide-y divide-[var(--border)]">
        {players.map((tp) => (
          <Link key={tp.id} href={`/players/${tp.player.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-surface-2">
            <span>
              <span className="font-medium">{tp.player.displayName}</span>
              <span className="ml-2 text-sm text-muted">{tp.player.fullName}</span>
            </span>
            {tp.player.ranking && (
              <span className="text-sm text-muted">{tp.player.ranking.wins}W · {tp.player.ranking.losses}L</span>
            )}
          </Link>
        ))}
      </div>
    </Card>
  );
}

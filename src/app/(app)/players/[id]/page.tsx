"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { swrFetcher, swrFetcherWithMeta } from "@/lib/client/api";
import { PageHeader, ErrorState, ListSkeleton, CardGridSkeleton } from "@/components/ui/states";
import { Card, CardHeader, Badge, statusColor } from "@/components/ui/primitives";
import { formatDate, pct, titleCase } from "@/lib/client/format";

type Player = {
  id: string;
  fullName: string;
  displayName: string;
  city?: string;
  skillLevel?: string | null;
};

type Statistics = {
  playerId: string;
  displayName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winPercentage: number;
  totalPoints: number;
  tournamentsPlayed: number;
  titles: number;
  currentRank: number | null;
  bestRank: number | null;
};

type MatchRow = {
  matchId: string;
  date: string | null;
  tournament: { id: string; name: string };
  stage: { name: string; type: string } | null;
  opponent: string;
  score: string[];
  result: string;
  bestOf: number;
};

type TournamentRow = {
  tournament: { id: string; name: string; status: string };
  stageReached: string | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  points: number;
  position: number | null;
};

export default function PlayerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: player, error: playerError, isLoading: playerLoading, mutate: mutatePlayer } = useSWR<Player>(
    id ? `/api/players/${id}` : null,
    swrFetcher
  );
  const { data: stats, error: statsError, isLoading: statsLoading, mutate: mutateStats } = useSWR<Statistics>(
    id ? `/api/players/${id}/statistics` : null,
    swrFetcher
  );
  const { data: matches, isLoading: matchesLoading } = useSWR<{ data: MatchRow[] }>(
    id ? `/api/players/${id}/matches?page=1&pageSize=20` : null,
    swrFetcherWithMeta
  );
  const { data: tournaments, isLoading: tournamentsLoading } = useSWR<TournamentRow[]>(
    id ? `/api/players/${id}/tournaments` : null,
    swrFetcher
  );

  if (playerError || statsError) {
    return (
      <div>
        <PageHeader title="Player" />
        <ErrorState
          onRetry={() => {
            mutatePlayer();
            mutateStats();
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={playerLoading ? "Loading…" : player?.displayName ?? "Player"}
        subtitle={
          player ? [player.fullName, player.city].filter(Boolean).join(" · ") || undefined : undefined
        }
        actions={
          player?.skillLevel ? (
            <Badge color={player.skillLevel === "pro" ? "green" : player.skillLevel === "intermediate" ? "blue" : "slate"}>
              {titleCase(player.skillLevel)}
            </Badge>
          ) : undefined
        }
      />

      {/* Stat cards */}
      {statsLoading && <CardGridSkeleton count={8} />}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Matches" value={stats.matchesPlayed} />
          <Stat label="Wins" value={stats.wins} />
          <Stat label="Losses" value={stats.losses} />
          <Stat label="Win %" value={pct(stats.winPercentage)} />
          <Stat label="Points" value={stats.totalPoints} />
          <Stat label="Tournaments" value={stats.tournamentsPlayed} />
          <Stat label="Current rank" value={stats.currentRank ?? "—"} />
          <Stat label="Best rank" value={stats.bestRank ?? "—"} />
          <Stat label="Titles" value={stats.titles} />
        </div>
      )}

      {/* Tournament history */}
      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Tournament history" />
        {tournamentsLoading && <div className="p-4"><ListSkeleton rows={3} /></div>}
        {!tournamentsLoading && (tournaments?.length ?? 0) === 0 && (
          <p className="px-5 py-6 text-sm text-muted">No tournaments played yet.</p>
        )}
        {!tournamentsLoading && (tournaments?.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-4 py-3 font-medium">Tournament</th>
                  <th className="px-4 py-3 font-medium">Stage reached</th>
                  <th className="px-4 py-3 font-medium">Played</th>
                  <th className="px-4 py-3 font-medium">W</th>
                  <th className="px-4 py-3 font-medium">L</th>
                  <th className="px-4 py-3 font-medium">Points</th>
                  <th className="px-4 py-3 font-medium">Position</th>
                </tr>
              </thead>
              <tbody>
                {tournaments?.map((t) => (
                  <tr key={t.tournament.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">
                      <Link href={`/tournaments/${t.tournament.id}`} className="font-medium text-primary hover:underline">
                        {t.tournament.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{t.stageReached ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{t.matchesPlayed}</td>
                    <td className="px-4 py-3 text-muted">{t.wins}</td>
                    <td className="px-4 py-3 text-muted">{t.losses}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{t.points}</td>
                    <td className="px-4 py-3 text-muted">{t.position ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Match history */}
      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Match history" />
        {matchesLoading && <div className="p-4"><ListSkeleton rows={4} /></div>}
        {!matchesLoading && (matches?.data.length ?? 0) === 0 && (
          <p className="px-5 py-6 text-sm text-muted">No matches played yet.</p>
        )}
        {!matchesLoading && (matches?.data.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Tournament</th>
                  <th className="px-4 py-3 font-medium">Opponent</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {matches?.data.map((m) => (
                  <tr key={m.matchId} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 text-muted">{formatDate(m.date)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/tournaments/${m.tournament.id}`} className="text-primary hover:underline">
                        {m.tournament.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">{m.opponent}</td>
                    <td className="px-4 py-3 text-muted">{m.stage?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{m.score.length ? m.score.join(" / ") : "—"}</td>
                    <td className="px-4 py-3">
                      <Badge color={statusColor(m.result)}>{m.result}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-bold leading-none text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </Card>
  );
}

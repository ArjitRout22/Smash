"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { swrFetcher, swrFetcherWithMeta } from "@/lib/client/api";
import { PageHeader, ErrorState, ListSkeleton, CardGridSkeleton } from "@/components/ui/states";
import { Card, CardHeader, Badge, statusColor, Avatar } from "@/components/ui/primitives";
import { ViewOnMapButton } from "@/components/LocationPicker";
import { ShareButton } from "@/components/ShareButton";
import { PerformanceChart } from "@/components/PerformanceChart";
import { formatDate, pct, titleCase } from "@/lib/client/format";

type Player = {
  id: string;
  fullName: string;
  displayName: string;
  city?: string;
  skillLevel?: string | null;
  photoUrl?: string | null;
  locationName?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
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

type Insights = {
  last5: ("W" | "L")[];
  streak: { type: "W" | "L" | null; count: number };
  headToHead: { playerId: string; name: string; wins: number; losses: number; played: number }[];
  badges: { key: string; label: string; icon: string }[];
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
  const { data: insights } = useSWR<Insights>(id ? `/api/players/${id}/insights` : null, swrFetcher);
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
        title={
          <span className="flex items-center gap-3">
            {player && <Avatar src={player.photoUrl} name={player.displayName} size={40} />}
            {playerLoading ? "Loading…" : player?.displayName ?? "Player"}
          </span>
        }
        subtitle={
          player
            ? [player.fullName, player.locationName ?? player.city].filter(Boolean).join(" · ") || undefined
            : undefined
        }
        actions={
          player ? (
            <div className="flex flex-wrap items-center gap-2">
              {player.skillLevel && (
                <Badge color={player.skillLevel === "pro" ? "green" : player.skillLevel === "intermediate" ? "blue" : "slate"}>
                  {titleCase(player.skillLevel)}
                </Badge>
              )}
              <ViewOnMapButton
                location={player.locationName ?? player.city ?? null}
                lat={player.locationLat ?? null}
                lng={player.locationLng ?? null}
              />
              <ShareButton
                url={typeof window !== "undefined" ? `${window.location.origin}/player/${id}` : `/player/${id}`}
                title={`${player.displayName} · SmashHero`}
                text={`Check out ${player.displayName}'s SmashHero profile.`}
                label="Share profile"
              />
            </div>
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
          <Stat label="Rating" value={stats.totalPoints} />
          <Stat label="Tournaments" value={stats.tournamentsPlayed} />
          <Stat label="Current rank" value={stats.currentRank ?? "—"} />
          <Stat label="Best rank" value={stats.bestRank ?? "—"} />
          <Stat label="Titles" value={stats.titles} />
        </div>
      )}

      {insights && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Recent form</h2>
            {insights.last5.length > 0 ? (
              <div className="flex items-center gap-2">
                {[...insights.last5].reverse().map((r, i) => (
                  <span key={i} className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${r === "W" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>{r}</span>
                ))}
                {insights.streak.type && insights.streak.count >= 2 && (
                  <span className="ml-2 text-sm text-muted">{insights.streak.count}-{insights.streak.type === "W" ? "win" : "loss"} streak{insights.streak.type === "W" ? " 🔥" : ""}</span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">No completed matches yet.</p>
            )}
            {insights.badges.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {insights.badges.map((b) => (
                  <span key={b.key} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-surface-2 px-3 py-1 text-xs font-medium">
                    <span aria-hidden="true">{b.icon}</span> {b.label}
                  </span>
                ))}
              </div>
            )}
          </Card>
          {insights.headToHead.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Head-to-head</h2>
              <div className="space-y-2">
                {insights.headToHead.map((h) => (
                  <div key={h.playerId} className="flex items-center justify-between text-sm">
                    <Link href={`/players/${h.playerId}`} className="font-medium hover:underline">{h.name}</Link>
                    <span className="font-mono text-muted">
                      <span className="text-emerald-600 dark:text-emerald-400">{h.wins}W</span> · <span className="text-red-600 dark:text-red-400">{h.losses}L</span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Performance trend */}
      {(() => {
        const played = (matches?.data ?? [])
          .filter((m) => m.result === "win" || m.result === "loss")
          .map((m) => ({ won: m.result === "win" }));
        if (played.length < 2) return null;
        return (
          <Card className="mt-6 p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Performance</h2>
            <PerformanceChart results={played} />
          </Card>
        );
      })()}

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

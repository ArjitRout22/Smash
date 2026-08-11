"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Trophy, Users, UsersRound, Activity, Plus, Mail, Zap } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { PageHeader, CardGridSkeleton, ErrorState, EmptyState } from "@/components/ui/states";
import { Card, CardHeader, Badge, statusColor, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";
import { formatDateTime, titleCase } from "@/lib/client/format";

type MatchDTO = {
  id: string;
  status: string;
  scheduledAt: string | null;
  tournament: { name: string };
  bestOf: number;
  sides: { label: string; gamesWon: number; isWinner: boolean }[];
};

type Dashboard = {
  stats: {
    totalTournaments: number;
    activeTournaments: number;
    completedTournaments: number;
    totalPlayers: number;
    totalTeams: number;
  };
  recentMatches: MatchDTO[];
  upcomingMatches: MatchDTO[];
  topPlayers: { playerId: string; name: string; points: number; wins: number; losses: number; rank: number | null }[];
};

export default function DashboardPage() {
  const { user, can } = useAuth();
  const { data, error, isLoading, mutate } = useSWR<Dashboard>("/api/dashboard", swrFetcher);

  return (
    <div>
      <PageHeader
        title={`Hi${user?.name ? `, ${user.name}` : ""} 👋`}
        subtitle="Here's what's happening across your club."
        actions={
          <>
            {can(PERMS.TOURNAMENT_CREATE) && (
              <Link href="/tournaments/create">
                <Button size="sm"><Plus className="h-4 w-4" /> Create tournament</Button>
              </Link>
            )}
            {can(PERMS.PLAYER_MANAGE) && (
              <Link href="/players?new=1">
                <Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Add player</Button>
              </Link>
            )}
          </>
        }
      />

      <InvitationsCard />
      <ChallengesCard />

      {isLoading && <CardGridSkeleton />}
      {error && <ErrorState onRetry={() => mutate()} />}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat icon={Trophy} label="Tournaments" value={data.stats.totalTournaments} hint={`${data.stats.activeTournaments} active · ${data.stats.completedTournaments} done`} />
            <Stat icon={Activity} label="Active now" value={data.stats.activeTournaments} />
            <Stat icon={Users} label="Players" value={data.stats.totalPlayers} />
            <Stat icon={UsersRound} label="Teams" value={data.stats.totalTeams} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Upcoming matches" />
              <div className="divide-y divide-[var(--border)]">
                {data.upcomingMatches.length === 0 && (
                  <div className="p-5"><EmptyState title="No upcoming matches" message="Scheduled matches will appear here." /></div>
                )}
                {data.upcomingMatches.map((m) => <MatchRow key={m.id} m={m} />)}
              </div>
            </Card>

            <Card>
              <CardHeader title="Recent results" />
              <div className="divide-y divide-[var(--border)]">
                {data.recentMatches.length === 0 && (
                  <div className="p-5"><EmptyState title="No results yet" message="Completed matches will show here." /></div>
                )}
                {data.recentMatches.map((m) => <MatchRow key={m.id} m={m} />)}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Top players" action={<Link href="/leaderboard" className="text-sm text-primary hover:underline">View leaderboard</Link>} />
            <div className="divide-y divide-[var(--border)]">
              {data.topPlayers.length === 0 && (
                <div className="p-5"><EmptyState title="No ranked players yet" message="Rankings appear once matches are played." /></div>
              )}
              {data.topPlayers.map((p, i) => (
                <Link key={p.playerId} href={`/players/${p.playerId}`} className="flex items-center justify-between px-5 py-3 hover:bg-surface-2">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center font-semibold text-muted">{p.rank ?? i + 1}</span>
                    <span className="font-medium">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted">
                    <span>{p.wins}W · {p.losses}L</span>
                    <span className="font-semibold text-foreground">{p.points} pts</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

type Invitation = {
  tournament: { id: string; name: string; format: string; status: string; organizer: { name: string | null } | null; organization: { name: string } | null };
};

function InvitationsCard() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, mutate } = useSWR<Invitation[]>("/api/me/invitations", swrFetcher);

  async function respond(tournamentId: string, action: "accept" | "decline") {
    setBusy(tournamentId);
    try {
      await api.post("/api/me/invitations", { tournamentId, action });
      toast.success(action === "accept" ? "Joined the tournament" : "Invitation declined");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (!data || data.length === 0) return null;

  return (
    <Card className="mb-6 border-[var(--primary)]/40">
      <CardHeader title={<span className="flex items-center gap-2"><Mail className="h-4 w-4" /> Tournament invitations ({data.length})</span>} />
      <div className="divide-y divide-[var(--border)]">
        {data.map((inv) => (
          <div key={inv.tournament.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link href={`/discover/${inv.tournament.id}`} className="font-medium hover:underline">{inv.tournament.name}</Link>
              <p className="text-xs text-muted">{titleCase(inv.tournament.format)} · hosted by {inv.tournament.organization?.name ?? inv.tournament.organizer?.name ?? "—"}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={() => respond(inv.tournament.id, "accept")} loading={busy === inv.tournament.id}>Accept</Button>
              <Button size="sm" variant="ghost" onClick={() => respond(inv.tournament.id, "decline")} disabled={busy === inv.tournament.id}>Decline</Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

type ChallengeLite = {
  id: string;
  status: string;
  version: number;
  challenger: { name: string };
  opponent: { name: string };
  isChallenger: boolean;
  canRespond: boolean;
  canConfirm: boolean;
};

// Surfaces only the casual matches that need THIS user to act right now
// (a challenge to accept, or a reported result to confirm).
function ChallengesCard() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, mutate } = useSWR<ChallengeLite[]>("/api/casual-matches", swrFetcher);

  const actionable = (data ?? []).filter((m) => m.canRespond || m.canConfirm);

  async function act(m: ChallengeLite, action: string, msg: string) {
    setBusy(m.id);
    try {
      await api.post(`/api/casual-matches/${m.id}`, { action, expectedVersion: m.version });
      toast.success(msg);
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (actionable.length === 0) return null;

  return (
    <Card className="mb-6 border-[var(--primary)]/40">
      <CardHeader
        title={<span className="flex items-center gap-2"><Zap className="h-4 w-4" /> Challenges ({actionable.length})</span>}
        action={<Link href="/challenges" className="text-sm text-primary hover:underline">View all</Link>}
      />
      <div className="divide-y divide-[var(--border)]">
        {actionable.map((m) => {
          const other = m.isChallenger ? m.opponent.name : m.challenger.name;
          return (
            <div key={m.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">{m.challenger.name} vs {m.opponent.name}</p>
                <p className="text-xs text-muted">
                  {m.canRespond ? `${other} challenged you to a match` : `${other} reported a result — confirm it`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {m.canRespond && (
                  <>
                    <Button size="sm" loading={busy === m.id} onClick={() => act(m, "accept", "Challenge accepted")}>Accept</Button>
                    <Button size="sm" variant="ghost" disabled={busy === m.id} onClick={() => act(m, "decline", "Challenge declined")}>Decline</Button>
                  </>
                )}
                {m.canConfirm && (
                  <>
                    <Button size="sm" loading={busy === m.id} onClick={() => act(m, "confirm", "Result confirmed")}>Confirm</Button>
                    <Button size="sm" variant="ghost" disabled={busy === m.id} onClick={() => act(m, "reject", "Result rejected")}>Reject</Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-primary"><Icon className="h-5 w-5" /></span>
        <div>
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="mt-1 text-xs text-muted">{label}</p>
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

function MatchRow({ m }: { m: MatchDTO }) {
  const [a, b] = m.sides;
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className={a?.isWinner ? "font-semibold" : ""}>{a?.label ?? "TBD"}</span>
          <span className="text-muted">vs</span>
          <span className={b?.isWinner ? "font-semibold" : ""}>{b?.label ?? "TBD"}</span>
        </div>
        <p className="truncate text-xs text-muted">{m.tournament.name} · Best of {m.bestOf} · {m.scheduledAt ? formatDateTime(m.scheduledAt) : "unscheduled"}</p>
      </div>
      <div className="flex items-center gap-3">
        {m.status === "completed" && <span className="text-sm font-semibold">{a?.gamesWon}–{b?.gamesWon}</span>}
        <Badge color={statusColor(m.status)}>{titleCase(m.status)}</Badge>
      </div>
    </div>
  );
}

"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { PageHeader, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Badge, statusColor, Button, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { titleCase } from "@/lib/client/format";
import { OverviewTab } from "@/components/tournament/OverviewTab";
import { RosterTab } from "@/components/tournament/RosterTab";
import { MatchesTab } from "@/components/tournament/MatchesTab";
import { TeamsTab } from "@/components/tournament/TeamsTab";
import { LeaderboardTab } from "@/components/tournament/LeaderboardTab";
import type { TournamentDetail } from "@/components/tournament/types";

type Tab = "Overview" | "Players" | "Teams" | "Matches" | "Leaderboard";

export default function PublicTournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("Overview");
  const [joining, setJoining] = useState(false);
  const [requested, setRequested] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<TournamentDetail>(`/api/tournaments/${id}`, swrFetcher);

  if (isLoading) return <ListSkeleton rows={5} />;
  if (error || !data) return <ErrorState message="This tournament isn't available." onRetry={() => mutate()} />;

  const isOwner = Boolean(data.canManage);
  // The API tells us the viewer's own status directly (works for non-owners).
  const myStatus = data.viewerStatus ?? undefined;

  async function join() {
    setJoining(true);
    try {
      await api.post(`/api/tournaments/${id}/join`);
      setRequested(true);
      toast.success("Join request sent — the organizer will review it.");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not send request");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div>
      <Link href="/discover" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Discover
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {data.name}
            <Badge color={statusColor(data.status)}>{titleCase(data.status)}</Badge>
            <Badge color="green">Public</Badge>
          </span>
        }
        subtitle={`${titleCase(data.format)} · hosted by ${data.organizer?.name ?? "—"}`}
        actions={
          isOwner ? (
            <Link href={`/tournaments/${id}`}><Button variant="outline">Manage</Button></Link>
          ) : requested || myStatus === "requested" ? (
            <Badge color="amber">Request pending</Badge>
          ) : myStatus === "registered" ? (
            <Badge color="green">You&apos;re in</Badge>
          ) : data.status === "upcoming" && data.joinRequestsOpen !== false ? (
            <Button onClick={join} loading={joining} disabled={!user?.playerId}>Request to join</Button>
          ) : (
            // Registration is closed once the tournament has started/finished, or when
            // the organizer has paused new join requests.
            <Badge color="slate">Registration closed</Badge>
          )
        }
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {(["Overview", "Players", "Teams", "Matches", "Leaderboard"] as Tab[])
          .filter((t) => (t === "Teams" ? data.format !== "singles" : true))
          .map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${tab === t ? "border-[var(--primary)] text-foreground" : "border-transparent text-muted hover:text-foreground"}`}>
              {t}
            </button>
          ))}
      </div>

      {tab === "Overview" && <OverviewTab tournament={data} />}
      {tab === "Players" && <RosterTab tournamentId={id} />}
      {tab === "Teams" && <TeamsTab tournamentId={id} format={data.format} canManage={Boolean(data.canManage)} />}
      {tab === "Matches" && <MatchesTab tournamentId={id} format={data.format} canManage={Boolean(data.canManage)} canScore={Boolean(data.canScore)} canCancel={Boolean(data.canCancelMatch)} />}
      {tab === "Leaderboard" && <LeaderboardTab tournamentId={id} pointsConfig={data.pointsConfig} />}

      {!user?.playerId && !isOwner && (
        <Card className="mt-4 p-4 text-sm text-muted">Your account has no player profile, so you can&apos;t join tournaments.</Card>
      )}
    </div>
  );
}

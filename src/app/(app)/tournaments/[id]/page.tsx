"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { ExternalLink } from "lucide-react";
import { swrFetcher } from "@/lib/client/api";
import { PageHeader, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Badge, statusColor } from "@/components/ui/primitives";
import { ShareButton } from "@/components/ShareButton";
import { QrButton } from "@/components/QrButton";
import { titleCase } from "@/lib/client/format";
import { OverviewTab } from "@/components/tournament/OverviewTab";
import { PlayersTab } from "@/components/tournament/PlayersTab";
import { TeamsTab } from "@/components/tournament/TeamsTab";
import { MatchesTab } from "@/components/tournament/MatchesTab";
import { LeaderboardTab } from "@/components/tournament/LeaderboardTab";
import { SettingsTab } from "@/components/tournament/SettingsTab";
import type { TournamentDetail } from "@/components/tournament/types";

const TABS = [
  "Overview",
  "Players",
  "Teams",
  "Matches",
  "Leaderboard",
  "Settings",
] as const;
type Tab = (typeof TABS)[number];

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Overview");
  const { data, error, isLoading, mutate } = useSWR<TournamentDetail>(
    `/api/tournaments/${id}`,
    swrFetcher
  );

  // This is the management view — non-owners (e.g. people who joined) belong on
  // the read-only public page. The server also blocks any management action.
  useEffect(() => {
    if (data && !data.canManage) router.replace(`/discover/${id}`);
  }, [data, id, router]);

  if (isLoading) return <ListSkeleton rows={5} />;
  if (error || !data) return <ErrorState onRetry={() => mutate()} />;
  if (!data.canManage) return <ListSkeleton rows={5} />; // redirecting

  const isTeamFormat = data.format !== "singles";
  const visibleTabs = TABS.filter((t) => (t === "Teams" ? isTeamFormat : true));

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {data.name}
            <Badge color={statusColor(data.status)}>{titleCase(data.status)}</Badge>
          </span>
        }
        subtitle={`${titleCase(data.format)} · ${data._count.tournamentPlayers} players · ${data._count.matches} matches`}
        actions={
          data.visibility === "public" ? (
            <div className="flex flex-wrap gap-2">
              <ShareButton
                url={typeof window !== "undefined" ? `${window.location.origin}/t/${data.slug ?? id}` : `/t/${data.slug ?? id}`}
                title={`${data.name} · Smash`}
                text={`Join "${data.name}" on Smash.`}
                label="Share"
              />
              <QrButton
                url={typeof window !== "undefined" ? `${window.location.origin}/t/${data.slug ?? id}` : `/t/${data.slug ?? id}`}
                title={`${data.name} — scan to join`}
                caption="Players can scan this to open the tournament and join."
              />
              <a
                href={`/t/${data.slug ?? id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-2"
              >
                <ExternalLink className="h-4 w-4" /> Public page
              </a>
            </div>
          ) : (
            <span className="text-xs text-muted">Private — set visibility to Public in Settings for a shareable link.</span>
          )
        }
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t
                ? "border-[var(--primary)] text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab tournament={data} />}
      {tab === "Players" && <PlayersTab tournamentId={id} />}
      {tab === "Teams" && <TeamsTab tournamentId={id} format={data.format} canManage={data.canManage} />}
      {tab === "Matches" && <MatchesTab tournamentId={id} format={data.format} canManage={data.canManage} canScore={Boolean(data.canScore)} canCancel={Boolean(data.canCancelMatch)} />}
      {tab === "Leaderboard" && <LeaderboardTab tournamentId={id} pointsConfig={data.pointsConfig} />}
      {tab === "Settings" && <SettingsTab tournament={data} onChanged={() => mutate()} />}
    </div>
  );
}

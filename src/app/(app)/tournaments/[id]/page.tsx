"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
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
import { StagesTab } from "@/components/tournament/StagesTab";
import { LeaderboardTab } from "@/components/tournament/LeaderboardTab";
import { BracketTab } from "@/components/tournament/BracketTab";
import { SettingsTab } from "@/components/tournament/SettingsTab";
import type { TournamentDetail } from "@/components/tournament/types";

const TABS = [
  "Overview",
  "Players",
  "Teams",
  "Matches",
  "Stages",
  "Leaderboard",
  "Bracket",
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
                url={typeof window !== "undefined" ? `${window.location.origin}/t/${id}` : `/t/${id}`}
                title={`${data.name} · Smash`}
                text={`Join "${data.name}" on Smash.`}
                label="Share"
              />
              <QrButton
                url={typeof window !== "undefined" ? `${window.location.origin}/t/${id}` : `/t/${id}`}
                title={`${data.name} — scan to join`}
                caption="Players can scan this to open the tournament and join."
              />
            </div>
          ) : undefined
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
      {tab === "Teams" && <TeamsTab tournamentId={id} />}
      {tab === "Matches" && <MatchesTab tournamentId={id} format={data.format} />}
      {tab === "Stages" && <StagesTab tournamentId={id} format={data.format} />}
      {tab === "Leaderboard" && <LeaderboardTab tournamentId={id} />}
      {tab === "Bracket" && <BracketTab tournamentId={id} />}
      {tab === "Settings" && <SettingsTab tournament={data} onChanged={() => mutate()} />}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { User } from "lucide-react";
import { swrFetcher } from "@/lib/client/api";
import { PageHeader, EmptyState, CardGridSkeleton } from "@/components/ui/states";
import { Button, Card, CardHeader, Badge, Spinner } from "@/components/ui/primitives";
import { useAuth } from "@/components/AuthProvider";
import { titleCase, pct } from "@/lib/client/format";

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

export default function ProfilePage() {
  const { user, isLoading, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const playerId = user?.playerId ?? null;
  const { data: stats, isLoading: statsLoading } = useSWR<Statistics>(
    playerId ? `/api/players/${playerId}/statistics` : null,
    swrFetcher
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <PageHeader title="Profile" />
        <EmptyState title="Not signed in" message="Please log in to view your profile." icon={User} />
      </div>
    );
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div>
      <PageHeader title="Profile" subtitle="Your account details." />

      <Card className="overflow-hidden">
        <CardHeader
          title="Account"
          action={
            <Button variant="outline" size="sm" loading={loggingOut} onClick={handleLogout}>
              Log out
            </Button>
          }
        />
        <dl className="divide-y divide-[var(--border)]">
          <Row label="Name" value={user.name ?? "—"} />
          <Row label="Email" value={user.email ?? "—"} />
          <Row label="Phone" value={user.phone ?? "—"} />
          <Row label="Role" value={<Badge color="blue">{titleCase(user.role)}</Badge>} />
        </dl>
      </Card>

      {playerId ? (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">My stats</h2>
            <Link href={`/players/${playerId}`} className="text-sm text-primary hover:underline">
              View full profile
            </Link>
          </div>
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
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            title="No player profile linked"
            message="Your account is not linked to a player record, so match statistics are unavailable."
            icon={User}
          />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
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

"use client";

import { useState } from "react";
import useSWR from "swr";
import { Zap, Plus, Search } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Button, Card, Badge, Field, Select, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { ScoreEntryModal, type ScorableMatch } from "@/components/ScoreEntryModal";
import { formatDateTime } from "@/lib/client/format";

type Party = { userId: string; playerId: string; name: string; fullName: string };
type CasualMatch = {
  id: string;
  status: "pending" | "accepted" | "awaiting_confirmation" | "completed" | "declined" | "cancelled";
  bestOf: number;
  scheduledAt: string | null;
  location: string | null;
  challenger: Party;
  opponent: Party;
  games: { scoreA: number; scoreB: number }[];
  winnerSide: "A" | "B" | null;
  winnerPlayerId: string | null;
  reportedByUserId: string | null;
  role: "challenger" | "opponent";
  isChallenger: boolean;
  canRespond: boolean;
  canReport: boolean;
  canConfirm: boolean;
  canCancel: boolean;
  canReopen: boolean;
  version: number;
  completedAt: string | null;
};

const STATUS_LABEL: Record<CasualMatch["status"], { text: string; color: "slate" | "blue" | "amber" | "green" | "red" | "neutral" }> = {
  pending: { text: "Pending", color: "slate" },
  accepted: { text: "Ready to play", color: "blue" },
  awaiting_confirmation: { text: "Awaiting confirmation", color: "amber" },
  completed: { text: "Completed", color: "green" },
  declined: { text: "Declined", color: "red" },
  cancelled: { text: "Cancelled", color: "neutral" },
};

export default function ChallengesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useSWR<CasualMatch[]>("/api/casual-matches", swrFetcher);
  const [creating, setCreating] = useState(false);
  const [scoreFor, setScoreFor] = useState<CasualMatch | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const hasProfile = Boolean(user?.playerId);

  async function act(m: CasualMatch, action: string, successMsg: string) {
    setBusy(m.id + action);
    try {
      await api.post(`/api/casual-matches/${m.id}`, { action, expectedVersion: m.version });
      toast.success(successMsg);
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const matches = data ?? [];
  // Actionable-for-you items float to the top.
  const actionable = matches.filter((m) => m.canRespond || m.canConfirm || (m.status === "accepted"));
  const waiting = matches.filter((m) => !actionable.includes(m) && (m.status === "pending" || m.status === "awaiting_confirmation"));
  const finished = matches.filter((m) => ["completed", "declined", "cancelled"].includes(m.status));

  return (
    <div>
      <PageHeader
        title="Challenges"
        subtitle="Individual matches against another player — outside any tournament. These don't count toward rankings or stats."
        actions={
          hasProfile ? (
            <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New challenge</Button>
          ) : undefined
        }
      />

      {!hasProfile && (
        <EmptyState
          title="No player profile linked"
          message="Your account isn't linked to a player profile, so you can't challenge or be challenged yet."
          icon={Zap}
        />
      )}

      {hasProfile && (
        <>
          {isLoading && <ListSkeleton rows={4} />}
          {error && <ErrorState onRetry={() => mutate()} />}
          {data && matches.length === 0 && (
            <EmptyState
              title="No challenges yet"
              message="Challenge another player to an individual match. They'll need to accept before you can record a result."
              icon={Zap}
              action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New challenge</Button>}
            />
          )}

          {data && matches.length > 0 && (
            <div className="space-y-6">
              <Section title="Needs your attention" items={actionable} empty="Nothing needs your attention right now.">
                {(m) => (
                  <ChallengeCard key={m.id} m={m} busy={busy}
                    onRespond={(a) => act(m, a, a === "accept" ? "Challenge accepted" : "Challenge declined")}
                    onReport={() => setScoreFor(m)}
                    onConfirm={() => act(m, "confirm", "Result confirmed")}
                    onReject={() => act(m, "reject", "Result rejected — play it again")}
                    onCancel={() => act(m, "cancel", "Challenge cancelled")}
                    onReopen={() => act(m, "reopen", "Match reopened")}
                  />
                )}
              </Section>

              {waiting.length > 0 && (
                <Section title="Waiting on the other player" items={waiting} empty="">
                  {(m) => (
                    <ChallengeCard key={m.id} m={m} busy={busy}
                      onRespond={(a) => act(m, a, a === "accept" ? "Challenge accepted" : "Challenge declined")}
                      onReport={() => setScoreFor(m)}
                      onConfirm={() => act(m, "confirm", "Result confirmed")}
                      onReject={() => act(m, "reject", "Result rejected — play it again")}
                      onCancel={() => act(m, "cancel", "Challenge cancelled")}
                      onReopen={() => act(m, "reopen", "Match reopened")}
                    />
                  )}
                </Section>
              )}

              {finished.length > 0 && (
                <Section title="History" items={finished} empty="">
                  {(m) => (
                    <ChallengeCard key={m.id} m={m} busy={busy}
                      onRespond={(a) => act(m, a, a === "accept" ? "Challenge accepted" : "Challenge declined")}
                      onReport={() => setScoreFor(m)}
                      onConfirm={() => act(m, "confirm", "Result confirmed")}
                      onReject={() => act(m, "reject", "Result rejected — play it again")}
                      onCancel={() => act(m, "cancel", "Challenge cancelled")}
                      onReopen={() => act(m, "reopen", "Match reopened")}
                    />
                  )}
                </Section>
              )}
            </div>
          )}
        </>
      )}

      {creating && <NewChallengeModal onClose={() => setCreating(false)} onCreated={() => mutate()} />}

      <ScoreEntryModal
        open={Boolean(scoreFor)}
        match={scoreFor ? toScorable(scoreFor) : null}
        requireComplete
        onClose={() => setScoreFor(null)}
        onSaved={() => mutate()}
        onSubmit={async (games) => {
          await api.post(`/api/casual-matches/${scoreFor!.id}/score`, {
            games,
            expectedVersion: scoreFor!.version,
          });
        }}
      />
    </div>
  );
}

function toScorable(m: CasualMatch): ScorableMatch {
  return {
    id: m.id,
    bestOf: m.bestOf,
    version: m.version,
    sides: [
      { side: "A", label: m.challenger.name },
      { side: "B", label: m.opponent.name },
    ],
    games: m.games,
  };
}

function Section({
  title,
  items,
  empty,
  children,
}: {
  title: string;
  items: CasualMatch[];
  empty: string;
  children: (m: CasualMatch) => React.ReactNode;
}) {
  if (items.length === 0 && !empty) return null;
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-muted">{empty}</p>
      ) : (
        <div className="space-y-2">{items.map((m) => children(m))}</div>
      )}
    </div>
  );
}

function scoreLine(m: CasualMatch): string {
  if (!m.games.length) return "";
  return m.games.map((g) => `${g.scoreA}-${g.scoreB}`).join(", ");
}

function ChallengeCard({
  m,
  busy,
  onRespond,
  onReport,
  onConfirm,
  onReject,
  onCancel,
  onReopen,
}: {
  m: CasualMatch;
  busy: string | null;
  onRespond: (action: "accept" | "decline") => void;
  onReport: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onCancel: () => void;
  onReopen: () => void;
}) {
  const label = STATUS_LABEL[m.status];
  const youWon = m.status === "completed" && m.winnerPlayerId === (m.isChallenger ? m.challenger.playerId : m.opponent.playerId);
  const other = m.isChallenger ? m.opponent : m.challenger;
  const busyAny = busy?.startsWith(m.id) ?? false;

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={m.winnerSide === "A" ? "font-bold" : "font-medium"}>{m.challenger.name}</span>
          <span className="text-xs text-muted">vs</span>
          <span className={m.winnerSide === "B" ? "font-bold" : "font-medium"}>{m.opponent.name}</span>
          <Badge color={label.color}>{label.text}</Badge>
          {m.status === "completed" && (
            <Badge color={youWon ? "green" : "red"}>{youWon ? "You won" : "You lost"}</Badge>
          )}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{m.isChallenger ? `You challenged ${other.name}` : `${other.name} challenged you`}</span>
          <span>· Best of {m.bestOf}</span>
          {m.location && <span>· {m.location}</span>}
          {m.scheduledAt && <span>· {formatDateTime(m.scheduledAt)}</span>}
          {scoreLine(m) && <span className="font-mono">· {scoreLine(m)}</span>}
        </p>
        {m.status === "awaiting_confirmation" && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {m.canConfirm
              ? `${other.name} reported this result — confirm it's correct.`
              : "Reported — waiting for the other player to confirm."}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {m.canRespond && (
          <>
            <Button size="sm" loading={busy === m.id + "accept"} disabled={busyAny} onClick={() => onRespond("accept")}>Accept</Button>
            <Button size="sm" variant="ghost" disabled={busyAny} onClick={() => onRespond("decline")}>Decline</Button>
          </>
        )}
        {m.status === "accepted" && m.canReport && (
          <Button size="sm" variant="outline" disabled={busyAny} onClick={onReport}>Enter result</Button>
        )}
        {m.canConfirm && (
          <>
            <Button size="sm" loading={busy === m.id + "confirm"} disabled={busyAny} onClick={onConfirm}>Confirm</Button>
            <Button size="sm" variant="ghost" disabled={busyAny} onClick={onReject}>Reject</Button>
          </>
        )}
        {m.status === "awaiting_confirmation" && m.canReport && (
          <Button size="sm" variant="outline" disabled={busyAny} onClick={onReport}>Edit result</Button>
        )}
        {m.canReopen && (
          <Button size="sm" variant="ghost" disabled={busyAny} onClick={onReopen}>Reopen</Button>
        )}
        {m.canCancel && m.status !== "pending" && !m.canReport && !m.canConfirm && !m.canRespond && (
          <Button size="sm" variant="ghost" disabled={busyAny} onClick={onCancel}>Cancel</Button>
        )}
        {m.canCancel && m.status === "pending" && m.isChallenger && (
          <Button size="sm" variant="ghost" disabled={busyAny} onClick={onCancel}>Cancel</Button>
        )}
      </div>
    </Card>
  );
}

type Opponent = { id: string; displayName: string; fullName: string; city: string | null };

function NewChallengeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [opponentId, setOpponentId] = useState("");
  const [bestOf, setBestOf] = useState("3");
  const [location, setLocation] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: opponents, isLoading } = useSWR<Opponent[]>(
    `/api/casual-matches/opponents${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`,
    swrFetcher
  );

  async function save() {
    if (!opponentId) return;
    setSaving(true);
    try {
      await api.post("/api/casual-matches", {
        opponentPlayerId: opponentId,
        bestOf: Number(bestOf),
        location: location || undefined,
        scheduledAt: scheduledAt || undefined,
      });
      toast.success("Challenge sent");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not send challenge");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New challenge"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!opponentId}>Send challenge</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Opponent" required>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              placeholder="Search players with an account…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-[var(--border)]">
            {isLoading && <p className="px-3 py-3 text-sm text-muted">Searching…</p>}
            {opponents && opponents.length === 0 && (
              <p className="px-3 py-3 text-sm text-muted">No players found. Only players with an account can be challenged.</p>
            )}
            {opponents?.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOpponentId(o.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2 ${opponentId === o.id ? "bg-surface-2" : ""}`}
              >
                <span>
                  <span className="font-medium">{o.displayName}</span>
                  <span className="text-muted"> · {o.fullName}{o.city ? ` · ${o.city}` : ""}</span>
                </span>
                {opponentId === o.id && <span className="text-xs font-semibold text-primary">Selected</span>}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Format">
            <Select value={bestOf} onChange={(e) => setBestOf(e.target.value)}>
              <option value="1">Best of 1</option>
              <option value="3">Best of 3</option>
            </Select>
          </Field>
          <Field label="Scheduled (optional)">
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Location (optional)">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Court 3, City Sports Hall" />
        </Field>
      </div>
    </Modal>
  );
}

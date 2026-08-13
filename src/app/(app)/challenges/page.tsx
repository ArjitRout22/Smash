"use client";

import { useState } from "react";
import useSWR from "swr";
import { Zap, Plus, Search, MessageSquare } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Button, Card, Badge, Field, Select, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { ScoreEntryModal, type ScorableMatch } from "@/components/ScoreEntryModal";
import { LocationPicker, ViewOnMapButton, type PlaceValue } from "@/components/LocationPicker";
import { MatchComments } from "@/components/MatchComments";
import { formatDateTime } from "@/lib/client/format";

type Party = { userId: string; playerId: string; name: string; fullName: string };
type PartnerLite = { playerId: string; name: string; fullName: string } | null;
type CasualMatch = {
  id: string;
  matchType: "singles" | "doubles";
  status: "pending" | "accepted" | "awaiting_confirmation" | "completed" | "declined" | "cancelled";
  bestOf: number;
  scheduledAt: string | null;
  location: string | null;
  locationLat: number | null;
  locationLng: number | null;
  challenger: Party;
  opponent: Party;
  challengerPartner: PartnerLite;
  opponentPartner: PartnerLite;
  games: { scoreA: number; scoreB: number }[];
  winnerSide: "A" | "B" | null;
  winnerPlayerId: string | null;
  reportedByUserId: string | null;
  role: "challenger" | "opponent";
  isChallenger: boolean;
  canReject: boolean;
  canReport: boolean;
  canConfirm: boolean;
  canCancel: boolean;
  version: number;
  completedAt: string | null;
};

// "Alice" (singles) or "Alice & Bob" (doubles).
function sideLabel(captain: string, partner: PartnerLite): string {
  return partner ? `${captain} & ${partner.name}` : captain;
}

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
  // Actionable-for-you items float to the top: a match ready to play (either
  // side), or a reported result awaiting your confirmation.
  const actionable = matches.filter((m) => m.canConfirm || m.status === "accepted");
  const waiting = matches.filter((m) => !actionable.includes(m) && m.status === "awaiting_confirmation");
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
              message="Challenge another player to an individual match — it's ready to play straight away. Record the result after; the other player can reject it if they can't play."
              icon={Zap}
              action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New challenge</Button>}
            />
          )}

          {data && matches.length > 0 && (
            <div className="space-y-6">
              <Section title="Needs your attention" items={actionable} empty="Nothing needs your attention right now.">
                {(m) => (
                  <ChallengeCard key={m.id} m={m} busy={busy}
                    onRejectChallenge={() => act(m, "decline", "Challenge rejected — match cancelled")}
                    onReport={() => setScoreFor(m)}
                    onConfirm={() => act(m, "confirm", "Result confirmed")}
                    onReject={() => act(m, "reject", "Result rejected — play it again")}
                    onCancel={() => act(m, "cancel", "Challenge cancelled")}
                  />
                )}
              </Section>

              {waiting.length > 0 && (
                <Section title="Waiting on the other player" items={waiting} empty="">
                  {(m) => (
                    <ChallengeCard key={m.id} m={m} busy={busy}
                      onRejectChallenge={() => act(m, "decline", "Challenge rejected — match cancelled")}
                      onReport={() => setScoreFor(m)}
                      onConfirm={() => act(m, "confirm", "Result confirmed")}
                      onReject={() => act(m, "reject", "Result rejected — play it again")}
                      onCancel={() => act(m, "cancel", "Challenge cancelled")}
                    />
                  )}
                </Section>
              )}

              {finished.length > 0 && (
                <Section title="History" items={finished} empty="">
                  {(m) => (
                    <ChallengeCard key={m.id} m={m} busy={busy}
                      onRejectChallenge={() => act(m, "decline", "Challenge rejected — match cancelled")}
                      onReport={() => setScoreFor(m)}
                      onConfirm={() => act(m, "confirm", "Result confirmed")}
                      onReject={() => act(m, "reject", "Result rejected — play it again")}
                      onCancel={() => act(m, "cancel", "Challenge cancelled")}
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
      { side: "A", label: sideLabel(m.challenger.name, m.challengerPartner) },
      { side: "B", label: sideLabel(m.opponent.name, m.opponentPartner) },
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
  onRejectChallenge,
  onReport,
  onConfirm,
  onReject,
  onCancel,
}: {
  m: CasualMatch;
  busy: string | null;
  onRejectChallenge: () => void;
  onReport: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onCancel: () => void;
}) {
  const label = STATUS_LABEL[m.status];
  const mySide: "A" | "B" = m.isChallenger ? "A" : "B";
  const youWon = m.status === "completed" && m.winnerSide === mySide;
  const chalLabel = sideLabel(m.challenger.name, m.challengerPartner);
  const oppLabel = sideLabel(m.opponent.name, m.opponentPartner);
  const otherLabel = m.isChallenger ? oppLabel : chalLabel;
  const busyAny = busy?.startsWith(m.id) ?? false;
  const [showComments, setShowComments] = useState(false);

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={m.winnerSide === "A" ? "font-bold" : "font-medium"}>{chalLabel}</span>
          <span className="text-xs text-muted">vs</span>
          <span className={m.winnerSide === "B" ? "font-bold" : "font-medium"}>{oppLabel}</span>
          <Badge color={m.matchType === "doubles" ? "blue" : "slate"}>{m.matchType === "doubles" ? "Doubles" : "Singles"}</Badge>
          <Badge color={label.color}>{label.text}</Badge>
          {m.status === "completed" && (
            <Badge color={youWon ? "green" : "red"}>{youWon ? "You won" : "You lost"}</Badge>
          )}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{m.isChallenger ? `You challenged ${otherLabel}` : `${otherLabel} challenged you`}</span>
          <span>· Best of {m.bestOf}</span>
          {m.location && <span>· {m.location}</span>}
          {m.scheduledAt && <span>· {formatDateTime(m.scheduledAt)}</span>}
          {scoreLine(m) && <span className="font-mono">· {scoreLine(m)}</span>}
        </p>
        {m.status === "awaiting_confirmation" && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {m.canConfirm
              ? `${otherLabel} reported this result — confirm it's correct.`
              : "Reported — waiting for the other player to confirm."}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {/* Ready to play — either side can record the result. */}
        {m.status === "accepted" && m.canReport && (
          <Button size="sm" variant="outline" disabled={busyAny} onClick={onReport}>Enter result</Button>
        )}
        {/* The challenged side can reject (cancels the match) before any result. */}
        {m.canReject && (
          <Button size="sm" variant="ghost" loading={busy === m.id + "decline"} disabled={busyAny} onClick={onRejectChallenge}>Reject</Button>
        )}
        {/* The challenger can call off their own ready-to-play challenge. */}
        {m.isChallenger && m.status === "accepted" && (
          <Button size="sm" variant="ghost" disabled={busyAny} onClick={onCancel}>Cancel</Button>
        )}
        {/* Reported score — the OTHER side confirms or rejects. */}
        {m.canConfirm && (
          <>
            <Button size="sm" loading={busy === m.id + "confirm"} disabled={busyAny} onClick={onConfirm}>Confirm</Button>
            <Button size="sm" variant="ghost" disabled={busyAny} onClick={onReject}>Reject</Button>
          </>
        )}
        {/* Reporter can amend before it's confirmed; either side can cancel. */}
        {m.status === "awaiting_confirmation" && m.canReport && (
          <Button size="sm" variant="outline" disabled={busyAny} onClick={onReport}>Edit result</Button>
        )}
        {m.status === "awaiting_confirmation" && m.canCancel && !m.canConfirm && !m.canReport && (
          <Button size="sm" variant="ghost" disabled={busyAny} onClick={onCancel}>Cancel</Button>
        )}
      </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ViewOnMapButton location={m.location} lat={m.locationLat} lng={m.locationLng} />
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-foreground transition hover:bg-surface-2"
        >
          <MessageSquare className="h-4 w-4 text-muted" />
          {showComments ? "Hide comments" : "Comments"}
        </button>
      </div>
      {showComments && <MatchComments basePath={`/api/casual-matches/${m.id}`} />}
    </Card>
  );
}

type Opponent = { id: string; displayName: string; fullName: string; city: string | null };

// Searchable single-player picker (account-holders only, minus already-picked).
function PlayerPicker({
  label,
  selected,
  onSelect,
  excludeIds,
}: {
  label: string;
  selected: Opponent | null;
  onSelect: (o: Opponent | null) => void;
  excludeIds: string[];
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useSWR<Opponent[]>(
    `/api/casual-matches/opponents${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`,
    swrFetcher
  );
  const results = (data ?? []).filter((o) => !excludeIds.includes(o.id));

  return (
    <Field label={label} required>
      {selected ? (
        <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
          <span><span className="font-medium">{selected.displayName}</span><span className="text-muted"> · {selected.fullName}</span></span>
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => onSelect(null)}>Change</button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search players with an account…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[var(--border)]">
            {isLoading && <p className="px-3 py-3 text-sm text-muted">Searching…</p>}
            {!isLoading && results.length === 0 && (
              <p className="px-3 py-3 text-sm text-muted">No players found. Only players with an account can be added.</p>
            )}
            {results.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onSelect(o)}
                className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span className="font-medium">{o.displayName}</span>
                <span className="text-muted"> · {o.fullName}{o.city ? ` · ${o.city}` : ""}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Field>
  );
}

function NewChallengeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [matchType, setMatchType] = useState<"singles" | "doubles">("singles");
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [partner, setPartner] = useState<Opponent | null>(null);
  const [oppPartner, setOppPartner] = useState<Opponent | null>(null);
  const [bestOf, setBestOf] = useState("3");
  const [place, setPlace] = useState<PlaceValue>({ name: "", lat: null, lng: null });
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  const isDoubles = matchType === "doubles";
  const ready = isDoubles ? Boolean(opponent && partner && oppPartner) : Boolean(opponent);
  const picked = [opponent, partner, oppPartner].filter(Boolean).map((o) => o!.id);

  async function save() {
    if (!ready) return;
    setSaving(true);
    try {
      await api.post("/api/casual-matches", {
        matchType,
        opponentPlayerId: opponent!.id,
        challengerPartnerPlayerId: isDoubles ? partner!.id : undefined,
        opponentPartnerPlayerId: isDoubles ? oppPartner!.id : undefined,
        bestOf: Number(bestOf),
        location: place.name.trim() ? place.name.trim() : undefined,
        locationLat: place.name.trim() ? place.lat : undefined,
        locationLng: place.name.trim() ? place.lng : undefined,
        scheduledAt: scheduledAt || undefined,
      });
      toast.success("Challenge sent — ready to play");
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
          <Button onClick={save} loading={saving} disabled={!ready}>Send challenge</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Match type">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={matchType === "singles" ? "primary" : "outline"} onClick={() => setMatchType("singles")}>Singles</Button>
            <Button type="button" size="sm" variant={matchType === "doubles" ? "primary" : "outline"} onClick={() => setMatchType("doubles")}>Doubles</Button>
          </div>
        </Field>

        {isDoubles && <PlayerPicker label="Your partner" selected={partner} onSelect={setPartner} excludeIds={picked} />}
        <PlayerPicker label="Opponent" selected={opponent} onSelect={setOpponent} excludeIds={picked} />
        {isDoubles && <PlayerPicker label="Opponent's partner" selected={oppPartner} onSelect={setOppPartner} excludeIds={picked} />}
        {isDoubles && <p className="text-xs text-muted">All four players must have an account. Anyone on the other side can reject the challenge.</p>}

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
          <LocationPicker value={place} onChange={setPlace} placeholder="Search a court, club or address…" />
        </Field>
      </div>
    </Modal>
  );
}

"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Plus, Pencil, Play, Ban, Lock, LockOpen, MessageSquare, CalendarRange, GitBranch, Layers, ListChecks, Trophy } from "lucide-react";
import { api, ApiClientError, swrFetcher, swrFetcherWithMeta } from "@/lib/client/api";
import { Card, Button, Badge, statusColor, Select, Input, Field } from "@/components/ui/primitives";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";
import { ScoreEntryModal, type ScorableMatch } from "@/components/ScoreEntryModal";
import { MatchComments } from "@/components/MatchComments";
import { BracketTab } from "./BracketTab";
import { CreateStageModal, GenerateFixturesModal, GenerateBracketModal } from "./FixtureModals";
import { formatDateTime, titleCase } from "@/lib/client/format";
import type { MatchDTO, StageDTO, TournamentPlayerDTO, TeamDTO } from "./types";

type View = "list" | "bracket";

const EMPTY_MATCHES: MatchDTO[] = [];

/**
 * The unified draw-and-play tab. Folds what used to be three separate tabs
 * (Matches, Stages, Bracket) into one: the "Generate fixtures / bracket" and
 * "Add stage / Create match" builders live here, a List↔Bracket switch picks
 * the view, and stage chips filter the list. Management actions are gated by
 * permission, so this same component is also the read-only public view.
 */
export function MatchesTab({ tournamentId, format }: { tournamentId: string; format: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const canManage = can(PERMS.MATCH_MANAGE);
  const canStage = can(PERMS.STAGE_MANAGE);

  const [view, setView] = useState<View>("list");
  const [stageFilter, setStageFilter] = useState<string>("all"); // stage id or "all"
  const [creating, setCreating] = useState(false);
  const [addingStage, setAddingStage] = useState(false);
  const [genFixtures, setGenFixtures] = useState(false);
  const [genBracket, setGenBracket] = useState(false);
  const [scoreMatch, setScoreMatch] = useState<ScorableMatch | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ data: MatchDTO[] }>(
    `/api/matches?tournamentId=${tournamentId}&pageSize=100`,
    swrFetcherWithMeta,
    // Poll while a match is in progress so the live score stays fresh for everyone.
    { refreshInterval: (latest) => (latest?.data?.some((m) => m.status === "in_progress") ? 4000 : 0) }
  );

  const matches = data?.data ?? EMPTY_MATCHES;

  // Distinct stages present, in stage order — drives both the filter chips and
  // the stage summary. Derived from the matches so no extra fetch is needed.
  const stages = useMemo(() => {
    const map = new Map<string, { id: string; name: string; order: number; status: string }>();
    for (const m of matches) if (m.stage) map.set(m.stage.id, { id: m.stage.id, name: m.stage.name, order: m.stage.order, status: m.status });
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [matches]);

  const visibleMatches = stageFilter === "all" ? matches : matches.filter((m) => m.stage?.id === stageFilter);

  async function patchMatch(m: MatchDTO, body: Record<string, unknown>, successMsg: string) {
    setBusyId(m.id);
    try {
      await api.put(`/api/matches/${m.id}`, body);
      toast.success(successMsg);
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {/* Toolbar: view switch on the left, builders (organizer-only) on the right. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
          <ViewButton active={view === "list"} onClick={() => setView("list")} icon={ListChecks} label="List" />
          <ViewButton active={view === "bracket"} onClick={() => setView("bracket")} icon={Trophy} label="Bracket" />
        </div>
        {(canManage || canStage) && (
          <div className="flex flex-wrap gap-2">
            {canStage && <Button variant="outline" size="sm" onClick={() => setGenFixtures(true)}><CalendarRange className="h-4 w-4" /> Generate fixtures</Button>}
            {canStage && <Button variant="outline" size="sm" onClick={() => setGenBracket(true)}><GitBranch className="h-4 w-4" /> Generate bracket</Button>}
            {canStage && <Button variant="ghost" size="sm" onClick={() => setAddingStage(true)}><Layers className="h-4 w-4" /> Add stage</Button>}
            {canManage && <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create match</Button>}
          </div>
        )}
      </div>

      {view === "bracket" ? (
        <BracketTab tournamentId={tournamentId} />
      ) : (
        <>
          {isLoading && <ListSkeleton rows={4} />}
          {error && <ErrorState onRetry={() => mutate()} />}
          {data && matches.length === 0 && (
            <EmptyState
              title="No matches yet"
              message={
                canStage
                  ? "Use “Generate fixtures” for a round-robin or group stage, “Generate bracket” for a knockout, or “Create match” for a single game."
                  : "The organizer hasn’t added any matches yet."
              }
              icon={CalendarRange}
            />
          )}

          {data && matches.length > 0 && (
            <div className="space-y-3">
              {stages.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <FilterChip active={stageFilter === "all"} onClick={() => setStageFilter("all")}>All matches</FilterChip>
                  {stages.map((s) => (
                    <FilterChip key={s.id} active={stageFilter === s.id} onClick={() => setStageFilter(s.id)}>{s.name}</FilterChip>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {visibleMatches.map((m) => (
                  <MatchRow
                    key={m.id}
                    m={m}
                    busy={busyId === m.id}
                    onScore={() => setScoreMatch(m)}
                    onPatch={patchMatch}
                    onRefresh={() => mutate()}
                  />
                ))}
                {visibleMatches.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted">No matches in this stage.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {creating && (
        <CreateMatchModal
          tournamentId={tournamentId}
          format={format}
          onClose={() => setCreating(false)}
          onCreated={() => mutate()}
        />
      )}
      {addingStage && (
        <CreateStageModal tournamentId={tournamentId} onClose={() => setAddingStage(false)} onCreated={() => mutate()} />
      )}
      {genFixtures && (
        <GenerateFixturesModal tournamentId={tournamentId} format={format} onClose={() => setGenFixtures(false)} onDone={() => mutate()} />
      )}
      {genBracket && (
        <GenerateBracketModal tournamentId={tournamentId} format={format} onClose={() => setGenBracket(false)} onDone={() => mutate()} />
      )}

      <ScoreEntryModal open={Boolean(scoreMatch)} match={scoreMatch} onClose={() => setScoreMatch(null)} onSaved={() => mutate()} />
    </div>
  );
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof ListChecks; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-[var(--primary)] bg-[var(--primary)]/10 text-foreground"
          : "border-[var(--border)] text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function MatchRow({
  m,
  busy,
  onScore,
  onPatch,
  onRefresh,
}: {
  m: MatchDTO;
  busy: boolean;
  onScore: () => void;
  onPatch: (m: MatchDTO, body: Record<string, unknown>, successMsg: string) => void;
  onRefresh: () => void;
}) {
  const { can } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const bothSet = m.sides[0]?.label !== "TBD" && m.sides[1]?.label !== "TBD";
  const canManage = can(PERMS.MATCH_MANAGE);
  const canScore = can(PERMS.SCORE_EDIT);

  async function setLive(a: number, b: number) {
    try {
      await api.post(`/api/matches/${m.id}/live`, { a: Math.max(0, a), b: Math.max(0, b) });
      onRefresh();
    } catch {
      /* transient — the next poll corrects it */
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SideName label={m.sides[0]?.label ?? "TBD"} winner={m.winnerSide === "A"} />
            <span className="text-sm font-semibold text-muted">
              {m.status === "completed" ? `${m.sides[0]?.gamesWon}–${m.sides[1]?.gamesWon}` : "vs"}
            </span>
            <SideName label={m.sides[1]?.label ?? "TBD"} winner={m.winnerSide === "B"} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {m.stage && <Badge color="slate">{m.stage.name}</Badge>}
            <span>Best of {m.bestOf}</span>
            {m.courtNumber && <span>· Court {m.courtNumber}</span>}
            {m.scheduledAt && <span>· {formatDateTime(m.scheduledAt)}</span>}
            {m.games.length > 0 && <span className="font-mono">· {m.games.map((g) => `${g.scoreA}-${g.scoreB}`).join(", ")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={statusColor(m.status)}>{titleCase(m.status)}</Badge>
          {m.isClosed && (
            <Badge color="slate"><span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Closed</span></Badge>
          )}
          {/* Lifecycle (item 5): make status changes explicit. */}
          {canManage && m.status === "scheduled" && bothSet && (
            <Button size="sm" variant="ghost" loading={busy} onClick={() => onPatch(m, { status: "in_progress" }, "Match started")}>
              <Play className="h-3.5 w-3.5" /> Start
            </Button>
          )}
          {canManage && (m.status === "scheduled" || m.status === "in_progress") && (
            <Button size="sm" variant="ghost" loading={busy} onClick={() => onPatch(m, { status: "cancelled" }, "Match cancelled")}>
              <Ban className="h-3.5 w-3.5" /> Cancel
            </Button>
          )}
          {/* Score entry — blocked once the match is closed (item 6). */}
          {can(PERMS.SCORE_EDIT) && m.status !== "cancelled" && !m.isClosed && bothSet && (
            <Button size="sm" variant="outline" onClick={onScore}>
              <Pencil className="h-3.5 w-3.5" /> {m.status === "completed" ? "Edit score" : "Score"}
            </Button>
          )}
          {/* Close / reopen the result lock (item 6). */}
          {canManage && m.status === "completed" && !m.isClosed && (
            <Button size="sm" variant="ghost" loading={busy} onClick={() => onPatch(m, { closed: true }, "Match closed")}>
              <Lock className="h-3.5 w-3.5" /> Close
            </Button>
          )}
          {canManage && m.isClosed && (
            <Button size="sm" variant="ghost" loading={busy} onClick={() => onPatch(m, { closed: false }, "Match reopened")}>
              <LockOpen className="h-3.5 w-3.5" /> Reopen
            </Button>
          )}
        </div>
      </div>

      {(m.status === "in_progress" || (m.status === "scheduled" && bothSet && canScore)) && (
        <div className="mt-3 flex items-center justify-center gap-3 rounded-lg bg-surface-2 py-3 sm:gap-6">
          <LiveSide label={m.sides[0]?.label ?? "A"} score={m.liveA ?? 0} canScore={canScore} onSet={(v) => setLive(v, m.liveB ?? 0)} />
          {m.status === "in_progress" ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-red-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Live
            </span>
          ) : (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Tap to start</span>
          )}
          <LiveSide label={m.sides[1]?.label ?? "B"} score={m.liveB ?? 0} canScore={canScore} onSet={(v) => setLive(m.liveA ?? 0, v)} />
        </div>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-foreground transition hover:bg-surface-2"
        >
          <MessageSquare className="h-4 w-4 text-muted" />
          {showComments ? "Hide comments" : "Comments"}
        </button>
      </div>
      {showComments && <MatchComments basePath={`/api/matches/${m.id}`} />}
    </Card>
  );
}

function SideName({ label, winner }: { label: string; winner: boolean }) {
  return <span className={`truncate ${winner ? "font-bold text-foreground" : "font-medium"}`}>{label}</span>;
}

// One side of the live scoreboard: big current score, with +/- for scorers.
function LiveSide({ label, score, canScore, onSet }: { label: string; score: number; canScore: boolean; onSet: (v: number) => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="max-w-[8rem] truncate text-xs text-muted sm:max-w-[12rem]">{label}</span>
      <div className="flex items-center gap-2">
        {canScore && (
          <button type="button" aria-label={`${label} minus`} onClick={() => onSet(Math.max(0, score - 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-lg leading-none text-muted hover:bg-surface">−</button>
        )}
        <span className="min-w-[2ch] text-center text-3xl font-bold tabular-nums text-foreground">{score}</span>
        {canScore && (
          <button type="button" aria-label={`${label} plus`} onClick={() => onSet(score + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-lg leading-none text-primary-foreground hover:opacity-90">+</button>
        )}
      </div>
    </div>
  );
}

function CreateMatchModal({
  tournamentId,
  format,
  onClose,
  onCreated,
}: {
  tournamentId: string;
  format: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const isTeam = format !== "singles";
  const [stageId, setStageId] = useState("");
  const [bestOf, setBestOf] = useState("3");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [court, setCourt] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: stages } = useSWR<StageDTO[]>(`/api/tournaments/${tournamentId}/stages`, swrFetcher);
  const { data: playersResp } = useSWR<TournamentPlayerDTO[]>(
    !isTeam ? `/api/tournaments/${tournamentId}/players` : null,
    swrFetcher
  );
  const { data: teams } = useSWR<TeamDTO[]>(isTeam ? `/api/teams?tournamentId=${tournamentId}` : null, swrFetcher);

  const options: { id: string; label: string }[] = isTeam
    ? (teams ?? []).map((t) => ({ id: t.id, label: t.name }))
    : (playersResp ?? []).map((tp) => ({ id: tp.player.id, label: tp.player.displayName }));

  const sameError = a && b && a === b ? "Choose two different sides" : undefined;

  async function save() {
    if (!a || !b || sameError) return;
    setSaving(true);
    try {
      const ref = (id: string) => (isTeam ? { teamId: id } : { playerId: id });
      await api.post("/api/matches", {
        tournamentId,
        matchType: isTeam ? "doubles" : "singles",
        bestOf: Number(bestOf),
        stageId: stageId || undefined,
        courtNumber: court || undefined,
        scheduledAt: scheduledAt || undefined,
        sideA: ref(a),
        sideB: ref(b),
      });
      toast.success("Match created");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not create match");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Create match"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!a || !b || Boolean(sameError)}>Create</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {options.length < 2 && (
          <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">
            Add at least two {isTeam ? "teams" : "registered players"} to this tournament first.
          </p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Stage">
            <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
              <option value="">None</option>
              {(stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Format">
            <Select value={bestOf} onChange={(e) => setBestOf(e.target.value)}>
              <option value="1">Best of 1</option>
              <option value="3">Best of 3</option>
            </Select>
          </Field>
        </div>
        <Field label={isTeam ? "Team A" : "Player A"} required>
          <Select value={a} onChange={(e) => setA(e.target.value)}>
            <option value="">Select…</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label={isTeam ? "Team B" : "Player B"} required error={sameError}>
          <Select value={b} onChange={(e) => setB(e.target.value)}>
            <option value="">Select…</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Court"><Input value={court} onChange={(e) => setCourt(e.target.value)} placeholder="1" /></Field>
          <Field label="Scheduled"><Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

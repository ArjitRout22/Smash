"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, Pencil, Play, Ban, Lock, LockOpen, MessageSquare } from "lucide-react";
import { api, ApiClientError, swrFetcher, swrFetcherWithMeta } from "@/lib/client/api";
import { Card, Button, Badge, statusColor, Select, Input, Field } from "@/components/ui/primitives";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";
import { ScoreEntryModal, type ScorableMatch } from "@/components/ScoreEntryModal";
import { MatchComments } from "@/components/MatchComments";
import { formatDateTime, titleCase } from "@/lib/client/format";
import type { MatchDTO, StageDTO, TournamentPlayerDTO, TeamDTO } from "./types";

export function MatchesTab({ tournamentId, format }: { tournamentId: string; format: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [scoreMatch, setScoreMatch] = useState<ScorableMatch | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ data: MatchDTO[] }>(
    `/api/matches?tournamentId=${tournamentId}&pageSize=100`,
    swrFetcherWithMeta
  );

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
      <div className="mb-4 flex justify-end">
        {can(PERMS.MATCH_MANAGE) && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create match</Button>}
      </div>

      {isLoading && <ListSkeleton rows={4} />}
      {error && <ErrorState onRetry={() => mutate()} />}
      {data && data.data.length === 0 && <EmptyState title="No matches yet" message="Create a match or generate a bracket from the Stages tab." />}

      {data && data.data.length > 0 && (
        <div className="space-y-2">
          {data.data.map((m) => (
            <MatchRow
              key={m.id}
              m={m}
              busy={busyId === m.id}
              onScore={() => setScoreMatch(m)}
              onPatch={patchMatch}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateMatchModal
          tournamentId={tournamentId}
          format={format}
          onClose={() => setCreating(false)}
          onCreated={() => mutate()}
        />
      )}

      <ScoreEntryModal open={Boolean(scoreMatch)} match={scoreMatch} onClose={() => setScoreMatch(null)} onSaved={() => mutate()} />
    </div>
  );
}

function MatchRow({
  m,
  busy,
  onScore,
  onPatch,
}: {
  m: MatchDTO;
  busy: boolean;
  onScore: () => void;
  onPatch: (m: MatchDTO, body: Record<string, unknown>, successMsg: string) => void;
}) {
  const { can } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const bothSet = m.sides[0]?.label !== "TBD" && m.sides[1]?.label !== "TBD";
  const canManage = can(PERMS.MATCH_MANAGE);

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

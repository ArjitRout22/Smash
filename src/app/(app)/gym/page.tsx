"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Dumbbell, Plus, Flame, Trophy, CalendarDays, Trash2, Footprints } from "lucide-react";
import { api, ApiClientError, swrFetcher, swrFetcherWithMeta } from "@/lib/client/api";
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Button, Card, CardHeader, Badge, Input, Select, Field, Avatar } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { addDays } from "@/lib/engines/gym";

type Stats = {
  currentStreak: number;
  longestStreak: number;
  sessionsThisWeek: number;
  sessionsLast30: number;
  totalDays: number;
  activeDays: string[];
  consistencyScore: number;
};
type BadgeT = { key: string; label: string; emoji: string };
type Summary = {
  stats: Stats;
  badges: BadgeT[];
  totalWorkouts: number;
  totalDistanceKm: number;
  weeklyGoal: number | null;
  optIn: boolean;
};
type Workout = {
  id: string;
  kind: "treadmill" | "strength" | "freeform";
  day: string;
  durationMin: number | null;
  distanceKm: number | null;
  speedKmh: number | null;
  inclineLevel: number | null;
  exercise: string | null;
  sets: number | null;
  reps: number | null;
  weightKg: number | null;
  notes: string | null;
};
type LeaderRow = {
  userId: string;
  playerId: string | null;
  name: string;
  photoUrl: string | null;
  currentStreak: number;
  sessionsThisWeek: number;
  sessionsLast30: number;
  totalDays: number;
  consistencyScore: number;
  isMe: boolean;
  rank: number;
};

const KIND_LABEL: Record<Workout["kind"], string> = { treadmill: "Treadmill", strength: "Strength", freeform: "Other" };

export default function GymPage() {
  const [tab, setTab] = useState<"me" | "board">("me");
  const [logging, setLogging] = useState(false);
  const { success, error: toastError } = useToast();

  const summary = useSWR<Summary>("/api/gym/summary", swrFetcher);
  const workouts = useSWR<{ data: Workout[] }>("/api/gym/workouts?page=1&pageSize=30", swrFetcherWithMeta);

  function refresh() {
    summary.mutate();
    workouts.mutate();
  }

  return (
    <div>
      <PageHeader
        title="Gym"
        subtitle="Log your workouts, build a streak, and climb the consistency leaderboard. Separate from your badminton rating."
        actions={
          <Button size="sm" onClick={() => setLogging(true)}>
            <Plus className="h-4 w-4" /> Log workout
          </Button>
        }
      />

      <div className="mb-5 inline-flex rounded-lg bg-surface-2 p-1 text-sm font-medium">
        {([
          ["me", "My Gym"],
          ["board", "Leaderboard"],
        ] as [typeof tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 transition ${tab === t ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "me" ? (
        <MyGym summary={summary} workouts={workouts} onRefresh={refresh} onLog={() => setLogging(true)} />
      ) : (
        <Leaderboard optIn={summary.data?.optIn ?? false} onOptInChange={() => summary.mutate()} />
      )}

      {logging && (
        <LogWorkoutModal
          onClose={() => setLogging(false)}
          onLogged={() => {
            success("Workout logged 💪");
            setLogging(false);
            refresh();
          }}
          onError={(m) => toastError(m)}
        />
      )}
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold text-foreground">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </Card>
  );
}

function MyGym({
  summary,
  workouts,
  onRefresh,
  onLog,
}: {
  summary: ReturnType<typeof useSWR<Summary>>;
  workouts: ReturnType<typeof useSWR<{ data: Workout[] }>>;
  onRefresh: () => void;
  onLog: () => void;
}) {
  const { error: toastError } = useToast();
  const s = summary.data;

  if (summary.isLoading) return <ListSkeleton rows={4} />;
  if (summary.error) return <ErrorState onRetry={() => summary.mutate()} />;
  if (!s) return null;

  const goalText = s.weeklyGoal ? `${s.stats.sessionsThisWeek} / ${s.weeklyGoal}` : String(s.stats.sessionsThisWeek);
  const list = workouts.data?.data ?? [];

  async function del(id: string) {
    try {
      await api.del(`/api/gym/workouts/${id}`);
      onRefresh();
    } catch (err) {
      toastError(err instanceof ApiClientError ? err.message : "Could not delete");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<Flame className="h-4 w-4" />} label="Current streak" value={`${s.stats.currentStreak}d`} hint={`Longest ${s.stats.longestStreak}d`} />
        <Stat icon={<CalendarDays className="h-4 w-4" />} label="This week" value={goalText} hint={s.weeklyGoal ? "vs goal" : "sessions"} />
        <Stat icon={<Dumbbell className="h-4 w-4" />} label="Total sessions" value={s.totalWorkouts} hint={`${s.stats.totalDays} active days`} />
        <Stat icon={<Footprints className="h-4 w-4" />} label="Distance" value={`${s.totalDistanceKm} km`} hint="all time" />
      </div>

      <GoalAndOptIn weeklyGoal={s.weeklyGoal} optIn={s.optIn} onSaved={() => summary.mutate()} />

      {s.badges.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Badges</div>
          <div className="flex flex-wrap gap-2">
            {s.badges.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-sm">
                <span aria-hidden>{b.emoji}</span> {b.label}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Last 12 weeks</div>
        <Heatmap activeDays={s.stats.activeDays} />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Recent workouts" />
        {list.length === 0 ? (
          <EmptyState title="No workouts yet" message="Log your first session to start a streak." icon={Dumbbell} action={<Button size="sm" onClick={onLog}><Plus className="h-4 w-4" /> Log workout</Button>} />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {list.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge color="slate">{KIND_LABEL[w.kind]}</Badge>
                    <span className="truncate font-medium text-foreground">{workoutSummary(w)}</span>
                  </div>
                  <div className="text-xs text-muted">{w.day}{w.notes ? ` · ${w.notes}` : ""}</div>
                </div>
                <button onClick={() => del(w.id)} aria-label="Delete workout" className="shrink-0 rounded-md p-2 text-muted hover:bg-surface-2 hover:text-[var(--danger)]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function workoutSummary(w: Workout): string {
  if (w.kind === "treadmill") {
    const parts = [
      w.distanceKm != null ? `${w.distanceKm} km` : null,
      w.durationMin != null ? `${w.durationMin} min` : null,
      w.speedKmh != null ? `${w.speedKmh} km/h` : null,
      w.inclineLevel ? `incline ${w.inclineLevel}` : null,
    ].filter(Boolean);
    return `Treadmill — ${parts.join(" · ") || "run"}`;
  }
  if (w.kind === "strength") {
    const sr = [w.sets && w.reps ? `${w.sets}×${w.reps}` : null, w.weightKg != null ? `${w.weightKg} kg` : null].filter(Boolean).join(" ");
    return `${w.exercise ?? "Strength"}${sr ? ` — ${sr}` : ""}`;
  }
  return `${w.exercise ?? "Workout"}${w.durationMin != null ? ` — ${w.durationMin} min` : ""}`;
}

function Heatmap({ activeDays }: { activeDays: string[] }) {
  const set = useMemo(() => new Set(activeDays), [activeDays]);
  const today = new Date().toISOString().slice(0, 10);
  // 84 days (12 cols × 7 rows), oldest → newest so grid-flow-col fills weeks.
  const cells = useMemo(() => {
    const start = addDays(today, -83);
    return Array.from({ length: 84 }, (_, i) => addDays(start, i));
  }, [today]);
  return (
    <div className="overflow-x-auto">
      <div className="grid grid-flow-col grid-rows-7 gap-1" style={{ width: "max-content" }}>
        {cells.map((d) => (
          <div
            key={d}
            title={`${d}${set.has(d) ? " · worked out" : ""}`}
            className={`h-3.5 w-3.5 rounded-sm ${set.has(d) ? "bg-primary" : "bg-surface-2"} ${d === today ? "ring-1 ring-[var(--primary)]" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

function GoalAndOptIn({ weeklyGoal, optIn, onSaved }: { weeklyGoal: number | null; optIn: boolean; onSaved: () => void }) {
  const { success, error: toastError } = useToast();
  const [goal, setGoal] = useState(weeklyGoal ? String(weeklyGoal) : "");
  const [saving, setSaving] = useState(false);

  async function save(patch: { optIn?: boolean; weeklyGoal?: number | null }) {
    setSaving(true);
    try {
      await api.put("/api/gym/settings", patch);
      success("Saved");
      onSaved();
    } catch (err) {
      toastError(err instanceof ApiClientError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-end gap-2">
        <Field label="Weekly goal" htmlFor="goal" hint="Sessions/week (optional)">
          <Input id="goal" type="number" min={1} max={14} value={goal} onChange={(e) => setGoal(e.target.value)} className="w-28" placeholder="e.g. 4" />
        </Field>
        <Button variant="outline" size="sm" loading={saving} onClick={() => save({ weeklyGoal: goal ? Number(goal) : null })}>
          Save goal
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={optIn} onChange={(e) => save({ optIn: e.target.checked })} className="h-4 w-4" />
        Show me on the global Gym leaderboard
      </label>
    </Card>
  );
}

function Leaderboard({ optIn, onOptInChange }: { optIn: boolean; onOptInChange: () => void }) {
  const { data, error, isLoading, mutate } = useSWR<{ data: LeaderRow[] }>("/api/gym/leaderboard?page=1&pageSize=50", swrFetcherWithMeta);
  const { success, error: toastError } = useToast();
  const rows = data?.data ?? [];

  async function join() {
    try {
      await api.put("/api/gym/settings", { optIn: true });
      success("You're on the leaderboard 🎉");
      onOptInChange();
      mutate();
    } catch (err) {
      toastError(err instanceof ApiClientError ? err.message : "Could not join");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!optIn && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <div className="font-medium text-foreground">Join the global Gym leaderboard</div>
            <div className="text-muted">Ranked by consistency — showing up beats big one-off sessions. You choose to appear.</div>
          </div>
          <Button size="sm" onClick={join}>Join leaderboard</Button>
        </Card>
      )}

      <p className="text-xs text-muted">Ranked by a consistency score (current streak + sessions in the last 30 days) — everyone across Smash who opts in.</p>

      {isLoading && <ListSkeleton rows={6} />}
      {error && <ErrorState onRetry={() => mutate()} />}
      {!isLoading && !error && rows.length === 0 && (
        <EmptyState title="No one on the board yet" message="Opt in and log a workout to be the first." icon={Trophy} />
      )}

      {rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-4 py-3 font-medium">Rank</th>
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 font-medium">Streak</th>
                  <th className="px-4 py-3 font-medium">This week</th>
                  <th className="px-4 py-3 font-medium">Last 30d</th>
                  <th className="px-4 py-3 font-medium">Active days</th>
                  <th className="px-4 py-3 text-right font-medium" title="Current streak × 10 + sessions in the last 30 days">Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const medal = r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : undefined;
                  return (
                    <tr key={r.userId} className={`border-t border-[var(--border)] ${r.isMe ? "bg-surface-2" : "hover:bg-surface-2"}`}>
                      <td className="px-4 py-3 font-semibold text-muted">{medal ? `${medal} ` : ""}{r.rank}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <Avatar src={r.photoUrl} name={r.name} size={28} />
                          <span className="font-medium text-foreground">{r.name}{r.isMe ? " (you)" : ""}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{r.currentStreak}d</td>
                      <td className="px-4 py-3 text-muted">{r.sessionsThisWeek}</td>
                      <td className="px-4 py-3 text-muted">{r.sessionsLast30}</td>
                      <td className="px-4 py-3 text-muted">{r.totalDays}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">{r.consistencyScore}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function LogWorkoutModal({ onClose, onLogged, onError }: { onClose: () => void; onLogged: () => void; onError: (m: string) => void }) {
  const [kind, setKind] = useState<Workout["kind"]>("treadmill");
  const [f, setF] = useState({ durationMin: "", distanceKm: "", speedKmh: "", inclineLevel: "", exercise: "", sets: "", reps: "", weightKg: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

  async function submit() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { kind };
      if (kind === "treadmill") Object.assign(body, { durationMin: num(f.durationMin), distanceKm: num(f.distanceKm), speedKmh: num(f.speedKmh), inclineLevel: num(f.inclineLevel) });
      if (kind === "strength") Object.assign(body, { exercise: f.exercise.trim() || undefined, sets: num(f.sets), reps: num(f.reps), weightKg: num(f.weightKg) });
      if (kind === "freeform") Object.assign(body, { exercise: f.exercise.trim() || undefined, durationMin: num(f.durationMin) });
      if (f.notes.trim()) body.notes = f.notes.trim();
      await api.post("/api/gym/workouts", body);
      onLogged();
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "Could not log workout");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Log a workout"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Log it</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Type" htmlFor="kind">
          <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value as Workout["kind"])}>
            <option value="treadmill">Treadmill</option>
            <option value="strength">Strength</option>
            <option value="freeform">Other</option>
          </Select>
        </Field>

        {kind === "treadmill" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (min)" htmlFor="dur"><Input id="dur" type="number" min={1} value={f.durationMin} onChange={set("durationMin")} placeholder="30" /></Field>
            <Field label="Distance (km)" htmlFor="dist"><Input id="dist" type="number" step="0.1" min={0} value={f.distanceKm} onChange={set("distanceKm")} placeholder="5" /></Field>
            <Field label="Speed (km/h)" htmlFor="spd"><Input id="spd" type="number" step="0.1" min={0} value={f.speedKmh} onChange={set("speedKmh")} placeholder="10" /></Field>
            <Field label="Incline" htmlFor="inc" hint="Leave blank if flat"><Input id="inc" type="number" step="0.5" min={0} value={f.inclineLevel} onChange={set("inclineLevel")} placeholder="e.g. 3" /></Field>
          </div>
        )}

        {kind === "strength" && (
          <>
            <Field label="Exercise" htmlFor="ex" required><Input id="ex" value={f.exercise} onChange={set("exercise")} placeholder="Bench press" /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Sets" htmlFor="sets"><Input id="sets" type="number" min={1} value={f.sets} onChange={set("sets")} placeholder="3" /></Field>
              <Field label="Reps" htmlFor="reps"><Input id="reps" type="number" min={1} value={f.reps} onChange={set("reps")} placeholder="10" /></Field>
              <Field label="Weight (kg)" htmlFor="wt"><Input id="wt" type="number" step="0.5" min={0} value={f.weightKg} onChange={set("weightKg")} placeholder="40" /></Field>
            </div>
          </>
        )}

        {kind === "freeform" && (
          <>
            <Field label="What did you do?" htmlFor="ff" required><Input id="ff" value={f.exercise} onChange={set("exercise")} placeholder="Yoga, cycling, swim…" /></Field>
            <Field label="Duration (min)" htmlFor="ffd"><Input id="ffd" type="number" min={1} value={f.durationMin} onChange={set("durationMin")} placeholder="45" /></Field>
          </>
        )}

        <Field label="Notes" htmlFor="notes" hint="Optional">
          <Input id="notes" value={f.notes} onChange={set("notes")} placeholder="Felt strong today" />
        </Field>
        <p className="text-xs text-muted">Logged for today. Workouts can&apos;t be edited or backdated — delete and re-log to fix a mistake.</p>
      </div>
    </Modal>
  );
}

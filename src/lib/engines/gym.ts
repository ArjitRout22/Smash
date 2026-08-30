/**
 * Gym consistency engine (pure, no I/O). Everything is derived from the set of
 * calendar days a person worked out — the leaderboard is CONSISTENCY-first
 * (showing up regularly), not volume, so it's encouraging for all fitness levels.
 * Kept entirely separate from badminton rating.
 */

export type WorkoutKind = "treadmill" | "strength" | "freeform";
export const WORKOUT_KINDS: WorkoutKind[] = ["treadmill", "strength", "freeform"];

/** YYYY-MM-DD (UTC) for a Date. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Shift a YYYY-MM-DD key by whole days. */
export function addDays(key: string, delta: number): string {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `b` to `a` (a - b). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);
}

export type GymStats = {
  currentStreak: number; // consecutive days up to today (or yesterday if today's not logged yet)
  longestStreak: number;
  sessionsThisWeek: number; // active days in the last 7 (incl. today)
  sessionsLast30: number; // active days in the last 30
  totalDays: number; // distinct days ever active
  activeDays: string[]; // distinct day keys, ascending (for the calendar)
  consistencyScore: number; // currentStreak*10 + sessionsLast30 — the leaderboard metric
};

/**
 * Compute consistency stats from workout day-keys (duplicates allowed — a day
 * with two workouts still counts once), relative to `today` (YYYY-MM-DD).
 */
export function computeGymStats(dayKeys: string[], today: string): GymStats {
  const set = new Set(dayKeys);
  const days = [...set].sort();

  // Current streak: consecutive days ending today, or yesterday if today isn't
  // logged yet (a streak isn't "broken" until a full day is missed).
  let anchor: string | null = null;
  if (set.has(today)) anchor = today;
  else if (set.has(addDays(today, -1))) anchor = addDays(today, -1);
  let currentStreak = 0;
  if (anchor) {
    let d = anchor;
    while (set.has(d)) {
      currentStreak++;
      d = addDays(d, -1);
    }
  }

  // Longest streak: longest run of consecutive days anywhere in history.
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev && daysBetween(d, prev) === 1 ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
    prev = d;
  }

  const within = (d: string, n: number) => {
    const diff = daysBetween(today, d);
    return diff >= 0 && diff < n;
  };
  const sessionsThisWeek = days.filter((d) => within(d, 7)).length;
  const sessionsLast30 = days.filter((d) => within(d, 30)).length;

  return {
    currentStreak,
    longestStreak,
    sessionsThisWeek,
    sessionsLast30,
    totalDays: set.size,
    activeDays: days,
    consistencyScore: currentStreak * 10 + sessionsLast30,
  };
}

/** Sort key for the consistency-first leaderboard (higher is better). */
export function compareConsistency(
  a: Pick<GymStats, "consistencyScore" | "currentStreak" | "totalDays">,
  b: Pick<GymStats, "consistencyScore" | "currentStreak" | "totalDays">
): number {
  return (
    b.consistencyScore - a.consistencyScore ||
    b.currentStreak - a.currentStreak ||
    b.totalDays - a.totalDays
  );
}

export type BadgeInput = {
  totalDays: number;
  longestStreak: number;
  totalDistanceKm: number;
  hasIncline: boolean;
};

export type Badge = { key: string; label: string; emoji: string };

const BADGE_CATALOG: { key: string; label: string; emoji: string; earned: (b: BadgeInput) => boolean }[] = [
  { key: "first", label: "First workout", emoji: "🎉", earned: (b) => b.totalDays >= 1 },
  { key: "streak7", label: "7-day streak", emoji: "🔥", earned: (b) => b.longestStreak >= 7 },
  { key: "streak30", label: "30-day streak", emoji: "🏆", earned: (b) => b.longestStreak >= 30 },
  { key: "days30", label: "30 days in", emoji: "💪", earned: (b) => b.totalDays >= 30 },
  { key: "days100", label: "Century club", emoji: "💯", earned: (b) => b.totalDays >= 100 },
  { key: "incline", label: "Hill climber", emoji: "⛰️", earned: (b) => b.hasIncline },
  { key: "km50", label: "50 km logged", emoji: "🏃", earned: (b) => b.totalDistanceKm >= 50 },
  { key: "km100", label: "100 km logged", emoji: "🥇", earned: (b) => b.totalDistanceKm >= 100 },
];

/** The badges a person has earned, in catalog order. */
export function computeBadges(input: BadgeInput): Badge[] {
  return BADGE_CATALOG.filter((b) => b.earned(input)).map(({ key, label, emoji }) => ({ key, label, emoji }));
}

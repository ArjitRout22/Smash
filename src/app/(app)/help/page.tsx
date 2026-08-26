import { PageHeader } from "@/components/ui/states";
import { Card, CardHeader } from "@/components/ui/primitives";

export const metadata = { title: "Help" };

type Item = { q: string; a: React.ReactNode };
const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Players & teams",
    items: [
      {
        q: "Two kinds of player",
        a: "Add players you manage via Players → Add player (no login needed — you register them and enter their scores). People who sign up get an account and can do more (play casual matches, accept invites, be nominated to score, join teams across workspaces).",
      },
      {
        q: "Teams",
        a: "For doubles/mixed. Players in your own workspace join a team instantly; a player from another workspace gets an invite and shows as “Pending” until they accept (from their dashboard). A team with a pending member can't be used in a match.",
      },
    ],
  },
  {
    title: "Tournaments",
    items: [
      {
        q: "Public vs private",
        a: "Set this in the tournament's Settings tab. Public tournaments appear in Discover and accept join requests; private ones stay inside your workspace.",
      },
      {
        q: "Getting players in",
        a: "Add your own registered players directly, or — for public tournaments — approve join requests (Players tab) or invite specific players. Only you (the organizer) can add/remove players or teams.",
      },
    ],
  },
  {
    title: "The Matches tab (everything in one place)",
    items: [
      {
        q: "One tab for the whole draw",
        a: "Matches, Stages and Bracket are now a single Matches tab. Use the “Generate fixtures” / “Generate bracket” / “Add stage” / “Create match” buttons to build the draw, the List ↔ Bracket switch to change the view, and the stage chips to filter the list to one stage.",
      },
      {
        q: "Generate fixtures (group stage / round-robin / groups)",
        a: "Matches tab → Generate fixtures, then pick a format: “Group stage → knockout” (split entrants into groups that each play their own round-robin, with the top N of each advancing later — see below), “All play all” (everyone plays everyone), or “Groups (cross-play)” (groups play only across each other). Choose once or twice (double round-robin). E.g. 10 groups of 3 as a group stage = 30 matches.",
      },
      {
        q: "Generate bracket (knockout)",
        a: "Matches tab → Generate bracket builds a single-elimination knockout from the participants you pick, in seeding order (top seed first). Odd counts get automatic byes; winners auto-advance to the next round. See it drawn under the Bracket view.",
      },
    ],
  },
  {
    title: "Match scenarios — what you can run",
    items: [
      {
        q: "A single one-off match",
        a: "Create match → pick the two sides and best-of-1 or best-of-3. Good for a friendly, a decider, or a match that isn't part of a stage.",
      },
      {
        q: "Round-robin (all play all)",
        a: "Generate fixtures → All play all. Everyone plays everyone once (or twice, home & away). The Leaderboard ranks them by points.",
      },
      {
        q: "Groups — cross-play (groups face each other)",
        a: "Generate fixtures → Groups (cross-play). Assign entrants to Group A/B/…; only cross-group matches are created (groups play each other, not among themselves). For the usual “groups then top-N advance” format, use “Group stage → knockout” instead.",
      },
      {
        q: "Knockout bracket",
        a: "Generate bracket for straight single-elimination. Seeds decide who meets whom, byes cover odd numbers, and each winner advances automatically until the final.",
      },
      {
        q: "Group stage → knockout (auto-advance)",
        a: "Generate fixtures → “Group stage → knockout”. Split entrants into groups (any sizes — a group can have 2, 3, 4… players, and even a lone player just carries through), set how many qualify per group (top 1–4), and generate. Each group plays its own round-robin. Once every group match is scored, an “Advance to knockout” button appears — click it and the top N of each group (ranked by wins, then game/point difference) are auto-seeded into a single-elimination bracket. Group winners are seeded apart and get any byes.",
      },
      {
        q: "How many qualifiers → which knockout?",
        a: "The bracket sizes itself to the qualifier count. 8 qualifiers (e.g. 8 groups, top 1) go straight to the quarterfinals. Counts that aren’t a power of two get automatic byes for the top seeds — e.g. 10 groups × top 2 = 20 qualifiers plays Round of 32 → Round of 16 → quarters → semis → final, with the strongest 12 getting a first-round bye.",
      },
      {
        q: "Singles vs doubles / teams",
        a: "Singles tournaments match player-vs-player. Doubles/mixed match team-vs-team — build teams first (Teams tab); a team with a pending cross-workspace member can't be used until they accept.",
      },
      {
        q: "Best of 1 vs best of 3",
        a: "Best of 1 is a single game; best of 3 is first to two games. Each game is first to 21 points — a single-point lead wins it (e.g. 21-20), so there's no deuce or cap.",
      },
      {
        q: "Live scoring",
        a: "For a scheduled/in-progress match, scorers tap +/- to run the score live; on a public tournament it shows under “Live now” for spectators. Saving the final score supersedes the live tally.",
      },
      {
        q: "Cancelling / walkover",
        a: "Use Cancel on a match that won't be played (no-show / walkover). Cancelled matches are skipped and don't award points.",
      },
      {
        q: "Correcting a result",
        a: "Finishing a match locks it. To fix a wrong score, the organizer clicks Reopen, edits, and re-saves — standings recompute automatically.",
      },
      {
        q: "Casual matches (outside a tournament)",
        a: "The Challenges tab runs one-off casual matches between registered users. They never count toward tournament standings or global rankings.",
      },
    ],
  },
  {
    title: "Scoring & points",
    items: [
      {
        q: "Two scoring systems",
        a: "Set this per tournament in Settings → Scoring system. “League” is the default: win = 3, lose but reach 15 points = 1, lose under 15 = 0. “International” is 10 per win, 2 per loss, plus knockout-stage win bonuses. Switching rescores the standings from the stored results, so the points table updates immediately.",
      },
      {
        q: "How the League 15-point floor is judged",
        a: "The floor looks at your best single game in the match. In best-of-3, if you reach 15 in any game you lost, you still earn the consolation point. Win the match and you always get the full win points.",
      },
      {
        q: "Who can enter scores",
        a: "Only the tournament's organizer — plus anyone they nominate. Add nominated scorers in the tournament's Settings tab → Scorers. Everyone else is view-only.",
      },
      {
        q: "Match status & closing",
        a: "A match runs Scheduled → In progress → Completed. Start it when play begins; Cancel is only available before it starts (a match that's underway runs to a result). Entering a final score auto-completes and locks the match so it can't be edited by accident — click Reopen (organizer) if you need to correct it.",
      },
    ],
  },
  {
    title: "Casual matches (Challenges)",
    items: [
      {
        q: "Challenge someone",
        a: "Challenges tab → New challenge. Singles or doubles (all four players need accounts). No acceptance needed — the match is ready to play as soon as you send it. If the other player can't play, they can Reject it, which cancels the match.",
      },
      {
        q: "Agreeing on the result",
        a: "After a match, either side enters the score; the OTHER side confirms (or rejects to redo). Once both agree it's final. Casual matches never count toward rankings or stats.",
      },
    ],
  },
  {
    title: "Leaderboard",
    items: [
      {
        q: "Global ranking",
        a: "The Leaderboard page ranks every player across all workspaces using International scoring — 10 points per win, 2 per loss (knockout-stage bonuses are tournament-only and don't apply here).",
      },
      {
        q: "Per-tournament & per-group",
        a: "Each tournament has its own Leaderboard tab, scored by the system chosen in Settings (League by default). If you used Groups when generating fixtures, it shows a separate ranked table per group.",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div>
      <PageHeader title="How Smash works" subtitle="A quick reference for the main features and where to find them." />
      <div className="space-y-6">
        {SECTIONS.map((s) => (
          <Card key={s.title} className="overflow-hidden">
            <CardHeader title={s.title} />
            <dl className="divide-y divide-[var(--border)]">
              {s.items.map((it) => (
                <div key={it.q} className="px-5 py-4">
                  <dt className="text-sm font-semibold text-foreground">{it.q}</dt>
                  <dd className="mt-1 text-sm text-muted">{it.a}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}

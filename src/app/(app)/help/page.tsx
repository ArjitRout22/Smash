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
        a: "Add players you manage via Players → Add player (no login needed — you register them and enter their scores). People who sign up get an account and can do more (accept challenges/invites, be nominated to score, join teams across workspaces, play casual matches).",
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
    title: "Fixtures, stages & brackets",
    items: [
      {
        q: "Generate fixtures (round-robin / groups)",
        a: "Stages tab → Generate fixtures. Choose “All play all” (everyone plays everyone) or “Groups (cross-play)” (assign teams to Group A/B/… and only cross-group matches are created). Pick once or twice (double round-robin). E.g. 2 groups of 3, twice = 18 matches.",
      },
      {
        q: "Generate bracket (knockout)",
        a: "Stages tab → Generate bracket builds a single-elimination knockout from the participants you pick (seeded, byes for odd counts). Winners auto-advance.",
      },
      {
        q: "Group → knockout",
        a: "Play the group fixtures, read the per-group standings on the Leaderboard tab, then Generate bracket with the qualifiers you want to advance (e.g. top 2 of each group) into the semifinals/final.",
      },
    ],
  },
  {
    title: "Scoring",
    items: [
      {
        q: "Who can enter scores",
        a: "Only the tournament's organizer — plus anyone they nominate. Add nominated scorers in the tournament's Settings tab → Scorers. Everyone else is view-only.",
      },
      {
        q: "Match status & closing",
        a: "A match runs Scheduled → In progress → Completed. Use Start / Cancel on the Matches tab. Entering a final score auto-completes and locks the match so it can't be edited by accident — click Reopen (organizer) if you need to correct it.",
      },
    ],
  },
  {
    title: "Casual matches (Challenges)",
    items: [
      {
        q: "Challenge someone",
        a: "Challenges tab → New challenge. Singles or doubles (all four players need accounts). The person you challenge must accept before any score can be entered.",
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
        a: "The Leaderboard page ranks every player across all workspaces — a flat 10 points per win, 0 per loss.",
      },
      {
        q: "Per-tournament & per-group",
        a: "Each tournament has its own Leaderboard tab. If you used Groups when generating fixtures, it shows a separate ranked table per group.",
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

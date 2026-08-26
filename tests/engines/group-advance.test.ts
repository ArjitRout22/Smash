import { describe, it, expect } from "vitest";
import { selectQualifiers, type GroupInput, type GroupMatchResult } from "@/lib/engines/group-advance";

// Helper: a 2–0 win for `winner` over `loser`, 21-10 each game.
function win(winner: string, loser: string): GroupMatchResult {
  return { aId: winner, bId: loser, aGames: 2, bGames: 0, aPoints: 42, bPoints: 20 };
}

describe("selectQualifiers", () => {
  it("takes the top K per group, winners seeded before runners-up", () => {
    const groups: GroupInput[] = [
      { label: "A", entrantIds: ["a1", "a2", "a3"] },
      { label: "B", entrantIds: ["b1", "b2", "b3"] },
    ];
    const results = [win("a1", "a2"), win("a1", "a3"), win("a2", "a3"), win("b1", "b2"), win("b1", "b3"), win("b2", "b3")];
    const plan = selectQualifiers(groups, results, 2);
    // Group winners (a1,b1) first, then runners-up (a2,b2); ties broken by id.
    expect(plan.ordered).toEqual(["a1", "b1", "a2", "b2"]);
    expect(plan.groups.find((g) => g.label === "A")!.ranked.map((r) => r.id)).toEqual(["a1", "a2", "a3"]);
    expect(plan.groups[0].ranked[2].qualified).toBe(false); // a3 didn't qualify
  });

  it("breaks ties by game diff then point diff (a 3-way cycle)", () => {
    const groups: GroupInput[] = [{ label: "A", entrantIds: ["x", "y", "z"] }];
    // x>y and y>z convincingly, z>x narrowly → all 1-1, split on point diff.
    const results: GroupMatchResult[] = [
      { aId: "x", bId: "y", aGames: 2, bGames: 0, aPoints: 42, bPoints: 20 },
      { aId: "y", bId: "z", aGames: 2, bGames: 0, aPoints: 42, bPoints: 20 },
      { aId: "z", bId: "x", aGames: 2, bGames: 1, aPoints: 55, bPoints: 50 },
    ];
    const plan = selectQualifiers(groups, results, 1);
    // x: gameDiff (2-0)+(1-2)=+1; y: (0-2)+(2-0)=0; z: (0-2)+(2-1)=-1 → x wins.
    expect(plan.ordered).toEqual(["x"]);
  });

  it("clamps K to the group size", () => {
    const groups: GroupInput[] = [{ label: "A", entrantIds: ["a1", "a2"] }];
    const plan = selectQualifiers(groups, [win("a1", "a2")], 3);
    expect(plan.ordered).toEqual(["a1", "a2"]); // only 2 exist
  });

  it("auto-qualifies a lone entrant in a 1-player group (no matches)", () => {
    const groups: GroupInput[] = [
      { label: "A", entrantIds: ["solo"] },
      { label: "B", entrantIds: ["b1", "b2"] },
    ];
    const plan = selectQualifiers(groups, [win("b1", "b2")], 1);
    expect(plan.ordered.sort()).toEqual(["b1", "solo"]);
    expect(plan.groups.find((g) => g.label === "A")!.ranked[0].qualified).toBe(true);
  });

  it("handles uneven groups (a 4 and a 2), top 2 each = 4 qualifiers", () => {
    const groups: GroupInput[] = [
      { label: "A", entrantIds: ["a1", "a2", "a3", "a4"] },
      { label: "B", entrantIds: ["b1", "b2"] },
    ];
    const results = [
      win("a1", "a2"), win("a1", "a3"), win("a1", "a4"), win("a2", "a3"), win("a2", "a4"), win("a3", "a4"),
      win("b1", "b2"),
    ];
    const plan = selectQualifiers(groups, results, 2);
    expect(plan.ordered).toEqual(["a1", "b1", "a2", "b2"]);
  });
});

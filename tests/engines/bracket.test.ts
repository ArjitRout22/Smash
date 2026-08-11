import { describe, it, expect } from "vitest";
import {
  nextPowerOfTwo,
  seedOrder,
  nextMatchCoords,
  generateSingleEliminationPlan,
  buildBracket,
} from "@/lib/engines/bracket";

describe("bracket engine", () => {
  it("computes next power of two", () => {
    expect(nextPowerOfTwo(2)).toBe(2);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(8)).toBe(8);
  });

  it("produces a valid seeding order (seed 1 first, paired with the lowest seed)", () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    // property: #1 and #2 land in opposite halves (meet only in the final)
    const s8 = seedOrder(8);
    const half = s8.length / 2;
    expect(s8.slice(0, half)).toContain(1);
    expect(s8.slice(half)).toContain(2);
  });

  it("maps winners to the next round/slot/side", () => {
    expect(nextMatchCoords(1, 0)).toEqual({ round: 2, slot: 0, side: "A" });
    expect(nextMatchCoords(1, 1)).toEqual({ round: 2, slot: 0, side: "B" });
    expect(nextMatchCoords(1, 2)).toEqual({ round: 2, slot: 1, side: "A" });
  });

  it("plans a full 4-player single elimination (SF + F)", () => {
    const plan = generateSingleEliminationPlan(["p1", "p2", "p3", "p4"]);
    expect(plan.rounds).toBe(2);
    const round1 = plan.matches.filter((m) => m.round === 1);
    const round2 = plan.matches.filter((m) => m.round === 2);
    expect(round1).toHaveLength(2);
    expect(round2).toHaveLength(1);
    // top seed vs lowest seed in slot 0
    expect(round1[0].sideA).toEqual({ kind: "participant", ref: "p1" });
    expect(round1[0].sideB).toEqual({ kind: "participant", ref: "p4" });
    // final has no `next`
    expect(round2[0].next).toBeUndefined();
    expect(round2[0].sideA).toEqual({ kind: "winner", fromRound: 1, fromSlot: 0 });
  });

  it("inserts byes for non-power-of-two fields", () => {
    const plan = generateSingleEliminationPlan(["p1", "p2", "p3"]);
    expect(plan.rounds).toBe(2);
    const round1 = plan.matches.filter((m) => m.round === 1);
    // one of the round-1 matches has a bye
    const byes = round1.filter((m) => m.sideA.kind === "bye" || m.sideB.kind === "bye");
    expect(byes.length).toBe(1);
  });

  it("builds a rounds view for visualization", () => {
    const view = buildBracket([
      {
        id: "m1",
        round: 1,
        slot: 0,
        status: "completed",
        winnerSide: "A",
        participants: [
          { side: "A", label: "Alice", gamesWon: 2 },
          { side: "B", label: "Bob", gamesWon: 1 },
        ],
      },
      {
        id: "m2",
        round: 2,
        slot: 0,
        status: "scheduled",
        winnerSide: null,
        participants: [{ side: "A", label: "Alice", gamesWon: 0 }],
      },
    ]);
    expect(view).toHaveLength(2);
    expect(view[0].round).toBe(1);
    expect(view[0].matches[0].sideA?.isWinner).toBe(true);
    expect(view[1].matches[0].sideB).toBeNull();
  });
});

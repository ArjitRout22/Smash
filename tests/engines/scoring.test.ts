import { describe, it, expect } from "vitest";
import {
  completedGameWinner,
  isCompletedGame,
  resolveMatch,
  BWF_RULES,
} from "@/lib/engines/scoring";
import { AppError } from "@/lib/errors";

describe("completedGameWinner (default: first to 21, win by 1)", () => {
  it("awards a 21-x game", () => {
    expect(completedGameWinner(21, 15)).toBe("A");
    expect(completedGameWinner(10, 21)).toBe("B");
    expect(completedGameWinner(21, 19)).toBe("A");
  });

  it("allows a 1-point win (no deuce): 21-20 is valid", () => {
    expect(completedGameWinner(21, 20)).toBe("A");
    expect(completedGameWinner(20, 21)).toBe("B");
    expect(completedGameWinner(21, 0)).toBe("A");
  });

  it("requires the winner to reach EXACTLY 21 (play stops at the target)", () => {
    expect(() => completedGameWinner(22, 20)).toThrow(AppError); // past the target
    expect(() => completedGameWinner(30, 29)).toThrow(AppError); // no cap/deuce anymore
    expect(() => completedGameWinner(5, 3)).toThrow(AppError); // winner < 21
  });

  it("rejects ties and out-of-range values", () => {
    expect(() => completedGameWinner(21, 21)).toThrow(AppError);
    expect(() => completedGameWinner(-1, 21)).toThrow(AppError);
    expect(() => completedGameWinner(22, 10)).toThrow(AppError); // above the target/cap
    expect(() => completedGameWinner(20.5, 10)).toThrow(AppError);
  });

  it("still supports classic BWF (win by 2, cap 30) when those rules are passed", () => {
    expect(completedGameWinner(22, 20, BWF_RULES)).toBe("A"); // deuce
    expect(completedGameWinner(30, 29, BWF_RULES)).toBe("A"); // cap
    expect(() => completedGameWinner(21, 20, BWF_RULES)).toThrow(AppError); // margin 1 illegal under BWF
  });

  it("isCompletedGame is a non-throwing mirror", () => {
    expect(isCompletedGame(21, 15)).toBe(true);
    expect(isCompletedGame(21, 20)).toBe(true); // now valid
    expect(isCompletedGame(22, 20)).toBe(false);
  });
});

describe("resolveMatch — best of 1", () => {
  it("resolves a single decisive game", () => {
    const r = resolveMatch(1, [{ scoreA: 21, scoreB: 12 }]);
    expect(r).toMatchObject({ complete: true, winnerSide: "A", gamesWonA: 1, gamesWonB: 0 });
  });

  it("is incomplete with zero games", () => {
    const r = resolveMatch(1, []);
    expect(r.complete).toBe(false);
    expect(r.winnerSide).toBeNull();
  });

  it("rejects more than one game", () => {
    expect(() =>
      resolveMatch(1, [
        { scoreA: 21, scoreB: 1 },
        { scoreA: 21, scoreB: 2 },
      ])
    ).toThrow(AppError);
  });
});

describe("resolveMatch — best of 3", () => {
  it("resolves a 2-0 sweep", () => {
    const r = resolveMatch(3, [
      { scoreA: 21, scoreB: 17 },
      { scoreA: 21, scoreB: 12 },
    ]);
    expect(r).toMatchObject({ complete: true, winnerSide: "A", gamesWonA: 2, gamesWonB: 0 });
  });

  it("resolves a 2-1 three-gamer (spec example)", () => {
    const r = resolveMatch(3, [
      { scoreA: 21, scoreB: 17 },
      { scoreA: 18, scoreB: 21 },
      { scoreA: 21, scoreB: 15 },
    ]);
    expect(r).toMatchObject({ complete: true, winnerSide: "A", gamesWonA: 2, gamesWonB: 1 });
  });

  it("is incomplete at one game each", () => {
    const r = resolveMatch(3, [
      { scoreA: 21, scoreB: 17 },
      { scoreA: 15, scoreB: 21 },
    ]);
    expect(r.complete).toBe(false);
    expect(r.winnerSide).toBeNull();
  });

  it("rejects a game played after the match was decided (2-0 then a 3rd game)", () => {
    expect(() =>
      resolveMatch(3, [
        { scoreA: 21, scoreB: 5 },
        { scoreA: 21, scoreB: 8 },
        { scoreA: 21, scoreB: 9 },
      ])
    ).toThrow(AppError);
  });

  it("rejects an illegal game inside the match", () => {
    expect(() =>
      resolveMatch(3, [
        { scoreA: 21, scoreB: 17 },
        { scoreA: 22, scoreB: 20 }, // illegal: winner past the 21 target
      ])
    ).toThrow(AppError);
  });

  it("rejects an unknown bestOf", () => {
    expect(() => resolveMatch(5, [])).toThrow(AppError);
  });

  it("supports configurable rules (11-point, win by 2, cap 15)", () => {
    const rules = { pointsToWin: 11, winBy: 2, cap: 15 };
    expect(completedGameWinner(11, 8, rules)).toBe("A");
    expect(() => completedGameWinner(21, 15, rules)).toThrow(AppError); // above cap
    expect(completedGameWinner(15, 14, rules)).toBe("A");
  });
});

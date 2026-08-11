import { describe, it, expect } from "vitest";
import {
  completedGameWinner,
  isCompletedGame,
  resolveMatch,
} from "@/lib/engines/scoring";
import { AppError } from "@/lib/errors";

describe("completedGameWinner", () => {
  it("awards a standard 21-x game", () => {
    expect(completedGameWinner(21, 15)).toBe("A");
    expect(completedGameWinner(10, 21)).toBe("B");
    expect(completedGameWinner(21, 19)).toBe("A");
  });

  it("requires a 2-point margin below the cap (deuce)", () => {
    expect(() => completedGameWinner(21, 20)).toThrow(AppError); // margin 1
    expect(completedGameWinner(22, 20)).toBe("A");
    expect(completedGameWinner(24, 22)).toBe("A");
    expect(() => completedGameWinner(23, 20)).toThrow(AppError); // margin 3 in deuce
  });

  it("honours the hard cap of 30", () => {
    expect(completedGameWinner(30, 29)).toBe("A");
    expect(completedGameWinner(30, 28)).toBe("A");
    expect(() => completedGameWinner(31, 29)).toThrow(AppError); // above cap
    expect(() => completedGameWinner(30, 27)).toThrow(AppError); // impossible loser score
  });

  it("rejects ties and out-of-range values", () => {
    expect(() => completedGameWinner(21, 21)).toThrow(AppError);
    expect(() => completedGameWinner(-1, 21)).toThrow(AppError);
    expect(() => completedGameWinner(5, 3)).toThrow(AppError); // winner < 21
    expect(() => completedGameWinner(20.5, 10)).toThrow(AppError);
  });

  it("isCompletedGame is a non-throwing mirror", () => {
    expect(isCompletedGame(21, 15)).toBe(true);
    expect(isCompletedGame(21, 20)).toBe(false);
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
        { scoreA: 21, scoreB: 20 }, // illegal margin
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

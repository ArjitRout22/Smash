import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { skipTake, type Pagination } from "@/lib/api/pagination";
import { MATCH_TRANSITIONS, type MatchStatus, type Side } from "@/lib/domain/constants";
import { buildBracket, type BracketMatchInput } from "@/lib/engines/bracket";
import type { AuthUser } from "@/lib/auth/authorize";
import { assertOrgAccess, isPlatformAdmin } from "@/lib/auth/tenancy";
import { loadOwnedTournament, loadViewableTournament, assertCanScoreTournament } from "@/lib/services/tournament.service";
import type { CreateMatchSchema, UpdateMatchSchema, GenerateFixturesInput } from "@/lib/validation/schemas";

type CreateInput = z.infer<typeof CreateMatchSchema>;
type UpdateInput = z.infer<typeof UpdateMatchSchema>;
type SideRef = { playerId?: string; teamId?: string };

const participantInclude = {
  player: { select: { id: true, displayName: true, fullName: true } },
  team: {
    select: {
      id: true,
      name: true,
      teamPlayers: { include: { player: { select: { id: true, displayName: true } } } },
    },
  },
} as const;

const matchInclude = {
  tournament: { select: { id: true, name: true, format: true, organizationId: true } },
  stage: { select: { id: true, name: true, type: true, order: true } },
  games: { orderBy: { gameNumber: "asc" as const } },
  participants: { include: participantInclude },
} as const;

function participantLabel(p: {
  player: { displayName: string } | null;
  team: { name: string } | null;
}) {
  return p.team?.name ?? p.player?.displayName ?? "TBD";
}

export function serializeMatch(m: Awaited<ReturnType<typeof getMatchRaw>>) {
  return {
    id: m.id,
    tournament: { id: m.tournament.id, name: m.tournament.name, format: m.tournament.format },
    stage: m.stage,
    matchType: m.matchType,
    bestOf: m.bestOf,
    status: m.status,
    closedAt: m.closedAt,
    isClosed: m.closedAt != null,
    courtNumber: m.courtNumber,
    scheduledAt: m.scheduledAt,
    winnerSide: m.winnerSide,
    liveA: m.liveA,
    liveB: m.liveB,
    round: m.round,
    slot: m.slot,
    version: m.version,
    games: m.games.map((g) => ({ gameNumber: g.gameNumber, scoreA: g.scoreA, scoreB: g.scoreB, winnerSide: g.winnerSide })),
    sides: (["A", "B"] as Side[]).map((side) => {
      const p = m.participants.find((x) => x.side === side);
      return {
        side,
        label: p ? participantLabel(p) : "TBD",
        playerId: p?.playerId ?? null,
        teamId: p?.teamId ?? null,
        isWinner: p?.isWinner ?? false,
        gamesWon: p?.gamesWon ?? 0,
        players: p?.team?.teamPlayers.map((tp) => tp.player) ?? (p?.player ? [p.player] : []),
      };
    }),
  };
}

async function getMatchRaw(id: string) {
  const m = await prisma.match.findFirst({ where: { id, deletedAt: null }, include: matchInclude });
  if (!m) throw Errors.notFound("Match");
  return m;
}

export async function getMatch(actor: AuthUser, id: string) {
  const m = await getMatchRaw(id);
  assertOrgAccess(actor, m.tournament.organizationId);
  return serializeMatch(m);
}

/**
 * Set the cosmetic live running score for an in-progress match (spectator view).
 * Scorer-gated (same rule as saving scores). Does NOT touch the ledger — it's
 * just the current game's tally shown live; the real result is saved separately.
 */
export async function setLiveScore(actor: AuthUser, id: string, a: number, b: number) {
  const m = await getMatchRaw(id);
  const t = await prisma.tournament.findUnique({
    where: { id: m.tournamentId },
    select: { id: true, organizerId: true, createdById: true },
  });
  if (!t) throw Errors.notFound("Tournament");
  await assertCanScoreTournament(actor, t);
  if (m.closedAt) throw Errors.invalidState("This match is closed.");
  const updated = await prisma.match.update({
    where: { id },
    data: {
      liveA: Math.max(0, Math.trunc(a)),
      liveB: Math.max(0, Math.trunc(b)),
      // Starting to score a scheduled match implicitly puts it in progress.
      status: m.status === "scheduled" ? "in_progress" : m.status,
    },
  });
  return serializeMatch({ ...m, ...updated });
}

export async function listMatches(
  actor: AuthUser,
  p: Pagination,
  filters: { tournamentId?: string; stageId?: string; status?: string }
) {
  // Listing a specific tournament's matches is allowed for anyone who may VIEW
  // it (owner, public, or participant); the general list stays workspace-scoped.
  if (filters.tournamentId) {
    await loadViewableTournament(actor, filters.tournamentId);
  }
  const where = {
    deletedAt: null,
    ...(filters.tournamentId
      ? {}
      : isPlatformAdmin(actor)
        ? {}
        : { tournament: { organizationId: actor.organizationId ?? "__no_org__" } }),
    ...(filters.tournamentId ? { tournamentId: filters.tournamentId } : {}),
    ...(filters.stageId ? { stageId: filters.stageId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.match.findMany({
      where,
      ...skipTake(p),
      orderBy: [{ scheduledAt: p.sortDir }, { createdAt: "desc" }],
      include: matchInclude,
    }),
    prisma.match.count({ where }),
  ]);
  return { items: items.map(serializeMatch), total };
}

async function validateSides(opts: {
  tournamentId: string;
  matchType: string;
  sideA?: SideRef;
  sideB?: SideRef;
}) {
  const { tournamentId, matchType, sideA, sideB } = opts;
  const sides = [sideA, sideB].filter(Boolean) as SideRef[];

  for (const s of sides) {
    if (matchType === "singles" && !s.playerId)
      throw Errors.invalidMatchConfig("Singles matches require a player on each side");
    if (matchType === "doubles" && !s.teamId)
      throw Errors.invalidMatchConfig("Doubles matches require a team on each side");
  }

  if (sideA && sideB) {
    if (sideA.playerId && sideA.playerId === sideB.playerId)
      throw Errors.invalidMatchConfig("A player cannot play against themselves");
    if (sideA.teamId && sideA.teamId === sideB.teamId)
      throw Errors.invalidMatchConfig("A team cannot play against itself");

    // No shared player across the two teams.
    if (sideA.teamId && sideB.teamId) {
      const members = await prisma.teamPlayer.findMany({
        where: { teamId: { in: [sideA.teamId, sideB.teamId] } },
        select: { teamId: true, playerId: true },
      });
      const a = new Set(members.filter((m) => m.teamId === sideA.teamId).map((m) => m.playerId));
      const shared = members.some((m) => m.teamId === sideB.teamId && a.has(m.playerId));
      if (shared) throw Errors.invalidMatchConfig("The same player appears on both teams");
    }
  }

  // Eligibility: participants must belong to the tournament.
  for (const s of sides) {
    if (s.playerId) {
      const reg = await prisma.tournamentPlayer.findUnique({
        where: { tournamentId_playerId: { tournamentId, playerId: s.playerId } },
      });
      if (!reg) throw Errors.invalidMatchConfig("Player is not registered in this tournament");
    }
    if (s.teamId) {
      const team = await prisma.team.findFirst({ where: { id: s.teamId, deletedAt: null } });
      if (!team) throw Errors.invalidMatchConfig("Team not found");
      if (team.tournamentId && team.tournamentId !== tournamentId)
        throw Errors.invalidMatchConfig("Team belongs to a different tournament");
      const pending = await prisma.teamPlayer.count({ where: { teamId: s.teamId, status: "invited" } });
      if (pending > 0)
        throw Errors.invalidMatchConfig("This team has a pending invite — all members must accept before it can play");
    }
  }
}

export async function createMatch(input: CreateInput, actor: AuthUser) {
  await loadOwnedTournament(actor, input.tournamentId);

  if (input.stageId) {
    const stage = await prisma.stage.findFirst({ where: { id: input.stageId, tournamentId: input.tournamentId } });
    if (!stage) throw Errors.validation("Stage does not belong to this tournament");
  }

  await validateSides({
    tournamentId: input.tournamentId,
    matchType: input.matchType,
    sideA: input.sideA,
    sideB: input.sideB,
  });

  const participants: { side: Side; playerId?: string; teamId?: string }[] = [];
  if (input.sideA) participants.push({ side: "A", ...input.sideA });
  if (input.sideB) participants.push({ side: "B", ...input.sideB });

  const match = await prisma.match.create({
    data: {
      tournamentId: input.tournamentId,
      stageId: input.stageId,
      matchType: input.matchType,
      bestOf: input.bestOf,
      courtNumber: input.courtNumber,
      scheduledAt: input.scheduledAt,
      round: input.round,
      slot: input.slot,
      createdById: actor.id,
      participants: { create: participants },
    },
    include: matchInclude,
  });
  await audit({ actorUserId: actor.id, action: "match.created", entityType: "Match", entityId: match.id, newValue: { tournamentId: match.tournamentId } });
  return serializeMatch(match);
}

const MAX_FIXTURES = 128;
const GROUP_LABELS = ["A", "B", "C", "D"];

function roundRobinPairs(ids: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
  return pairs;
}
function crossGroupPairs(groups: string[][]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++)
      for (const a of groups[i]) for (const b of groups[j]) pairs.push([a, b]);
  return pairs;
}

/**
 * Bulk-create round-robin fixtures — everyone-plays-everyone, or cross-group
 * only (teams in different groups), single or double (each pairing twice).
 * Optionally wraps them in a new stage. Ids are players (singles) or teams
 * (doubles); all must belong to the tournament.
 */
export async function generateFixtures(tournamentId: string, input: GenerateFixturesInput, actor: AuthUser) {
  await loadOwnedTournament(actor, tournamentId);

  const allIds = input.mode === "groups" ? (input.groups ?? []).flat() : (input.participantIds ?? []);
  if (new Set(allIds).size !== allIds.length) {
    throw Errors.validation("A participant can't appear more than once");
  }
  if (allIds.length < 2) throw Errors.validation("Select at least two participants");

  const pairs = input.mode === "groups" ? crossGroupPairs(input.groups!) : roundRobinPairs(input.participantIds!);
  if (pairs.length === 0) throw Errors.validation("This selection produces no matches");
  const total = pairs.length * input.rounds;
  if (total > MAX_FIXTURES) {
    throw Errors.validation(`That would create ${total} matches — too many at once (max ${MAX_FIXTURES}).`);
  }

  // Validate every participant belongs to the tournament.
  if (input.matchType === "singles") {
    const regs = await prisma.tournamentPlayer.findMany({
      where: { tournamentId, status: "registered", playerId: { in: allIds } },
      select: { playerId: true },
    });
    const regSet = new Set(regs.map((r) => r.playerId));
    if (allIds.some((id) => !regSet.has(id))) {
      throw Errors.invalidMatchConfig("Every selected player must be registered in this tournament");
    }
  } else {
    const teams = await prisma.team.findMany({
      where: { id: { in: allIds }, deletedAt: null },
      select: { id: true, tournamentId: true, teamPlayers: { where: { status: "invited" }, select: { id: true } } },
    });
    const byId = new Map(teams.map((t) => [t.id, t]));
    for (const id of allIds) {
      const t = byId.get(id);
      if (!t) throw Errors.invalidMatchConfig("One of the selected teams doesn't exist");
      if (t.tournamentId && t.tournamentId !== tournamentId)
        throw Errors.invalidMatchConfig("A selected team belongs to a different tournament");
      if (t.teamPlayers.length > 0)
        throw Errors.invalidMatchConfig("A selected team has a pending invite — all members must accept first");
    }
  }

  const ref = (id: string): { playerId?: string; teamId?: string } =>
    input.matchType === "singles" ? { playerId: id } : { teamId: id };

  const created = await prisma.$transaction(
    async (tx) => {
      let stageId: string | null = null;
      if (input.stageName) {
        const maxOrder = await tx.stage.aggregate({ where: { tournamentId }, _max: { order: true } });
        const stage = await tx.stage.create({
          data: {
            tournamentId,
            name: input.stageName,
            type: input.mode === "groups" ? "group" : "round_robin",
            order: (maxOrder._max.order ?? -1) + 1,
            status: "active",
          },
        });
        stageId = stage.id;
      }

      // Record each participant's group so the leaderboard can show per-group
      // standings (A, B, …).
      if (input.mode === "groups") {
        for (let gi = 0; gi < input.groups!.length; gi++) {
          const label = GROUP_LABELS[gi] ?? String(gi + 1);
          const ids = input.groups![gi];
          if (input.matchType === "singles") {
            await tx.tournamentPlayer.updateMany({ where: { tournamentId, playerId: { in: ids } }, data: { group: label } });
          } else {
            await tx.team.updateMany({ where: { id: { in: ids } }, data: { group: label } });
          }
        }
      }

      let n = 0;
      for (const [a, b] of pairs) {
        for (let r = 0; r < input.rounds; r++) {
          const [x, y] = r % 2 === 0 ? [a, b] : [b, a]; // alternate sides on the return leg
          await tx.match.create({
            data: {
              tournamentId,
              stageId,
              matchType: input.matchType,
              bestOf: input.bestOf,
              createdById: actor.id,
              participants: { create: [{ side: "A", ...ref(x) }, { side: "B", ...ref(y) }] },
            },
          });
          n++;
        }
      }
      return n;
    },
    { timeout: 30000 }
  );

  await audit({
    actorUserId: actor.id,
    action: "tournament.fixtures.generated",
    entityType: "Tournament",
    entityId: tournamentId,
    newValue: { mode: input.mode, rounds: input.rounds, matches: created },
  });
  return { created };
}

export async function updateMatch(id: string, input: UpdateInput, actor: AuthUser) {
  const existing = await prisma.match.findFirst({
    where: { id, deletedAt: null },
    include: { participants: true, tournament: { select: { organizationId: true } } },
  });
  if (!existing) throw Errors.notFound("Match");
  assertOrgAccess(actor, existing.tournament.organizationId);

  // Lock handling: a closed (finalized) match rejects every edit except the
  // reopen action itself. Closing requires a completed result.
  const editingFields =
    input.status !== undefined ||
    input.sideA !== undefined ||
    input.sideB !== undefined ||
    input.bestOf !== undefined ||
    input.stageId !== undefined ||
    input.courtNumber !== undefined ||
    input.scheduledAt !== undefined;
  if (existing.closedAt != null && input.closed !== false && editingFields) {
    throw Errors.invalidState("This match is closed. Reopen it before making changes.");
  }
  let closedAt: Date | null | undefined;
  if (input.closed === true) {
    if (existing.status !== "completed")
      throw Errors.invalidState("Only a completed match can be closed.");
    closedAt = existing.closedAt ?? new Date();
  } else if (input.closed === false) {
    closedAt = null;
  }

  if (input.status && input.status !== existing.status) {
    const allowed = MATCH_TRANSITIONS[existing.status as MatchStatus] ?? [];
    if (!allowed.includes(input.status))
      throw Errors.invalidState(`Cannot change match status from "${existing.status}" to "${input.status}"`);
  }

  const changingSides = input.sideA !== undefined || input.sideB !== undefined;
  if (changingSides) {
    if (existing.status === "completed")
      throw Errors.invalidState("Reopen the match before changing participants");
    await validateSides({
      tournamentId: existing.tournamentId,
      matchType: existing.matchType,
      sideA: input.sideA,
      sideB: input.sideB,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (changingSides) {
      for (const side of ["A", "B"] as Side[]) {
        const ref = side === "A" ? input.sideA : input.sideB;
        if (ref === undefined) continue;
        await tx.matchParticipant.deleteMany({ where: { matchId: id, side } });
        await tx.matchParticipant.create({ data: { matchId: id, side, playerId: ref.playerId, teamId: ref.teamId } });
      }
    }
    return tx.match.update({
      where: { id },
      data: {
        stageId: input.stageId === undefined ? undefined : input.stageId,
        courtNumber: input.courtNumber === undefined ? undefined : input.courtNumber,
        scheduledAt: input.scheduledAt === undefined ? undefined : input.scheduledAt,
        status: input.status ?? undefined,
        bestOf: input.bestOf ?? undefined,
        closedAt: closedAt === undefined ? undefined : closedAt,
      },
      include: matchInclude,
    });
  });
  const action = input.closed === true ? "match.closed" : input.closed === false ? "match.reopened" : "match.updated";
  await audit({ actorUserId: actor.id, action, entityType: "Match", entityId: id, previousValue: { status: existing.status, closed: existing.closedAt != null }, newValue: { status: updated.status, closed: updated.closedAt != null } });
  return serializeMatch(updated);
}

export async function softDeleteMatch(id: string, actor: AuthUser) {
  const existing = await prisma.match.findFirst({
    where: { id, deletedAt: null },
    include: { tournament: { select: { organizationId: true } } },
  });
  if (!existing) throw Errors.notFound("Match");
  assertOrgAccess(actor, existing.tournament.organizationId);
  await prisma.match.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ actorUserId: actor.id, action: "match.deleted", entityType: "Match", entityId: id, previousValue: { status: existing.status } });
}

export async function getBracket(actor: AuthUser, tournamentId: string) {
  await loadViewableTournament(actor, tournamentId);
  const matches = await prisma.match.findMany({
    where: { tournamentId, deletedAt: null, round: { not: null } },
    include: { participants: { include: participantInclude } },
    orderBy: [{ round: "asc" }, { slot: "asc" }],
  });
  const input: BracketMatchInput[] = matches.map((m) => ({
    id: m.id,
    round: m.round,
    slot: m.slot,
    status: m.status,
    winnerSide: m.winnerSide,
    participants: m.participants.map((p) => ({
      side: p.side,
      label: participantLabel(p),
      gamesWon: p.gamesWon,
    })),
  }));
  return buildBracket(input);
}

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import {
  generateSingleEliminationPlan,
  type PlannedMatch,
} from "@/lib/engines/bracket";
import type { StageType, Side } from "@/lib/domain/constants";
import type { AuthUser } from "@/lib/auth/authorize";
import { assertOrgAccess } from "@/lib/auth/tenancy";
import { loadOwnedTournament } from "@/lib/services/tournament.service";
import { attachMatchSnapshots } from "@/lib/services/match.service";
import type {
  CreateStageSchema,
  UpdateStageSchema,
  GenerateBracketSchema,
} from "@/lib/validation/schemas";

type CreateInput = z.infer<typeof CreateStageSchema>;
type UpdateInput = z.infer<typeof UpdateStageSchema>;
type GenerateInput = z.infer<typeof GenerateBracketSchema>;

export async function listStages(actor: AuthUser, tournamentId: string) {
  await loadOwnedTournament(actor, tournamentId);
  return prisma.stage.findMany({
    where: { tournamentId },
    orderBy: { order: "asc" },
    include: { _count: { select: { matches: true } } },
  });
}

async function nextOrder(tournamentId: string) {
  const last = await prisma.stage.findFirst({
    where: { tournamentId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? -1) + 1;
}

export async function createStage(tournamentId: string, input: CreateInput, actor: AuthUser) {
  await loadOwnedTournament(actor, tournamentId);
  const stage = await prisma.stage.create({
    data: {
      tournamentId,
      name: input.name,
      type: input.type,
      order: input.order ?? (await nextOrder(tournamentId)),
      config: (input.config ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  await audit({ actorUserId: actor.id, action: "stage.created", entityType: "Stage", entityId: stage.id, newValue: stage });
  return stage;
}

export async function updateStage(id: string, input: UpdateInput, actor: AuthUser) {
  const existing = await prisma.stage.findUnique({
    where: { id },
    include: { tournament: { select: { organizationId: true } } },
  });
  if (!existing) throw Errors.notFound("Stage");
  assertOrgAccess(actor, existing.tournament.organizationId);
  const updated = await prisma.stage.update({
    where: { id },
    data: {
      name: input.name ?? undefined,
      type: input.type ?? undefined,
      order: input.order ?? undefined,
      status: input.status ?? undefined,
      config: input.config === undefined ? undefined : ((input.config ?? undefined) as Prisma.InputJsonValue | undefined),
    },
  });
  await audit({ actorUserId: actor.id, action: "stage.updated", entityType: "Stage", entityId: id, previousValue: existing, newValue: updated });
  return updated;
}

/** Round r of R maps to a human stage type (final, semifinal, …). */
function stageTypeForRound(round: number, totalRounds: number): { type: StageType; name: string } {
  const fromFinal = totalRounds - round; // 0 = final
  const map: Record<number, { type: StageType; name: string }> = {
    0: { type: "final", name: "Final" },
    1: { type: "semifinal", name: "Semifinal" },
    2: { type: "quarterfinal", name: "Quarterfinal" },
    3: { type: "round_of_16", name: "Round of 16" },
    4: { type: "round_of_32", name: "Round of 32" },
  };
  return map[fromFinal] ?? { type: "knockout", name: `Round ${round}` };
}

/**
 * Generate a full single-elimination knockout: one Stage per round, Matches
 * with bracket links, round-1 participants seeded, and byes auto-advanced.
 */
export async function generateBracket(tournamentId: string, input: GenerateInput, actor: AuthUser) {
  const tournament = await loadOwnedTournament(actor, tournamentId);
  const isTeam = tournament.format !== "singles";
  const matchType = isTeam ? "doubles" : "singles";

  // Validate participants exist and belong to this tournament.
  if (isTeam) {
    const teams = await prisma.team.findMany({
      where: { id: { in: input.participantIds }, tournamentId, deletedAt: null },
      select: { id: true },
    });
    if (teams.length !== input.participantIds.length)
      throw Errors.validation("All participants must be teams in this tournament");
  } else {
    const regs = await prisma.tournamentPlayer.findMany({
      where: { tournamentId, playerId: { in: input.participantIds } },
      select: { playerId: true },
    });
    if (regs.length !== input.participantIds.length)
      throw Errors.validation("All participants must be players registered in this tournament");
  }

  const plan = generateSingleEliminationPlan(input.participantIds);
  const baseOrder = await nextOrder(tournamentId);

  return prisma.$transaction(async (tx) => {
    // 1. Create a stage per round.
    const stageByRound = new Map<number, string>();
    for (let round = 1; round <= plan.rounds; round++) {
      const { type, name } = stageTypeForRound(round, plan.rounds);
      const stage = await tx.stage.create({
        data: {
          tournamentId,
          name: plan.rounds === 1 ? input.name : name,
          type,
          order: baseOrder + (round - 1),
          status: round === 1 ? "active" : "pending",
        },
      });
      stageByRound.set(round, stage.id);
    }

    // 2. Create matches (without links yet).
    const idByCoord = new Map<string, string>();
    const key = (r: number, s: number) => `${r}:${s}`;
    for (const pm of plan.matches) {
      const m = await tx.match.create({
        data: {
          tournamentId,
          stageId: stageByRound.get(pm.round)!,
          matchType,
          bestOf: 3,
          status: "scheduled",
          round: pm.round,
          slot: pm.slot,
          createdById: actor.id,
        },
      });
      idByCoord.set(key(pm.round, pm.slot), m.id);
    }

    // 3. Link winners forward + seed round-1 participants.
    const refData = (ref: string) =>
      isTeam ? { teamId: ref } : { playerId: ref };

    for (const pm of plan.matches) {
      const matchId = idByCoord.get(key(pm.round, pm.slot))!;
      if (pm.next) {
        await tx.match.update({
          where: { id: matchId },
          data: {
            nextMatchId: idByCoord.get(key(pm.next.round, pm.next.slot))!,
            nextMatchSlot: pm.next.side,
          },
        });
      }
      for (const side of ["A", "B"] as Side[]) {
        const slot = side === "A" ? pm.sideA : pm.sideB;
        if (slot.kind === "participant") {
          await tx.matchParticipant.create({
            data: { matchId, side, ...refData(slot.ref) },
          });
        }
      }
    }

    // 4. Auto-advance byes (walkovers): a round-1 match with exactly one
    //    participant sends that participant straight to the next round.
    await advanceByes(tx, plan.matches, idByCoord, key, refData);

    // 5. Snapshot the players for every doubles participant now placed.
    for (const matchId of idByCoord.values()) await attachMatchSnapshots(tx, matchId);

    await audit(
      {
        actorUserId: actor.id,
        action: "stage.bracket.generated",
        entityType: "Tournament",
        entityId: tournamentId,
        newValue: { participants: input.participantIds.length, rounds: plan.rounds },
      },
      tx
    );

    return listStages(actor, tournamentId);
  });
}

async function advanceByes(
  tx: Prisma.TransactionClient,
  planned: PlannedMatch[],
  idByCoord: Map<string, string>,
  key: (r: number, s: number) => string,
  refData: (ref: string) => { teamId: string } | { playerId: string }
) {
  for (const pm of planned) {
    if (pm.round !== 1) continue;
    const aParticipant = pm.sideA.kind === "participant";
    const bParticipant = pm.sideB.kind === "participant";
    if (aParticipant === bParticipant) continue; // both present or both bye

    const winnerRef = (pm.sideA.kind === "participant" ? pm.sideA : pm.sideB) as {
      kind: "participant";
      ref: string;
    };
    const winnerSide: Side = pm.sideA.kind === "participant" ? "A" : "B";
    const matchId = idByCoord.get(key(pm.round, pm.slot))!;

    await tx.match.update({
      where: { id: matchId },
      data: { status: "completed", winnerSide, version: { increment: 1 } },
    });
    await tx.matchParticipant.updateMany({
      where: { matchId, side: winnerSide },
      data: { isWinner: true },
    });
    // Send the walkover winner into the next round slot.
    if (pm.next) {
      const nextId = idByCoord.get(key(pm.next.round, pm.next.slot))!;
      await tx.matchParticipant.create({
        data: { matchId: nextId, side: pm.next.side, ...refData(winnerRef.ref) },
      });
    }
  }
}


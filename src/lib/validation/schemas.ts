import { z } from "zod";
import {
  TOURNAMENT_FORMATS,
  TOURNAMENT_STATUSES,
  TOURNAMENT_VISIBILITIES,
  MATCH_TYPES,
  MATCH_STATUSES,
  STAGE_TYPES,
  GENDERS,
  BEST_OF_OPTIONS,
} from "@/lib/domain/constants";
import { PointsConfigSchema } from "@/lib/engines/points";

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .transform((s) => new Date(s));

// --- Players ----------------------------------------------------------------
export const CreatePlayerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(1).max(60).optional(),
  phone: z.string().trim().max(20).optional(),
  photoUrl: z.string().url().max(500).optional(),
  gender: z.enum(GENDERS).optional(),
  dateOfBirth: isoDate.optional(),
  city: z.string().trim().max(120).optional(),
});
export const UpdatePlayerSchema = CreatePlayerSchema.partial();

// --- Tournaments ------------------------------------------------------------
export const CreateTournamentSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(2000).optional(),
    location: z.string().trim().max(200).optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    format: z.enum(TOURNAMENT_FORMATS).default("singles"),
    visibility: z.enum(TOURNAMENT_VISIBILITIES).default("private"),
    organizerId: z.string().uuid().optional(),
    pointsConfig: PointsConfigSchema.optional(),
  })
  .refine(
    (d) => !d.startDate || !d.endDate || d.endDate >= d.startDate,
    { message: "End date must be on or after the start date", path: ["endDate"] }
  );

export const UpdateTournamentSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  format: z.enum(TOURNAMENT_FORMATS).optional(),
  status: z.enum(TOURNAMENT_STATUSES).optional(),
  visibility: z.enum(TOURNAMENT_VISIBILITIES).optional(),
  organizerId: z.string().uuid().optional(),
  pointsConfig: PointsConfigSchema.nullable().optional(),
});

export const AddTournamentPlayersSchema = z.object({
  playerIds: z.array(z.string().uuid()).min(1).max(256),
});

export const RespondJoinRequestSchema = z.object({
  playerId: z.string().uuid(),
  action: z.enum(["accept", "decline"]),
});

// --- Teams ------------------------------------------------------------------
export const CreateTeamSchema = z.object({
  name: z.string().trim().min(1).max(120),
  teamType: z.enum(["doubles", "mixed"]).default("doubles"),
  tournamentId: z.string().uuid().optional(),
  playerIds: z.array(z.string().uuid()).min(2).max(2),
});
export const UpdateTeamSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  teamType: z.enum(["doubles", "mixed"]).optional(),
  playerIds: z.array(z.string().uuid()).min(2).max(2).optional(),
});

// --- Stages -----------------------------------------------------------------
export const CreateStageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(STAGE_TYPES),
  order: z.number().int().min(0).max(100).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export const UpdateStageSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: z.enum(STAGE_TYPES).optional(),
  order: z.number().int().min(0).max(100).optional(),
  status: z.enum(["pending", "active", "completed"]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

// Generate a single-elimination knockout stage from seeded participants.
export const GenerateBracketSchema = z.object({
  name: z.string().trim().min(1).max(120).default("Knockout"),
  // Ordered by seed. Player ids for singles, team ids for doubles.
  participantIds: z.array(z.string().uuid()).min(2).max(64),
});

// --- Matches ----------------------------------------------------------------
const sideRef = z
  .object({
    playerId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
  })
  .refine((s) => Boolean(s.playerId) !== Boolean(s.teamId), {
    message: "Each side must reference exactly one of playerId or teamId",
  });

export const CreateMatchSchema = z.object({
  tournamentId: z.string().uuid(),
  stageId: z.string().uuid().optional(),
  matchType: z.enum(MATCH_TYPES).default("singles"),
  bestOf: z
    .number()
    .int()
    .refine((n): n is (typeof BEST_OF_OPTIONS)[number] => n === 1 || n === 3, {
      message: "bestOf must be 1 or 3",
    })
    .default(3),
  courtNumber: z.string().trim().max(30).optional(),
  scheduledAt: isoDate.optional(),
  sideA: sideRef.optional(),
  sideB: sideRef.optional(),
  round: z.number().int().min(1).optional(),
  slot: z.number().int().min(0).optional(),
});

export const UpdateMatchSchema = z.object({
  stageId: z.string().uuid().nullable().optional(),
  courtNumber: z.string().trim().max(30).nullable().optional(),
  scheduledAt: isoDate.nullable().optional(),
  status: z.enum(MATCH_STATUSES).optional(),
  bestOf: z
    .number()
    .int()
    .refine((n) => n === 1 || n === 3, { message: "bestOf must be 1 or 3" })
    .optional(),
  sideA: sideRef.optional(),
  sideB: sideRef.optional(),
});

// --- Scores -----------------------------------------------------------------
export const SubmitScoreSchema = z.object({
  games: z
    .array(
      z.object({
        scoreA: z.number().int().min(0).max(99),
        scoreB: z.number().int().min(0).max(99),
      })
    )
    .min(1)
    .max(3),
  // Optimistic concurrency: the version the client last saw.
  expectedVersion: z.number().int().min(0).optional(),
  // Reason is recorded in the audit log for corrections.
  reason: z.string().trim().max(300).optional(),
});

// --- Casual (individual) matches -------------------------------------------
const casualGameScore = z.object({
  scoreA: z.number().int().min(0).max(99),
  scoreB: z.number().int().min(0).max(99),
});

export const CreateCasualMatchSchema = z.object({
  opponentPlayerId: z.string().uuid(),
  bestOf: z
    .number()
    .int()
    .refine((n) => n === 1 || n === 3, { message: "bestOf must be 1 or 3" })
    .default(3),
  scheduledAt: isoDate.optional(),
  location: z.string().trim().max(120).optional(),
});

// State transitions the two participants can drive (see casual-match.service).
export const CasualMatchActionSchema = z.object({
  action: z.enum(["accept", "decline", "confirm", "reject", "cancel", "reopen"]),
  expectedVersion: z.number().int().min(0).optional(),
});

export const ReportCasualScoreSchema = z.object({
  games: z.array(casualGameScore).min(1).max(3),
  expectedVersion: z.number().int().min(0).optional(),
});

export type CreateCasualMatchInput = z.infer<typeof CreateCasualMatchSchema>;
export type CasualMatchActionInput = z.infer<typeof CasualMatchActionSchema>;
export type ReportCasualScoreInput = z.infer<typeof ReportCasualScoreSchema>;

export type CreatePlayerInput = z.infer<typeof CreatePlayerSchema>;
export type CreateTournamentInput = z.infer<typeof CreateTournamentSchema>;
export type CreateTeamInput = z.infer<typeof CreateTeamSchema>;
export type CreateMatchInput = z.infer<typeof CreateMatchSchema>;
export type SubmitScoreInput = z.infer<typeof SubmitScoreSchema>;

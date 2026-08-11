/**
 * Domain vocabularies. Stored as strings in the DB (see schema notes) and
 * validated here so new values can be added without a destructive migration.
 */

export const ROLES = ["ADMIN", "ORGANIZER", "PLAYER"] as const;
export type RoleName = (typeof ROLES)[number];

export const TOURNAMENT_STATUSES = [
  "draft",
  "upcoming",
  "ongoing",
  "completed",
  "cancelled",
] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

// Allowed status transitions for a tournament (state machine).
export const TOURNAMENT_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ["upcoming", "ongoing", "cancelled"],
  upcoming: ["ongoing", "cancelled"],
  ongoing: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const TOURNAMENT_FORMATS = ["singles", "doubles", "mixed"] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];

export const TOURNAMENT_VISIBILITIES = ["private", "public"] as const;
export type TournamentVisibility = (typeof TOURNAMENT_VISIBILITIES)[number];

// TournamentPlayer.status lifecycle:
//  registered — active participant
//  requested  — player asked to join a public tournament (awaits organizer)
//  invited    — organizer invited a player (awaits player accept) [Phase 4]
//  declined   — organizer declined a request / player declined an invite
//  withdrawn  — player left
//  removed    — organizer removed the participant
export const TOURNAMENT_PLAYER_STATUSES = [
  "registered",
  "requested",
  "invited",
  "declined",
  "withdrawn",
  "removed",
] as const;
export type TournamentPlayerStatus = (typeof TOURNAMENT_PLAYER_STATUSES)[number];

export const MATCH_TYPES = ["singles", "doubles"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const MATCH_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  scheduled: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled", "scheduled"],
  completed: ["in_progress"], // allow re-opening for score correction
  cancelled: ["scheduled"],
};

// Casual (individual) match lifecycle — matches OUTSIDE any tournament.
//  pending               — challenge sent, awaiting the opponent
//  accepted              — opponent accepted; the match can be played + scored
//  awaiting_confirmation — one player reported a result; the OTHER must confirm
//  completed             — both players agreed on the result (locked)
//  declined              — opponent declined the challenge (terminal)
//  cancelled             — either player called it off before completion
export const CASUAL_MATCH_STATUSES = [
  "pending",
  "accepted",
  "awaiting_confirmation",
  "completed",
  "declined",
  "cancelled",
] as const;
export type CasualMatchStatus = (typeof CASUAL_MATCH_STATUSES)[number];

export const STAGE_TYPES = [
  "group",
  "round_robin",
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "final",
  "third_place",
  "qualifier",
  "knockout",
  "custom",
] as const;
export type StageType = (typeof STAGE_TYPES)[number];

export const KNOCKOUT_STAGE_TYPES: StageType[] = [
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "final",
  "third_place",
  "knockout",
];

export const STAGE_STATUSES = ["pending", "active", "completed"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const SIDES = ["A", "B"] as const;
export type Side = (typeof SIDES)[number];

export const BEST_OF_OPTIONS = [1, 3] as const;
export type BestOf = (typeof BEST_OF_OPTIONS)[number];

export const POINT_TX_TYPES = [
  "match_win",
  "match_loss",
  "participation",
  "stage_win",
  "title",
  "adjustment",
  "reversal",
] as const;
export type PointTxType = (typeof POINT_TX_TYPES)[number];

export const GENDERS = ["male", "female", "other"] as const;
export type Gender = (typeof GENDERS)[number];

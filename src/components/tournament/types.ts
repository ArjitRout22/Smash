export type TournamentDetail = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  format: string;
  visibility: string;
  canManage?: boolean;
  organizer: { id: string; name: string | null; phone: string } | null;
  stages: { id: string; name: string; type: string; order: number; status: string }[];
  _count: { tournamentPlayers: number; teams: number; matches: number; stages: number };
};

export type MatchSide = {
  side: string;
  label: string;
  playerId: string | null;
  teamId: string | null;
  isWinner: boolean;
  gamesWon: number;
  players: { id: string; displayName: string }[];
};

export type MatchDTO = {
  id: string;
  tournament: { id: string; name: string; format: string };
  stage: { id: string; name: string; type: string; order: number } | null;
  matchType: string;
  bestOf: number;
  status: string;
  closedAt: string | null;
  isClosed: boolean;
  courtNumber: string | null;
  scheduledAt: string | null;
  winnerSide: string | null;
  round: number | null;
  slot: number | null;
  version: number;
  games: { gameNumber: number; scoreA: number; scoreB: number; winnerSide: string | null }[];
  sides: MatchSide[];
};

export type TournamentPlayerDTO = {
  id: string;
  seed: number | null;
  status: string;
  player: {
    id: string;
    displayName: string;
    fullName: string;
    ranking: { totalPoints: number; wins: number; losses: number } | null;
  };
};

export type TeamDTO = {
  id: string;
  name: string;
  teamType: string;
  tournament: { id: string; name: string } | null;
  teamPlayers: { player: { id: string; displayName: string } }[];
};

export type StageDTO = {
  id: string;
  name: string;
  type: string;
  order: number;
  status: string;
  _count: { matches: number };
};

export type LeaderboardRow = {
  rank: number | null;
  position: number | null;
  stageReached: string | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  points: number;
  entity: { type: "player" | "team"; id: string; name: string } | null;
};

export type BracketRound = {
  round: number;
  matches: {
    id: string;
    round: number;
    slot: number;
    status: string;
    sideA: { label: string; score: number | null; isWinner: boolean } | null;
    sideB: { label: string; score: number | null; isWinner: boolean } | null;
  }[];
};

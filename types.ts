
export enum GameStatus {
  SETUP = 'SETUP',
  WEIGHING_INITIAL = 'WEIGHING_INITIAL',
  SETTING_TARGET = 'SETTING_TARGET',
  DRINKING = 'DRINKING',
  WEIGHING_FINAL = 'WEIGHING_FINAL',
  ROUND_SUMMARY = 'ROUND_SUMMARY',
  ROUND_RESULT = 'ROUND_RESULT',
  FINISHED = 'FINISHED'
}


export interface Reaction {
  id: string;
  emoji: string;
  targetPlayerId: string;
  timestamp: number;
}

export interface Player {
  id: string;
  name: string;
  weights: number[];
  deviations: number[];
  penalties: number;
  userId?: string; // ID des Browsers für Presence
}

export interface Round {
  roundNumber: number;
  targetWeight: number;
  chooserPlayerId: string;
  initialWeights: Record<string, number>;
  finalWeights: Record<string, number>;
  penaltyTargetId?: string;
}

export type BottleSize = '0.33' | '0.5' | '1.0';

export interface Game {
  id: string;
  gameCode: string;
  hostId: string; // Neue Spalte
  createdAt: number;
  isFinished: boolean;
  status: GameStatus;
  players: Player[];
  rounds: Round[];
  currentRoundIndex: number;
  bottleSize: BottleSize;
  reactions?: Reaction[];
  pendingInitialWeights?: Record<string, number>;
  mode?: 'host' | 'peer';
}

export interface GameRepository {
  saveGame(game: Game): void;
  loadGame(code?: string): Promise<Game | null>;
  deleteGame(): void;
}

export type PerformanceTag = {
  label: string;
  icon: string;
  description: string;
};

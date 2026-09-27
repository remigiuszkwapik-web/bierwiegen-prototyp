
export enum GameStatus {
  SETUP = 'SETUP',
  WEIGHING_INITIAL = 'WEIGHING_INITIAL',
  SETTING_TARGET = 'SETTING_TARGET',
  DRINKING = 'DRINKING',
  WEIGHING_FINAL = 'WEIGHING_FINAL',
  ROUND_RESULT = 'ROUND_RESULT',
  FINISHED = 'FINISHED'
}


export interface Reaction {
  id: string;
  emoji: string;
  targetPlayerId: string;
  timestamp: number;
}

/** Visueller "Hey, du bist dran"-Hinweis an einen Spieler (per Broadcast, nicht gespeichert). */
export interface Ping {
  targetPlayerId: string;
  fromName: string;
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
  /** Spieler, die beim Endwiegen dieser Runde "Fast leer" gemeldet haben. */
  almostEmpty?: Record<string, boolean>;
  /** Diese Runde war als letzte angekündigt – danach kommt das Finale. */
  isLastRound?: boolean;
  /** Host hat die geschätzte "Letzte Runde" nach dieser Runde weggedrückt. */
  continueDespiteEstimate?: boolean;
}

/**
 * Füllmenge in Litern als Text. '0.33' | '0.5' | '1.0' sind die Voreinstellungen,
 * jeder andere Wert (z. B. '0.3') ist eine eigene Füllmenge. So passt sie weiter
 * in die bestehende Spalte bottle_size.
 */
export type BottleSize = string;
export type PresetBottleSize = '0.33' | '0.5' | '1.0';
export type DrinkType = 'beer' | 'water' | 'cola';

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
  pendingInitialWeights?: Record<string, number>;
  mode?: 'host' | 'peer';
}

export interface GameRepository {
  saveGame(game: Game): Promise<void>;
  loadGame(code?: string): Promise<Game | null>;
  deleteGameFromDB(code: string): Promise<void>;
  deleteGame(): void;
}

export type PerformanceTag = {
  label: string;
  icon: string;
  description: string;
};

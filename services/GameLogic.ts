
import { Player, PerformanceTag, Round, BottleSize, PresetBottleSize, Game } from '../types';
import { PERFORMANCE_TAGS, BOTTLE_SIZES, MIN_DRINK_AMOUNT } from '../constants';

export const calculateAverageDeviation = (deviations: number[]): number => {
  if (deviations.length === 0) return 0;
  const sum = deviations.reduce((acc, val) => acc + val, 0);
  return Number((sum / deviations.length).toFixed(1));
};

export const generateGameCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O, 0, I, 1 to avoid confusion
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const isPresetBottleSize = (bottleSize: BottleSize): bottleSize is PresetBottleSize =>
  bottleSize in BOTTLE_SIZES;

/** Füllmenge in Gramm (Bier ≈ 1 g/ml) – Voreinstellung oder eigene Menge. */
export const getLiquidWeight = (bottleSize: BottleSize): number => {
  if (isPresetBottleSize(bottleSize)) return BOTTLE_SIZES[bottleSize].liquidWeight;
  const liters = parseFloat(bottleSize);
  return Number.isFinite(liters) && liters > 0 ? Math.round(liters * 1000) : BOTTLE_SIZES['0.5'].liquidWeight;
};

/** Obergrenze für eingegebene Gewichte (Gefäß + Inhalt). */
export const getMaxWeight = (bottleSize: BottleSize): number =>
  isPresetBottleSize(bottleSize) ? BOTTLE_SIZES[bottleSize].maxWeight : getLiquidWeight(bottleSize) + 1500;

/**
 * Geschätzter Restinhalt eines Spielers in Gramm – bezogen auf sein eigenes
 * Startgewicht, das Gefäßgewicht kürzt sich heraus. Nur eine Schätzung: die
 * Füllmenge ist ein Nennwert.
 */
export const getRemainingLiquid = (player: Player, bottleSize: BottleSize): number | null => {
  const first = player.weights[0];
  const last = player.weights[player.weights.length - 1];
  if (typeof first !== 'number' || typeof last !== 'number') return null;
  return getLiquidWeight(bottleSize) - (first - last);
};

/** Füllstand der Flasche: 1 = voll, 0 = leer */
export const getDrinkingProgress = (currentWeight: number, firstWeight: number, bottleSize: BottleSize): number => {
  if (firstWeight <= 0) return 1;
  const drunk = firstWeight - currentWeight;
  const drunkRatio = drunk / getLiquidWeight(bottleSize);
  const fillLevel = 1 - Math.min(Math.max(drunkRatio, 0), 1);
  return fillLevel;
};

/**
 * Reicht der geschätzte Inhalt nur noch für ungefähr eine Runde?
 * Das Ziel richtet sich nach dem leichtesten Spieler; wer schwerer ist, muss
 * den Abstand zusätzlich trinken. Nach der nächsten Runde müsste bei jedem
 * noch ein Mindestschluck übrig sein – sonst ist die nächste die letzte.
 */
export const isLastRoundByEstimate = (players: Player[], bottleSize: BottleSize): boolean => {
  const lasts = players.map(p => p.weights[p.weights.length - 1]).filter((w): w is number => typeof w === 'number');
  if (lasts.length === 0) return false;
  const minWeight = Math.min(...lasts);
  return players.some(p => {
    const remaining = getRemainingLiquid(p, bottleSize);
    const last = p.weights[p.weights.length - 1];
    if (remaining === null || typeof last !== 'number') return false;
    return remaining < (last - minWeight) + 2 * MIN_DRINK_AMOUNT;
  });
};

export type LastRoundReason = 'extra' | 'player' | 'estimate';

/**
 * Warum die als nächstes startende Runde die letzte ist – oder null.
 * - extra:    Host hat im Finale noch eine Runde angehängt
 * - player:   jemand hat beim letzten Wiegen "Fast leer" gemeldet
 * - estimate: laut Schätzung reicht der Inhalt nur noch für eine Runde
 *             (der Host kann das mit "Weiterspielen" wegdrücken)
 */
export const getLastRoundReason = (game: Game): LastRoundReason | null => {
  const prev = game.rounds[game.rounds.length - 1];
  if (!prev) return null;
  if (prev.isLastRound) return 'extra';
  if (game.players.some(p => prev.almostEmpty?.[p.id])) return 'player';
  if (!prev.continueDespiteEstimate && isLastRoundByEstimate(game.players, game.bottleSize)) return 'estimate';
  return null;
};

/**
 * Leistungs-Abzeichen eines Spielers.
 *
 * Reihenfolge ist bewusst: Genauigkeit schlaegt alles andere. Zuvor wurde
 * SAINT ("keine Strafe") ganz oben geprueft – praezise Spieler kassieren aber
 * selten Strafen, wodurch die Genauigkeits-Tags praktisch nie vergeben wurden.
 * SAINT und JINX sind jetzt die Auffang-Abzeichen fuer unauffaellige Werte.
 */
export const getPlayerPerformanceTag = (player: Player, allPlayers: Player[], rounds: Round[]): PerformanceTag => {
  // Zu wenig Daten: alles andere waere geraten.
  if (player.deviations.length < 2) return PERFORMANCE_TAGS.NOVICE;

  const avg = calculateAverageDeviation(player.deviations);
  const spread = Math.max(...player.deviations) - Math.min(...player.deviations);

  // 1. Genauigkeit – die eigentliche Disziplin des Spiels.
  if (avg <= 5) return PERFORMANCE_TAGS.ORAL_SCALE;
  if (avg <= 10) return PERFORMANCE_TAGS.PRECISION;

  // 2. Stark schwankend, unabhaengig vom Mittelwert.
  if (spread > 20) return PERFORMANCE_TAGS.UNPREDICTABLE;

  if (avg <= 15) return PERFORMANCE_TAGS.CALCULATOR;

  // 3. Wer regelmaessig deutlich ueber das Ziel hinaustrinkt.
  const lastRound = rounds[rounds.length - 1];
  if (lastRound) {
    const lastFinalWeight = player.weights[player.weights.length - 1];
    if (lastFinalWeight !== undefined && lastFinalWeight < lastRound.targetWeight - 15) {
      return PERFORMANCE_TAGS.RISK_TAKER;
    }
  }

  // 4. Strafen-Abzeichen als Auffang.
  const maxPenalties = Math.max(...allPlayers.map(p => p.penalties));
  if (player.penalties === maxPenalties && maxPenalties > 0 && allPlayers.length > 1) {
    const othersWithMax = allPlayers.filter(p => p.penalties === maxPenalties).length;
    if (othersWithMax === 1) return PERFORMANCE_TAGS.JINX;
  }
  if (player.penalties === 0) return PERFORMANCE_TAGS.SAINT;

  return PERFORMANCE_TAGS.NOVICE;
};

/** Wie viele Runden hat ein Spieler gewonnen (= niedrigste Abweichung) */
export const getRoundWins = (playerId: string, players: Player[], rounds: Round[]): number => {
  return rounds.filter(r => {
    const roundIndex = r.roundNumber - 1;
    const playersWithDev = players.filter(p => p.deviations[roundIndex] !== undefined);
    if (playersWithDev.length === 0) return false;
    const minDev = Math.min(...playersWithDev.map(p => p.deviations[roundIndex]));
    return playersWithDev.filter(p => p.deviations[roundIndex] === minDev).some(p => p.id === playerId);
  }).length;
};

/** Wie viele Strafen hat ein Spieler verteilt (= Rundensiege mit Strafvergabe) */
export const getPenaltiesGiven = (playerId: string, players: Player[], rounds: Round[]): number => {
  return rounds.filter(r => {
    if (!r.penaltyTargetId) return false;
    const roundIndex = r.roundNumber - 1;
    const playersWithDev = players.filter(p => p.deviations[roundIndex] !== undefined);
    if (playersWithDev.length === 0) return false;
    const minDev = Math.min(...playersWithDev.map(p => p.deviations[roundIndex]));
    const winner = playersWithDev.find(p => p.deviations[roundIndex] === minDev);
    return winner?.id === playerId;
  }).length;
};

/** Verbesserungstrend: Hat sich der Durchschnitt durch die letzte Runde verbessert? */
export const getDeviationTrend = (deviations: number[]): { label: string; color: string } => {
  if (deviations.length < 2) return { label: '—', color: 'text-slate-500' };
  const prevAvg = calculateAverageDeviation(deviations.slice(0, -1));
  const currAvg = calculateAverageDeviation(deviations);
  if (currAvg < prevAvg) return { label: '↑', color: 'text-green-400' };
  if (currAvg > prevAvg) return { label: '↓', color: 'text-red-400' };
  return { label: '→', color: 'text-slate-400' };
};


import { Player, PerformanceTag, Round, BottleSize } from '../types';
import { PERFORMANCE_TAGS, BOTTLE_SIZES } from '../constants';

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

/** Füllstand der Flasche: 1 = voll, 0 = leer */
export const getDrinkingProgress = (currentWeight: number, firstWeight: number, bottleSize: BottleSize): number => {
  if (firstWeight <= 0) return 1;
  const { liquidWeight } = BOTTLE_SIZES[bottleSize];
  const drunk = firstWeight - currentWeight;
  const drunkRatio = drunk / liquidWeight;
  const fillLevel = 1 - Math.min(Math.max(drunkRatio, 0), 1);
  return fillLevel;
};

export const getPlayerPerformanceTag = (player: Player, allPlayers: Player[], rounds: Round[]): PerformanceTag => {
  const avg = calculateAverageDeviation(player.deviations);
  if (player.penalties === 0 && player.deviations.length > 1) {
    return PERFORMANCE_TAGS.SAINT;
  }
  const maxPenalties = Math.max(...allPlayers.map(p => p.penalties));
  if (player.penalties === maxPenalties && maxPenalties > 0 && allPlayers.length > 1) {
    const othersWithMax = allPlayers.filter(p => p.penalties === maxPenalties).length;
    if (othersWithMax === 1) return PERFORMANCE_TAGS.JINX;
  }
  if (player.deviations.length < 2) return PERFORMANCE_TAGS.NOVICE;
  const lastRound = rounds[rounds.length - 1];
  if (lastRound) {
    const lastFinalWeight = player.weights[player.weights.length - 1];
    if (lastFinalWeight !== undefined && lastFinalWeight < lastRound.targetWeight - 15) {
      return PERFORMANCE_TAGS.RISK_TAKER;
    }
  }
  const spread = Math.max(...player.deviations) - Math.min(...player.deviations);
  if (avg <= 3) return PERFORMANCE_TAGS.ORAL_SCALE;
  if (avg <= 8) return PERFORMANCE_TAGS.PRECISION;
  if (avg <= 15) return PERFORMANCE_TAGS.CALCULATOR;
  if (avg > 20) return PERFORMANCE_TAGS.NOVICE;
  if (spread > 20) return PERFORMANCE_TAGS.UNPREDICTABLE;
  return PERFORMANCE_TAGS.NOVICE;
};

export const canStartNextRound = (minWeight: number): boolean => {
  return minWeight >= 280;
};

/** Wie viele Runden hat ein Spieler gewonnen (= niedrigste Abweichung) */
export const getRoundWins = (playerId: string, players: Player[], rounds: Round[]): number => {
  return rounds.filter(r => {
    const roundIndex = r.roundNumber - 1;
    const playersWithDev = players.filter(p => p.deviations[roundIndex] !== undefined);
    if (playersWithDev.length === 0) return false;
    const minDev = Math.min(...playersWithDev.map(p => p.deviations[roundIndex]));
    return playersWithDev.find(p => p.deviations[roundIndex] === minDev)?.id === playerId;
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

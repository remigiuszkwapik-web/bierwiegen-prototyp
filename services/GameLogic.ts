
import { Player, PerformanceTag } from '../types';
import { PERFORMANCE_TAGS } from '../constants';

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

export const getBottleType = (initialWeight: number): { label: string, liquidWeight: number } => {
  if (initialWeight > 720) {
    return { label: '0.5l', liquidWeight: 500 };
  }
  return { label: '0.33l', liquidWeight: 330 };
};

/** Füllstand der Flasche: 1 = voll, 0 = leer */
export const getDrinkingProgress = (currentWeight: number, firstWeight: number): number => {
  if (firstWeight <= 0) return 1;
  const { liquidWeight } = getBottleType(firstWeight);
  const drunk = firstWeight - currentWeight;
  const drunkRatio = drunk / liquidWeight;
  const fillLevel = 1 - Math.min(Math.max(drunkRatio, 0), 1);
  return fillLevel;
};

export const getPlayerPerformanceTag = (player: Player, allPlayers: Player[]): PerformanceTag => {
  if (player.penalties === 0 && player.deviations.length > 1) {
    return PERFORMANCE_TAGS.SAINT;
  }
  const maxPenalties = Math.max(...allPlayers.map(p => p.penalties));
  if (player.penalties === maxPenalties && maxPenalties > 0 && allPlayers.length > 1) {
    const othersWithMax = allPlayers.filter(p => p.penalties === maxPenalties).length;
    if (othersWithMax === 1) return PERFORMANCE_TAGS.JINX;
  }
  const avg = calculateAverageDeviation(player.deviations);
  if (player.deviations.length < 2) return PERFORMANCE_TAGS.NOVICE;
  if (avg <= 8) return PERFORMANCE_TAGS.PRECISION;
  if (avg <= 15) return PERFORMANCE_TAGS.CALCULATOR;
  if (avg > 30) return PERFORMANCE_TAGS.RISK_TAKER;
  return PERFORMANCE_TAGS.NOVICE;
};

export const canStartNextRound = (minWeight: number): boolean => {
  return minWeight >= 280; 
};


import { PerformanceTag } from './types';

export const BOTTLE_SIZES = {
  '0.33': { label: '0,33L (Kleines)', maxWeight: 700,  liquidWeight: 330,  finishedThreshold: 150 },
  '0.5':  { label: '0,5L (Großes)',   maxWeight: 1000, liquidWeight: 500,  finishedThreshold: 200 },
  '1.0':  { label: '1,0L (Maß)',      maxWeight: 1600, liquidWeight: 1000, finishedThreshold: 350 },
} as const;

export const PERFORMANCE_TAGS: Record<string, PerformanceTag> = {
  ORAL_SCALE: {
    label: 'Orale Waage',
    icon: '👄',
    description: 'Höchstens 5g Abweichung. Erschreckend präzise.'
  },
  PRECISION: {
    label: 'Champions League',
    icon: '🎯',
    description: 'Höchstens 10g Abweichung. Sehr konstant.'
  },
  UNPREDICTABLE: {
    label: 'Unberechenbar',
    icon: '🎲',
    description: 'Starke Schwankungen in der Performance.'
  },
  RISK_TAKER: {
    label: 'Risiko-Trinker',
    icon: '🍻',
    description: 'Häufig große Abweichungen, liebt das Limit.'
  },
  CALCULATOR: {
    label: 'Der Rechner',
    icon: '🧮',
    description: 'Höchstens 15g Abweichung. Solide am Ziel.'
  },
  NOVICE: {
    label: 'Lehrling',
    icon: '👶',
    description: 'Noch am Üben, die Waage zu verstehen.'
  },
  JINX: {
    label: 'Pechvogel',
    icon: '💀',
    description: 'Hat die meisten Strafen kassiert.'
  },
  SAINT: {
    label: 'Der Heilige',
    icon: '😇',
    description: 'Keine einzige Strafe erhalten.'
  }
};

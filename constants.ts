
import { PerformanceTag } from './types';

export const MIN_DRINK_DIFF = 30;
export const MAX_DRINK_DIFF = 100;
export const MAX_DRINK_RANGE = 500;

export const BOTTLE_SIZES = {
  '0.33': { label: '0,33L (Kleines)', maxWeight: 700,  liquidWeight: 330,  finishedThreshold: 150 },
  '0.5':  { label: '0,5L (Großes)',   maxWeight: 1000, liquidWeight: 500,  finishedThreshold: 200 },
  '1.0':  { label: '1,0L (Maß)',      maxWeight: 1600, liquidWeight: 1000, finishedThreshold: 350 },
} as const;

export const PERFORMANCE_TAGS: Record<string, PerformanceTag> = {
  ORAL_SCALE: {
    label: 'Orale Waage',
    icon: '👄',
    description: 'Unter 5g Abweichung. Erschreckend präzise.'
  },
  PRECISION: {
    label: 'Champions League',
    icon: '🎯',
    description: 'Sehr konstante, geringe Abweichungen.'
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
    description: 'Konstant nahe am Ziel, fast schon unheimlich.'
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

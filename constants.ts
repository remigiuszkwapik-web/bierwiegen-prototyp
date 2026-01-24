
import { PerformanceTag } from './types';

export const MIN_DRINK_DIFF = 30;
export const MAX_DRINK_DIFF = 100;
export const MAX_DRINK_RANGE = 500;

export const PERFORMANCE_TAGS: Record<string, PerformanceTag> = {
  PRECISION: {
    label: 'Präzisionsmonster',
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

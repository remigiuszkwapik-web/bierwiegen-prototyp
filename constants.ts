
import { DrinkType, PerformanceTag } from './types';

export const DRINK_THEMES: Record<DrinkType, { label: string; emoji: string; hex: string; hexHover: string; hexShadow: string; hexAlpha10: string; hexAlpha20: string; hexAlpha30: string }> = {
  beer:  { label: 'Bier',   emoji: '🍺', hex: '#f59e0b', hexHover: '#fbbf24', hexShadow: 'rgba(245,158,11,0.25)', hexAlpha10: 'rgba(245,158,11,0.10)', hexAlpha20: 'rgba(245,158,11,0.20)', hexAlpha30: 'rgba(245,158,11,0.30)' },
  water: { label: 'Wasser', emoji: '💧', hex: '#38bdf8', hexHover: '#7dd3fc', hexShadow: 'rgba(56,189,248,0.25)',  hexAlpha10: 'rgba(56,189,248,0.10)',  hexAlpha20: 'rgba(56,189,248,0.20)',  hexAlpha30: 'rgba(56,189,248,0.30)'  },
  cola:  { label: 'Cola',   emoji: '🥤', hex: '#d4883c', hexHover: '#e09a50', hexShadow: 'rgba(212,136,60,0.25)',  hexAlpha10: 'rgba(212,136,60,0.10)',  hexAlpha20: 'rgba(212,136,60,0.20)',  hexAlpha30: 'rgba(212,136,60,0.30)'  },
  fanta: { label: 'Fanta',  emoji: '🍊', hex: '#f97316', hexHover: '#fb923c', hexShadow: 'rgba(249,115,22,0.25)',  hexAlpha10: 'rgba(249,115,22,0.10)',  hexAlpha20: 'rgba(249,115,22,0.20)',  hexAlpha30: 'rgba(249,115,22,0.30)'  }, // reserved
};

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

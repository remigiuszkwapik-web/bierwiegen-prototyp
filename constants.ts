
import { DrinkType, PerformanceTag } from './types';

/**
 * Farbschema pro Getränk. Die Werte sind RGB-Tripel, weil sie als CSS-Variablen
 * (--ac-400 / --ac-500) in die Tailwind-Farben amber-400/-500 eingesetzt werden –
 * so funktionieren auch Transparenz-Klassen wie bg-amber-500/10.
 */
export const DRINK_THEMES: Record<DrinkType, { label: string; emoji: string; c500: string; c400: string }> = {
  beer:  { label: 'Bier',   emoji: '🍺', c500: '245 158 11', c400: '251 191 36'  }, // #f59e0b / #fbbf24
  water: { label: 'Wasser', emoji: '💧', c500: '56 189 248', c400: '125 211 252' }, // #38bdf8 / #7dd3fc
  cola:  { label: 'Cola',   emoji: '🥤', c500: '181 115 63', c400: '201 140 85'  }, // #b5733f / #c98c55 (Karamellbraun)
};

/** Getränk wird nur lokal im Browser gemerkt – keine eigene DB-Spalte nötig. */
export const DRINK_STORAGE_KEY = 'bierwiegen_drink';

export const applyDrinkTheme = (drink: DrinkType) => {
  const t = DRINK_THEMES[drink] ?? DRINK_THEMES.beer;
  const root = document.documentElement.style;
  root.setProperty('--ac-500', t.c500);
  root.setProperty('--ac-400', t.c400);
};

export const BOTTLE_SIZES = {
  '0.33': { label: '0,33L (Kleines)', maxWeight: 700,  liquidWeight: 330 },
  '0.5':  { label: '0,5L (Großes)',   maxWeight: 1000, liquidWeight: 500 },
  '1.0':  { label: '1,0L (Maß)',      maxWeight: 1600, liquidWeight: 1000 },
} as const;

/** Grenzen für eine eigene Füllmenge (ml). */
export const CUSTOM_VOLUME_MIN = 100;
export const CUSTOM_VOLUME_MAX = 2000;

/** Kleinste Trinkmenge pro Runde – Untergrenze des Schiebereglers bei der Zielwahl. */
export const MIN_DRINK_AMOUNT = 30;

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

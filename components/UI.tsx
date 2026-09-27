
import React, { useEffect, useRef, useState } from 'react';

export const Card: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-slate-800/50 backdrop-blur-md border border-slate-700 rounded-3xl p-6 shadow-xl ${className}`}>
    {children}
  </div>
);

export interface PlacementEntry {
  id: string;
  name: string;
  averageDeviation: number;
  penalties: number;
  penaltiesGiven: number;
  rankChange?: number;
}

export const PlacementCard: React.FC<{
  players: PlacementEntry[];
  title?: string;
  /** Optional: Zeilen antippbar machen (z. B. Host entfernt einen Spieler). */
  onSelect?: (id: string) => void;
  selectableIds?: string[];
}> = ({ players, title = 'Aktuelle Platzierung', onSelect, selectableIds }) => (
  <Card>
    <h2 className="text-xs font-bold text-slate-500 uppercase mb-4">{title}</h2>
    <div className="space-y-2">
      {players.map((p, idx) => {
        const selectable = !!onSelect && (selectableIds?.includes(p.id) ?? true);
        const Row = selectable ? 'button' : 'div';
        return (
        <Row
          key={p.id}
          {...(selectable ? { type: 'button' as const, onClick: () => onSelect!(p.id) } : {})}
          className="w-full text-left p-3 rounded-xl border border-slate-700 bg-slate-900/40 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="font-bungee text-slate-500 text-sm w-6">#{idx + 1}</span>
            <span className="font-bold text-white">{p.name}</span>
            {p.rankChange !== undefined && p.rankChange !== 0 && (
              <span className={`text-[10px] font-bold ${p.rankChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {p.rankChange > 0 ? `▲${p.rankChange}` : `▼${Math.abs(p.rankChange)}`}
              </span>
            )}
            {p.rankChange === 0 && (
              <span className="text-[10px] font-bold text-slate-600">—</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase">K:{p.penalties} V:{p.penaltiesGiven}</span>
            <span className="font-bungee text-amber-500">{p.averageDeviation} g</span>
          </div>
        </Row>
        );
      })}
    </div>
  </Card>
);

export const BeerProgressBar: React.FC<{ progress: number, label?: string }> = ({ progress, label }) => {
  const percentage = Math.round(progress * 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-10 h-24 bg-slate-900 border-2 border-slate-700 rounded-xl relative overflow-hidden flex flex-col justify-end">
        <div 
          className="w-full bg-amber-500 transition-all duration-1000 ease-out flex items-center justify-center"
          style={{ height: `${percentage}%` }}
        >
          {percentage > 20 && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
              <div className="w-1 h-1 bg-white/40 rounded-full animate-bounce mb-1"></div>
              <div className="w-1.5 h-1.5 bg-white/20 rounded-full animate-bounce delay-75"></div>
            </div>
          )}
        </div>
      </div>
      <div className="text-[10px] font-bold text-slate-500 uppercase">{label || `${percentage}%`}</div>
    </div>
  );
};

export const FloatingReaction: React.FC<{ emoji: string }> = ({ emoji }) => {
  return (
    <div className="absolute -right-2 top-0 pointer-events-none animate-[floatUp_3s_ease-in-out_forwards] text-2xl z-50">
      {emoji}
    </div>
  );
};

/**
 * Reaktion an mich: schlängelt sich vom unteren Rand (über der Aktionsleiste)
 * nach oben und verblasst. Position und Ausschlag leiten sich aus der ID ab, damit mehrere Emojis nicht
 * übereinander kleben und beim Neu-Rendern nicht springen.
 */
export const RisingReaction: React.FC<{ reaction: { id: string; emoji: string } }> = ({ reaction }) => {
  const hash = [...reaction.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const left = 20 + (hash % 61);            // 20–80 % der Breite
  // Schlängel-Ausschlag 6–14 px, Richtung zufällig – so schwingen mehrere Emojis nicht im Gleichtakt.
  const wiggle = (6 + ((hash >> 8) % 9)) * ((hash >> 16) % 2 ? 1 : -1);
  return (
    <span
      role="img"
      aria-label={`Reaktion ${reaction.emoji}`}
      className="reaction-rise absolute bottom-6 text-3xl drop-shadow-lg"
      style={{ left: `${left}%`, ['--wig' as string]: `${wiggle}px` }}
    >{reaction.emoji}</span>
  );
};

export const EmojiBar: React.FC<{ onReact: (emoji: string) => void; compact?: boolean }> = ({ onReact, compact = false }) => {
  const emojis = ['🍻', '🔥', '🎯', '💀', '🤡', '🚀'];
  return (
    <div className={`flex bg-slate-900/80 backdrop-blur rounded-full border border-slate-700 shadow-lg ${compact ? 'gap-0.5 p-0.5' : 'gap-1 p-1 translate-y-[-2px]'}`}>
      {emojis.map(e => (
        <button
          key={e}
          onClick={(ev) => {
            ev.stopPropagation();
            onReact(e);
          }}
          aria-label={`${e} senden`}
          className={`hover:scale-125 transition-transform p-1 active:scale-90 ${compact ? 'text-xs' : 'text-sm'}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
};

export const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  className?: string;
}> = ({ children, onClick, variant = 'primary', disabled = false, className = '' }) => {
  const variants = {
    primary: 'ac-bg ac-shadow text-slate-900 shadow-lg',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-white',
    danger: 'bg-red-500 hover:bg-red-400 text-white',
    ghost: 'bg-transparent hover:bg-white/10 text-slate-300'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-6 py-3 rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

export const Input: React.FC<{
  label?: string;
  type?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
  maxLength?: number;
}> = ({ label, type = 'text', value, onChange, onKeyDown, placeholder, className = '', inputMode, maxLength }) => (
  <div className={`flex flex-col gap-2 ${className}`}>
    {label && <label className="text-sm font-semibold text-slate-400 ml-1">{label}</label>}
    <input
      type={type}
      inputMode={inputMode ?? (type === 'number' ? 'decimal' : undefined)}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full min-w-0 bg-slate-900/50 border border-slate-700 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-white placeholder:text-slate-600"
    />
  </div>
);

export interface SwipePage {
  key: string;
  label: string;
  /** Kleiner Hinweis im Tab, z. B. Punkt (du bist dran) oder Zahl (auf so viele wird gewartet). */
  badge?: React.ReactNode;
  content: React.ReactNode;
}

/**
 * Beschriftete Tabs oben + seitlich wischbare Seiten darunter.
 * Das Wischen läuft über natives CSS-Scroll-Snapping; die Tabs folgen der
 * Scrollposition, ein Tipp auf einen Tab scrollt zur Seite.
 * Jede Seite scrollt vertikal für sich.
 */
export const SwipeTabs: React.FC<{
  pages: SwipePage[];
  active: number;
  onActiveChange: (index: number) => void;
}> = ({ pages, active, onActiveChange }) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(active);
  // Index-Wechsel, die aus dem Wischen selbst kommen, dürfen nicht zurück-
  // scrollen – sonst kämpft der Code mitten in der Geste gegen den Finger.
  const fromScroll = useRef(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (fromScroll.current) { fromScroll.current = false; return; }
    const target = active * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) > 1) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
    }
  }, [active, pages.length]);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el || !el.clientWidth) return;
    const p = el.scrollLeft / el.clientWidth;
    setProgress(p);
    const idx = Math.min(pages.length - 1, Math.max(0, Math.round(p)));
    if (idx !== active) { fromScroll.current = true; onActiveChange(idx); }
  };

  const showTabs = pages.length > 1;
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {showTabs && (
        <div role="tablist" className="flex-none relative mx-4 mb-3 grid bg-slate-950 border border-slate-800 rounded-2xl p-1" style={{ gridTemplateColumns: `repeat(${pages.length}, 1fr)` }}>
          <span
            aria-hidden="true"
            className="absolute top-1 bottom-1 left-1 rounded-xl bg-slate-800 border border-slate-700"
            style={{ width: `calc((100% - 0.5rem) / ${pages.length})`, transform: `translateX(${progress * 100}%)` }}
          />
          {pages.map((p, i) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => onActiveChange(i)}
              className={`relative py-2 px-1 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${i === active ? 'text-white' : 'text-slate-500'}`}
            >
              {p.label}
              {p.badge}
            </button>
          ))}
        </div>
      )}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="no-scrollbar flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory overscroll-x-contain"
      >
        {pages.map((p, i) => (
          <section
            key={p.key}
            role={showTabs ? 'tabpanel' : undefined}
            aria-label={p.label}
            className="no-scrollbar w-full flex-none snap-start snap-always overflow-y-auto px-4 pb-6 space-y-4"
          >
            {p.content}
          </section>
        ))}
      </div>
    </div>
  );
};

/** Punkt im Tab: hier wird gerade etwas von dir gebraucht. */
export const DotBadge: React.FC = () => (
  <span aria-label="Du bist dran" className="w-1.5 h-1.5 rounded-full bg-amber-500" />
);

/** Zahl im Tab: auf so viele Spieler wird gerade gewartet. */
export const CountBadge: React.FC<{ count: number }> = ({ count }) => (
  <span aria-label={`${count} fehlen noch`} className="min-w-4 h-4 px-1 rounded-full bg-yellow-300 text-slate-900 text-[9px] font-extrabold inline-flex items-center justify-center">{count}</span>
);

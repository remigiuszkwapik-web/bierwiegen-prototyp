
import React, { useEffect, useState } from 'react';

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

export const PlacementCard: React.FC<{ players: PlacementEntry[]; title?: string }> = ({ players, title = 'Aktuelle Platzierung' }) => (
  <Card>
    <h2 className="text-xs font-bold text-slate-500 uppercase mb-4">{title}</h2>
    <div className="space-y-2">
      {players.map((p, idx) => (
        <div key={p.id} className="p-3 rounded-xl border border-slate-700 bg-slate-900/40 flex items-center justify-between">
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
            <span className="font-bungee text-amber-500">{p.averageDeviation}g</span>
          </div>
        </div>
      ))}
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
    <div className="absolute -right-2 top-0 pointer-events-none animate-[floatUp_3s_ease-out_forwards] text-2xl z-50">
      {emoji}
    </div>
  );
};

export const EmojiBar: React.FC<{ onReact: (emoji: string) => void }> = ({ onReact }) => {
  const emojis = ['🍻', '🔥', '🎯', '💀', '🤡', '🚀'];
  return (
    <div className="flex gap-1 bg-slate-900/80 backdrop-blur p-1 rounded-full border border-slate-700 shadow-lg translate-y-[-2px]">
      {emojis.map(e => (
        <button
          key={e}
          onClick={(ev) => {
            ev.stopPropagation();
            onReact(e);
          }}
          className="hover:scale-125 transition-transform p-1 text-sm active:scale-90"
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
    primary: 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-lg shadow-amber-500/20',
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
  placeholder?: string;
  className?: string;
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
}> = ({ label, type = 'text', value, onChange, placeholder, className = '', inputMode }) => (
  <div className={`flex flex-col gap-2 ${className}`}>
    {label && <label className="text-sm font-semibold text-slate-400 ml-1">{label}</label>}
    <input
      type={type}
      inputMode={inputMode ?? (type === 'number' ? 'decimal' : undefined)}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="bg-slate-900/50 border border-slate-700 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-white placeholder:text-slate-600"
    />
  </div>
);

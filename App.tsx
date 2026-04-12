
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Lottie from 'lottie-react';
import cheersAnimation from './src/assets/cheers.json';
import { Game, GameStatus, Player, Round, ViewMode, Reaction, BottleSize } from './types';
import { SupabaseGameRepository } from './repositories/GameRepository';
import { Card, Button, Input, BeerProgressBar, FloatingReaction, EmojiBar, PlacementCard } from './components/UI';
import { BOTTLE_SIZES } from './constants';
import {
  calculateAverageDeviation,
  getPlayerPerformanceTag,
  getDrinkingProgress,
  generateGameCode,
  getPenaltiesGiven,
  getRoundWins,
  getDeviationTrend
} from './services/GameLogic';

const repo = new SupabaseGameRepository();

// ─── DEV MODE ────────────────────────────────────────────────────────────────
const IS_DEV_PARAM = new URLSearchParams(window.location.search).get('dev') === 'true';

const DEMO_GAME: Game = {
  id: 'demo-game',
  gameCode: 'DEMO',
  hostId: 'dev-host',
  createdAt: Date.now(),
  isFinished: false,
  status: GameStatus.SETTING_TARGET,
  players: [
    { id: 'p1', name: 'Max',  weights: [755, 698, 648], deviations: [2,  2],  penalties: 0 },
    { id: 'p2', name: 'Anna', weights: [748, 694, 640], deviations: [6,  10], penalties: 1 },
    { id: 'p3', name: 'Ben',  weights: [752, 688, 643], deviations: [12, 7],  penalties: 1 },
    { id: 'p4', name: 'Lisa', weights: [745, 692, 635], deviations: [8,  15], penalties: 0 },
  ],
  rounds: [
    { roundNumber: 1, targetWeight: 700, chooserPlayerId: 'p4', initialWeights: {}, finalWeights: {}, penaltyChoices: { 'p1': 'p2' } },
    { roundNumber: 2, targetWeight: 650, chooserPlayerId: 'p4', initialWeights: {}, finalWeights: {}, penaltyChoices: { 'p4': 'p3' } },
  ],
  currentRoundIndex: 2,
  bottleSize: '0.5',
  reactions: [],
  declinedHostIds: [],
};
// ─────────────────────────────────────────────────────────────────────────────

const getUserId = () => {
    let id = localStorage.getItem('bierwiegen_user_id');
    if (!id) {
        id = Math.random().toString(36).substr(2, 9);
        localStorage.setItem('bierwiegen_user_id', id);
    }
    return id;
};

const App: React.FC = () => {
  const myUserId = useMemo(() => getUserId(), []);
  const [game, setGame] = useState<Game | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);
  const [viewerPlayerId, setViewerPlayerId] = useState<string | null>(null);
  const [presentUsers, setPresentUsers] = useState<string[]>([]);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [devMode, setDevMode] = useState(IS_DEV_PARAM);
  const devModeRef = useRef(IS_DEV_PARAM);
  useEffect(() => { devModeRef.current = devMode; }, [devMode]);

  const [newPlayerName, setNewPlayerName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [drinkAmountInput, setDrinkAmountInput] = useState<string>('');
  const [playerStatsTab, setPlayerStatsTab] = useState<'statistik' | 'strafen'>('statistik');
  const [showCheers, setShowCheers] = useState(false);
  const [poppedBubbles, setPoppedBubbles] = useState<Set<number>>(new Set());
  
  const gameRef = useRef<Game | null>(null);
  useEffect(() => { gameRef.current = game; }, [game]);

  useEffect(() => {
    if (game?.status === GameStatus.DRINKING) {
      setShowCheers(true);
      const timer = setTimeout(() => setShowCheers(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [game?.status]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) setJoinCodeInput(code.toUpperCase());
  }, []);

  useEffect(() => {
    if (!game?.gameCode) return;
    if (devModeRef.current) return; // Kein Supabase in Dev-Modus

    const channel = repo.subscribeToGameRoom(
      game.gameCode,
      (updatedGame) => {
        if (!updatedGame) {
          setGame(null);
          setViewMode(null);
          setViewerPlayerId(null);
          return;
        }
        if (JSON.stringify(gameRef.current) !== JSON.stringify(updatedGame)) {
          setGame(updatedGame);
          if (updatedGame.hostId === myUserId) {
            setViewMode((prev) => prev !== ViewMode.HOST ? ViewMode.HOST : prev);
          }
        }
      },
      (userIds) => setPresentUsers(userIds),
      myUserId
    );

    return () => {
      channel.unsubscribe();
    };
  }, [game?.gameCode, myUserId]);

  const updateGame = useCallback(async (updater: (prev: Game | null) => Game | null) => {
    const prev = gameRef.current;
    const next = updater(prev);
    
    if (next) {
      setGame(next);
      if (!devModeRef.current) await repo.saveGame(next);
    } else {
      if (prev && !devModeRef.current) {
        await repo.deleteGameFromDB(prev.gameCode);
      }
      setGame(null);
      setViewMode(null);
    }
  }, []);

  const createGame = () => {
    const newGame: Game = {
      id: Math.random().toString(36).substr(2, 9),
      gameCode: generateGameCode(),
      hostId: myUserId,
      createdAt: Date.now(),
      isFinished: false,
      status: GameStatus.SETUP,
      players: [],
      rounds: [],
      currentRoundIndex: 0,
      bottleSize: '0.5',
      reactions: [],
      declinedHostIds: []
    };
    setViewMode(ViewMode.HOST);
    updateGame(() => newGame);
  };

  const loadDemoGame = useCallback(() => {
    devModeRef.current = true;
    setDevMode(true);
    setGame({ ...DEMO_GAME, createdAt: Date.now() });
    setViewMode(ViewMode.HOST);
    setViewerPlayerId(null);
    setInputs({});
    setDrinkAmountInput('');
  }, []);

  // Auto-load demo wenn ?dev=true in URL
  useEffect(() => {
    if (IS_DEV_PARAM) loadDemoGame();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const joinGame = async () => {
    const code = joinCodeInput.toUpperCase().trim();
    if (!code) return;
    const loaded = await repo.loadGame(code);
    if (loaded) {
      setGame(loaded);
      setViewMode(loaded.hostId === myUserId ? ViewMode.HOST : ViewMode.PLAYER);
    } else {
      alert("Raum nicht gefunden!");
    }
  };

  const minWeightPlayer = useMemo(() => {
    if (!game || game.players.length === 0) return null;
    return [...game.players].sort((a, b) => (a.weights.slice(-1)[0] || 0) - (b.weights.slice(-1)[0] || 0))[0];
  }, [game]);

  const showHandoverDialog = useMemo(() => {
    if (!game || viewMode === ViewMode.HOST) return false;
    const isHostPresent = presentUsers.includes(game.hostId);
    if (isHostPresent) return false;

    const eligibleOnlineUsers = game.players
      .filter(p => p.userId && presentUsers.includes(p.userId) && !(game.declinedHostIds || []).includes(p.userId))
      .map(p => p.userId);

    return eligibleOnlineUsers[0] === myUserId;
  }, [game, presentUsers, viewMode, myUserId]);

  const acceptHosting = () => {
    updateGame(prev => prev ? { ...prev, hostId: myUserId } : null);
    setViewMode(ViewMode.HOST);
  };

  const declineHosting = () => {
    updateGame(prev => prev ? { ...prev, declinedHostIds: [...(prev.declinedHostIds || []), myUserId] } : null);
  };

  const goBack = () => {
    setInputs({});
    setDrinkAmountInput('');
    updateGame(prev => {
      if (!prev) return null;
      switch (prev.status) {
        case GameStatus.WEIGHING_INITIAL:
          return { ...prev, status: GameStatus.SETUP, players: prev.players.map(p => ({ ...p, weights: [] })) };
        case GameStatus.SETTING_TARGET:
          if (prev.rounds.length === 0) {
            return { ...prev, status: GameStatus.WEIGHING_INITIAL, players: prev.players.map(p => ({ ...p, weights: [] })) };
          }
          return { ...prev, status: GameStatus.ROUND_RESULT };
        case GameStatus.DRINKING:
          return { ...prev, status: GameStatus.SETTING_TARGET, rounds: prev.rounds.slice(0, -1) };
        case GameStatus.WEIGHING_FINAL:
          return { ...prev, status: GameStatus.DRINKING };
        case GameStatus.ROUND_RESULT: {
          const lastRound = prev.rounds[prev.rounds.length - 1];
          const penaltyChoices = lastRound?.penaltyChoices || {};
          const penaltyTargetIds = Object.values(penaltyChoices);
          return {
            ...prev,
            status: GameStatus.WEIGHING_FINAL,
            players: prev.players.map(p => ({
              ...p,
              weights: p.weights.slice(0, -1),
              deviations: p.deviations.slice(0, -1),
              penalties: p.penalties - penaltyTargetIds.filter(id => id === p.id).length,
            })),
            rounds: prev.rounds.map((r, i) =>
              i === prev.rounds.length - 1 ? { ...r, penaltyChoices: undefined } : r
            ),
          };
        }
        default:
          return prev;
      }
    });
  };

  if (!game) {
    return (
      <div className="h-screen flex flex-col px-6 pt-6 pb-4 relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
          <span className="font-bungee text-white opacity-[0.025]" style={{ fontSize: '80vw', lineHeight: 1 }}>W</span>
        </div>

        {/* Rising bubbles */}
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
          {[
            { left: '8%',  size: 20, dur: 7,  delay: 0   },
            { left: '18%', size: 14, dur: 9,  delay: 2.5 },
            { left: '30%', size: 28, dur: 11, delay: 1   },
            { left: '43%', size: 18, dur: 8,  delay: 4   },
            { left: '55%', size: 12, dur: 10, delay: 0.5 },
            { left: '67%', size: 24, dur: 7,  delay: 3   },
            { left: '78%', size: 16, dur: 12, delay: 1.5 },
            { left: '88%', size: 20, dur: 9,  delay: 5   },
            { left: '23%', size: 10, dur: 13, delay: 6   },
            { left: '62%', size: 22, dur: 8,  delay: 2   },
          ].map((b, i) => (
            <div
              key={i}
              onClick={() => setPoppedBubbles(prev => new Set([...prev, i]))}
              className="absolute bottom-0 rounded-full cursor-pointer pointer-events-auto transition-all duration-300"
              style={{
                left: b.left,
                width: b.size,
                height: b.size,
                backgroundColor: '#f59e0b',
                opacity: poppedBubbles.has(i) ? 0 : 0.10,
                animation: poppedBubbles.has(i) ? 'none' : `bubbleRise ${b.dur}s ease-in ${b.delay}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Content — vertically centered, no scroll */}
        <div className="flex-1 flex flex-col items-center justify-center relative z-10 gap-6">
          {/* Logo */}
          <div className="text-center">
            <h1 className="text-7xl font-bungee text-amber-500 tracking-tight leading-none mb-1">WIEGEN</h1>
            <p className="text-slate-600 font-bold uppercase tracking-[0.3em] text-xs">Multiplayer · Trinkspiel</p>
          </div>

          {/* Actions */}
          <div className="w-full max-w-xs space-y-3">
            <button
              onClick={createGame}
              className="w-full ac-bg active:scale-95 transition-all text-slate-900 rounded-3xl py-5 font-bungee text-xl tracking-wider shadow-xl"
            >
              STARTE EIN SPIEL
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-700" />
              <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">oder beitreten</span>
              <div className="flex-1 h-px bg-slate-700" />
            </div>

            <div className="bg-slate-800/50 border border-slate-700/60 rounded-3xl p-4 space-y-3">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && joinGame()}
                placeholder="CODE"
                className="w-full bg-transparent text-center font-bungee text-4xl tracking-[0.4em] focus:outline-none text-white placeholder:text-slate-700 py-1"
              />
              <Button onClick={joinGame} variant="secondary" className="w-full">BEITRETEN</Button>
            </div>
          </div>
        </div>

        {/* Dev mode — above waves */}
        <div className="fixed z-20 left-0 right-0 text-center" style={{ bottom: 185 }}>
          <button onClick={loadDemoGame} className="text-[10px] text-slate-700 hover:text-slate-500 font-bold uppercase tracking-widest">
            ⚙ Dev Mode
          </button>
        </div>

        {/* Wave layers — fixed inset-0 so no parent clip creates a visible edge */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {[
            { opacity: 0.22, speed: '8s', anim: 'waveMove1' },
            { opacity: 0.15, speed: '11s', anim: 'waveMove2' },
            { opacity: 0.10, speed: '14s', anim: 'waveMove3' },
          ].map((w, i) => (
            <div key={i} className="absolute bottom-0 left-0" style={{ width: '200%', height: 280, opacity: w.opacity, animation: `${w.anim} ${w.speed} ease-in-out infinite alternate`, WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 50%)', maskImage: 'linear-gradient(to bottom, transparent 0%, black 50%)' }}>
              <svg viewBox="0 0 1440 280" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                <path
                  d={i === 0
                    ? 'M0,160 C180,200 360,120 540,160 C720,200 900,120 1080,160 C1260,200 1440,120 1440,160 L1440,280 L0,280 Z'
                    : i === 1
                    ? 'M0,175 C200,130 400,215 600,175 C800,135 1000,205 1200,175 C1300,155 1380,190 1440,175 L1440,280 L0,280 Z'
                    : 'M0,150 C150,190 350,115 500,155 C650,195 850,125 1050,158 C1200,185 1350,140 1440,158 L1440,280 L0,280 Z'
                  }
                  fill="#f59e0b"
                />
              </svg>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen${devMode ? ' pb-20' : ''}`}>
      {showHandoverDialog && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 text-center">
          <Card className="max-w-sm border-amber-500">
            <div className="text-5xl mb-4">👑</div>
            <h2 className="text-xl font-bungee mb-2">Host ist weg!</h2>
            <p className="text-slate-400 mb-6 text-sm">Möchtest du das Spiel als Host übernehmen?</p>
            <div className="space-y-3">
              <Button onClick={acceptHosting} className="w-full">JA, ÜBERNEHMEN</Button>
              <Button onClick={declineHosting} variant="ghost" className="w-full text-slate-500">NÄCHSTER BITTE</Button>
            </div>
          </Card>
        </div>
      )}

      {viewMode === ViewMode.HOST && game.status !== GameStatus.SETUP && game.players.length > 0 && (
        <div className="px-4 pt-4 max-w-2xl mx-auto">
          {!viewerPlayerId ? (
            <div className="mb-2 p-3 bg-slate-900/60 rounded-xl border border-slate-700">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Welcher Spieler bist du?</p>
              <div className="flex gap-2 flex-wrap">
                {game.players.map(p => (
                  <button key={p.id} onClick={() => setViewerPlayerId(p.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 font-bold text-sm hover:bg-amber-500/20 hover:border-amber-500/50 transition-colors">
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (() => {
            const me = game.players.find(p => p.id === viewerPlayerId);
            if (!me) return null;
            const currentRound = game.rounds.slice(-1)[0];
            const target = currentRound?.targetWeight;
            const myWeight = me.weights.slice(-1)[0] || 0;
            const diff = target != null ? myWeight - target : null;
            return (
              <div className="mb-4 p-4 bg-slate-900/60 rounded-xl border border-amber-500/30 flex items-center gap-4">
                <BeerProgressBar progress={getDrinkingProgress(myWeight, me.weights[0] || 0, game.bottleSize)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bungee text-amber-500 text-sm">{me.name}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">(Ich)</span>
                    <button onClick={() => setViewerPlayerId(null)} className="ml-auto text-[10px] text-slate-600 hover:text-slate-400">✕</button>
                  </div>
                  <div className="text-2xl font-bungee text-white">{myWeight} g</div>
                  {game.status === GameStatus.DRINKING && diff != null && (
                    <div className={`text-xs font-bungee mt-1 ${diff === 0 ? 'text-green-400' : diff > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                      {diff > 0 ? `+${diff}g zu wenig` : diff < 0 ? `${diff}g zu viel` : 'Punktgelandet!'}
                    </div>
                  )}
                  <div className="flex gap-3 mt-1">
                    <div><span className="text-[9px] text-slate-600 font-bold uppercase">Ø Abw.</span> <span className="text-xs font-bungee">{calculateAverageDeviation(me.deviations)} g</span></div>
                    <div><span className="text-[9px] text-slate-600 font-bold uppercase">Strafen</span> <span className="text-xs font-bungee">{me.penalties}</span></div>
                    <div className={`text-xs font-bungee ${getDeviationTrend(me.deviations).color}`}>{getDeviationTrend(me.deviations).label}</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {viewMode === ViewMode.PLAYER ? (
        <div className="p-4 max-w-2xl mx-auto space-y-6">
            {!viewerPlayerId ? (
                <Card className="mt-20"><h2 className="text-xl font-bungee text-center mb-6">WER BIST DU?</h2><div className="grid gap-2">{game.players.map(p => (<button key={p.id} onClick={() => { setViewerPlayerId(p.id); if(!p.userId) updateGame(prev => prev ? {...prev, players: prev.players.map(pl => pl.id === p.id ? {...pl, userId: myUserId} : pl)} : null); }} className="p-4 bg-slate-900/60 rounded-xl border border-slate-700 font-bold text-left flex justify-between">{p.name} <span className="text-amber-500">→</span></button>))}</div></Card>
            ) : (
                <>
                    <header className="flex justify-between items-end"><div><p className="text-[10px] text-slate-500 font-bold uppercase">Spieler</p><h1 className="text-2xl font-bungee text-amber-500">{game.players.find(p => p.id === viewerPlayerId)?.name}</h1></div><div className="text-right text-xs font-bold text-slate-500 uppercase">Code: {game.gameCode}</div></header>
                    <Card className="border-slate-700 pb-4">
                      {(() => {
                        const vp = game.players.find(p => p.id === viewerPlayerId)!;
                        const devs = vp.deviations;
                        const tag = getPlayerPerformanceTag(vp, game.players, game.rounds);
                        const best = devs.length ? Math.min(...devs) : null;
                        const worst = devs.length ? Math.max(...devs) : null;
                        const last = devs.length ? devs[devs.length - 1] : null;
                        const wins = getRoundWins(viewerPlayerId!, game.players, game.rounds);
                        const maxDev = devs.length ? Math.max(...devs, 1) : 1;
                        return (
                          <div className="flex items-start gap-4">
                            <BeerProgressBar progress={getDrinkingProgress(vp.weights.slice(-1)[0] || 0, vp.weights[0] || 0, game.bottleSize)} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-end gap-8 mb-1">
                                <div>
                                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Gewicht</div>
                                  <div className="text-4xl font-bungee text-white">{vp.weights.slice(-1)[0] || 0} g</div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Trend</div>
                                  <div className={`text-4xl font-bungee ${getDeviationTrend(devs).color}`}>{getDeviationTrend(devs).label}</div>
                                </div>
                              </div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 mb-3">
                                {tag.icon} {tag.label}
                              </div>
                              <div className="mb-3">
                                <div className="flex gap-1 mb-2">
                                  <button onClick={() => setPlayerStatsTab('statistik')} className={`flex-1 py-1 text-[9px] font-bold uppercase rounded-lg transition-colors ${playerStatsTab === 'statistik' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-800/60 text-slate-500 border border-slate-700'}`}>Statistik</button>
                                  <button onClick={() => setPlayerStatsTab('strafen')} className={`flex-1 py-1 text-[9px] font-bold uppercase rounded-lg transition-colors ${playerStatsTab === 'strafen' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-800/60 text-slate-500 border border-slate-700'}`}>Strafen</button>
                                </div>
                                <div className="grid grid-cols-4 gap-1">
                                  {playerStatsTab === 'statistik' ? (<>
                                    <div className="min-w-0"><div className="text-[9px] text-slate-600 font-bold uppercase truncate">Last</div><div className="text-xs font-bungee text-white">{last != null ? `${last} g` : '—'}</div></div>
                                    <div className="min-w-0"><div className="text-[9px] text-slate-600 font-bold uppercase truncate">Best</div><div className="text-xs font-bungee text-green-400">{best != null ? `${best} g` : '—'}</div></div>
                                    <div className="min-w-0"><div className="text-[9px] text-slate-600 font-bold uppercase truncate">Highest</div><div className="text-xs font-bungee text-red-400">{worst != null ? `${worst} g` : '—'}</div></div>
                                    <div className="min-w-0"><div className="text-[9px] text-slate-600 font-bold uppercase truncate">Victories</div><div className="text-xs font-bungee text-amber-400">{wins}</div></div>
                                  </>) : (<>
                                    <div className="min-w-0"><div className="text-[9px] text-slate-600 font-bold uppercase truncate">Kassiert</div><div className="text-xs font-bungee text-white">{vp.penalties}</div></div>
                                    <div className="min-w-0"><div className="text-[9px] text-slate-600 font-bold uppercase truncate">Verteilt</div><div className="text-xs font-bungee text-white">{getPenaltiesGiven(viewerPlayerId!, game.players, game.rounds)}</div></div>
                                    <div /><div />
                                  </>)}
                                </div>
                              </div>
                              {devs.length > 0 && (
                                <>
                                  <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">Rundenverlauf</div>
                                  <div className="flex gap-1.5">
                                    {devs.map((dev, idx) => {
                                      const playersWithDev = game.players.filter(p => p.deviations[idx] !== undefined);
                                      const isWin = dev === Math.min(...playersWithDev.map(p => p.deviations[idx]));
                                      const finalWeight = vp.weights[idx + 1];
                                      const target = game.rounds[idx]?.targetWeight;
                                      const tooLittle = finalWeight != null && target != null && finalWeight > target;
                                      const tooMuch = finalWeight != null && target != null && finalWeight < target;
                                      return (
                                        <div key={idx} className={`flex-1 rounded px-1 py-1 text-center ${isWin ? 'bg-amber-500/8' : 'bg-slate-900/50'}`}>
                                          <div className={`text-[8px] font-bold uppercase mb-0.5 ${isWin ? 'text-amber-500/70' : 'text-slate-700'}`}>{isWin ? '★' : `R${idx + 1}`}</div>
                                          <div className="flex items-center justify-center gap-0.5 leading-none">
                                            <div className={`text-xs font-bungee ${isWin ? 'text-amber-400/80' : 'text-slate-400'}`}>{dev} g</div>
                                            <div className={`text-[8px] font-bold ${tooLittle ? 'text-red-400/70' : tooMuch ? 'text-blue-400/70' : 'text-green-400/70'}`}>{tooLittle ? '+' : tooMuch ? '-' : '●'}</div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </Card>
                    {game.status === GameStatus.DRINKING && (
                        <Card className="border-amber-500/50 text-center py-10">
                          <h2 className="text-xs font-bold text-amber-500 uppercase mb-2">Ziel</h2>
                          <div className="text-6xl font-bungee text-white mb-2">{game.rounds.slice(-1)[0]?.targetWeight} g</div>
                          <p className="text-slate-400 text-[10px] font-bold uppercase">Noch {(game.players.find(p => p.id === viewerPlayerId)?.weights.slice(-1)[0] || 0) - (game.rounds.slice(-1)[0]?.targetWeight || 0)} g</p>
                        </Card>
                    )}
                    <Card><h2 className="text-xs font-bold text-slate-500 uppercase mb-4">Ranking</h2><div className="space-y-2">{[...game.players].sort((a,b) => calculateAverageDeviation(a.deviations) - calculateAverageDeviation(b.deviations)).map((p, idx) => (<div key={p.id} className={`p-3 rounded-xl ${p.id === viewerPlayerId ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-slate-900/40'}`}><div className="flex justify-between items-center relative"><div className="flex items-center gap-2"><span className="font-bungee text-slate-600 text-[10px]">#{idx+1}</span><span className="font-bold text-sm">{p.name}</span><div className="relative">{game.reactions?.filter(r => r.targetPlayerId === p.id).map(r => <FloatingReaction key={r.id} emoji={r.emoji} />)}</div></div><div className="font-bungee text-xs">{calculateAverageDeviation(p.deviations)} g</div></div>{p.id !== viewerPlayerId && <div className="mt-2 flex justify-end"><EmojiBar onReact={(emoji) => { updateGame(prev => { if(!prev) return null; return { ...prev, reactions: [...(prev.reactions || []), { id: Math.random().toString(36).substr(2, 9), emoji, targetPlayerId: p.id, timestamp: Date.now() }] }; }); }} /></div>}</div>))}</div></Card>
                </>
            )}
        </div>
      ) : (
        <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-8">
            <header className="flex justify-between items-center">
                <div><h1 className="text-xl font-bungee text-amber-500">HOST MODE</h1><p className="text-[10px] text-slate-500 font-bold uppercase">Code: {game.gameCode}</p></div>
                <div className="flex gap-4 items-center">
                  {game.status !== GameStatus.SETUP && game.status !== GameStatus.FINISHED && (
                    <button onClick={goBack} className="text-slate-400 font-bold text-[10px] uppercase">← Zurück</button>
                  )}
                  <button onClick={() => { const url = new URL(window.location.href); url.searchParams.set('code', game.gameCode); navigator.clipboard.writeText(url.toString()); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); }} className={`text-[10px] font-bold uppercase ${copyFeedback ? 'text-green-500' : 'text-slate-400'}`}>{copyFeedback ? 'Kopiert' : 'Link'}</button>
                  <button onClick={() => { if(window.confirm("Spiel wirklich beenden?")) updateGame(() => null); }} className="text-red-500 font-bold text-[10px] uppercase underline">Beenden</button>
                </div>
            </header>

            {game.status === GameStatus.SETUP && (
                <div className="space-y-3">
                    <Card className="p-4 space-y-3">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Größe</p>
                        <div className="flex gap-1.5">
                          {(Object.entries(BOTTLE_SIZES) as [BottleSize, typeof BOTTLE_SIZES[keyof typeof BOTTLE_SIZES]][]).map(([key, val]) => (
                            <button key={key} onClick={() => updateGame(p => p ? { ...p, bottleSize: key } : null)}
                              className={`flex-1 py-2 rounded-xl font-bungee border-2 transition-colors text-xs ${game.bottleSize === key ? 'ac-bg text-slate-900 border-transparent' : 'bg-slate-800 border-slate-700 text-white'}`}>
                              {val.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </Card>
                    <Card className="p-4 overflow-hidden">
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Spieler</p>
                      <div className="flex gap-2 mb-3">
                        <Input value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} placeholder="Name..." className="flex-1 min-w-0" onKeyPress={(e) => e.key === 'Enter' && (newPlayerName.trim() && updateGame(p => p ? {...p, players: [...p.players, { id: Math.random().toString(36).substr(2, 9), name: newPlayerName.trim(), weights: [], deviations: [], penalties: 0 }]} : null), setNewPlayerName(''))} />
                        <Button onClick={() => { if(!newPlayerName.trim()) return; updateGame(p => p ? {...p, players: [...p.players, { id: Math.random().toString(36).substr(2, 9), name: newPlayerName.trim(), weights: [], deviations: [], penalties: 0 }]} : null); setNewPlayerName(''); }} className="shrink-0 px-4">Add</Button>
                      </div>
                      <div className="space-y-1">
                        {game.players.map(p => (
                          <div key={p.id} className="flex justify-between items-center py-2 px-3 bg-slate-900/40 rounded-xl">
                            <span className="font-bold text-sm">{p.name}</span>
                            <button onClick={() => updateGame(prev => prev ? { ...prev, players: prev.players.filter(pl => pl.id !== p.id) } : null)} className="text-red-500 text-sm">✕</button>
                          </div>
                        ))}
                      </div>
                    </Card>
                    <Button onClick={() => updateGame(p => p ? {...p, status: GameStatus.WEIGHING_INITIAL} : null)} disabled={game.players.length < 1} className="w-full py-4 text-xl font-bungee">START</Button>
                </div>
            )}

            {game.status === GameStatus.WEIGHING_INITIAL && (() => {
                const maxW = (BOTTLE_SIZES[game.bottleSize] ?? BOTTLE_SIZES['0.5']).maxWeight;
                return (
                <Card><h2 className="text-xl font-bungee text-center mb-6 uppercase">Initialwiegen</h2><div className="space-y-3 mb-6">{game.players.map(p => (<div key={p.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-xl"><div className="font-bold">{p.name}</div><div className="flex items-center gap-2"><Input type="number" value={inputs[p.id] || ''} onChange={(e) => { const raw = e.target.value; const num = parseInt(raw); if (!raw || isNaN(num)) { setInputs({...inputs, [p.id]: raw}); return; } setInputs({...inputs, [p.id]: Math.min(maxW, Math.max(1, num)).toString()}); }} placeholder="000" className="w-20 text-center font-bungee" /><span className="text-slate-500 text-[10px] font-bold uppercase">g</span></div></div>))}</div><Button onClick={() => { if(!game.players.every(p => inputs[p.id] && parseInt(inputs[p.id]) >= 1 && parseInt(inputs[p.id]) <= maxW)) { alert(`Bitte gültige Gewichte eingeben (1–${maxW}g)`); return; } updateGame(prev => { if(!prev) return null; return { ...prev, status: GameStatus.SETTING_TARGET, players: prev.players.map(p => ({...p, weights: [parseInt(inputs[p.id])]})) }; }); setInputs({}); }} className="w-full py-4 font-bungee">FERTIG</Button></Card>
                );
            })()}

            {game.status === GameStatus.SETTING_TARGET && (
                <Card className="text-center"><h2 className="text-xl font-bungee mb-6 uppercase">Ziel wählen</h2>
                  <div className="bg-slate-900 p-6 rounded-2xl mb-6">
                    <div className="text-[10px] font-bold text-amber-500 uppercase mb-1">Entscheider (Leerste Flasche)</div>
                    <div className="text-xl font-bold text-white mb-4">{minWeightPlayer?.name || '---'}</div>
                    <hr className="border-slate-800 mb-4" />
                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Referenz</div>
                    <div className="text-4xl font-bungee text-white">{minWeightPlayer?.weights.slice(-1)[0]} g</div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex gap-2">{[30, 50, 100].map(val => <button key={val} onClick={() => setDrinkAmountInput(val.toString())} className={`flex-1 py-3 rounded-xl font-bungee border-2 transition-colors ${drinkAmountInput === val.toString() ? 'bg-amber-500 border-amber-400 text-slate-900' : 'bg-slate-800 border-slate-700'}`}>{val} g</button>)}</div>
                    <Input type="number" value={drinkAmountInput} onChange={(e) => setDrinkAmountInput(e.target.value)} placeholder="Menge..." className="text-center" />
                    <Button onClick={() => { const amount = parseInt(drinkAmountInput); if(!amount) return; updateGame(prev => { if(!prev) return null; const currentMin = Math.min(...prev.players.map(p => p.weights.slice(-1)[0])); return { ...prev, status: GameStatus.DRINKING, rounds: [...prev.rounds, { roundNumber: prev.rounds.length + 1, targetWeight: currentMin - amount, chooserPlayerId: '', initialWeights: {}, finalWeights: {} }] }; }); setDrinkAmountInput(''); }} className="w-full py-4 font-bungee">RUNDE STARTEN</Button>
                  </div>
                </Card>
            )}

            {game.status === GameStatus.DRINKING && (
                <Card className="text-center py-12"><h2 className="text-4xl font-bungee mb-4 text-amber-500 uppercase">Prost!</h2><p className="text-slate-500 font-bold uppercase text-xs mb-1">Ziel</p><div className="text-7xl font-bungee text-white mb-10">{game.rounds.slice(-1)[0]?.targetWeight} g</div><Button onClick={() => updateGame(p => p ? {...p, status: GameStatus.WEIGHING_FINAL} : null)} className="w-full py-4 font-bungee">WIEGEN</Button></Card>
            )}

            {game.status === GameStatus.WEIGHING_FINAL && (
                <Card><h2 className="text-xl font-bungee text-center mb-4 uppercase">Endwiegen</h2><div className="text-center mb-6"><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Ziel</p><div className="text-4xl font-bungee text-amber-500">{game.rounds.slice(-1)[0]?.targetWeight} g</div></div><div className="space-y-3 mb-6">{game.players.map(p => { const maxForPlayer = p.weights[0] || (BOTTLE_SIZES[game.bottleSize] ?? BOTTLE_SIZES['0.5']).maxWeight; return (<div key={p.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-xl"><div className="font-bold">{p.name}</div><div className="flex items-center gap-2"><Input type="number" value={inputs[p.id] || ''} onChange={(e) => { const raw = e.target.value; const num = parseInt(raw); if (!raw || isNaN(num)) { setInputs({...inputs, [p.id]: raw}); return; } setInputs({...inputs, [p.id]: Math.min(maxForPlayer, Math.max(0, num)).toString()}); }} placeholder="000" className="w-20 text-center font-bungee" /><span className="text-slate-500 text-[10px] font-bold uppercase">g</span></div></div>); })}</div><Button onClick={() => { const invalid = game.players.find(p => { const val = parseInt(inputs[p.id]); const maxForPlayer = p.weights[0] || (BOTTLE_SIZES[game.bottleSize] ?? BOTTLE_SIZES['0.5']).maxWeight; return !inputs[p.id] || isNaN(val) || val < 0 || val > maxForPlayer; }); if (invalid) { alert(`Ungültiger Wert für ${invalid.name}. Max: ${invalid.weights[0] || (BOTTLE_SIZES[game.bottleSize] ?? BOTTLE_SIZES['0.5']).maxWeight} g`); return; } updateGame(prev => { if(!prev) return null; const target = prev.rounds.slice(-1)[0].targetWeight; return { ...prev, status: GameStatus.ROUND_RESULT, players: prev.players.map(p => ({...p, weights: [...p.weights, parseInt(inputs[p.id])], deviations: [...p.deviations, Math.abs(parseInt(inputs[p.id]) - target)]})) }; }); setInputs({}); }} className="w-full py-4 font-bungee">AUSWERTEN</Button></Card>
            )}

            {game.status === GameStatus.ROUND_RESULT && (() => {
                const roundResults = [...game.players].sort((a, b) => (a.deviations.slice(-1)[0] || 0) - (b.deviations.slice(-1)[0] || 0));
                const minDev = roundResults[0] ? (roundResults[0].deviations.slice(-1)[0] || 0) : 0;
                const roundWinners = roundResults.filter(p => (p.deviations.slice(-1)[0] || 0) === minDev);
                const roundLoser = roundResults[roundResults.length - 1];
                const currentRound = game.rounds.slice(-1)[0];
                const penaltyChoices = currentRound?.penaltyChoices || {};
                const allChosen = roundWinners.every(w => w.id in penaltyChoices);
                const nextChooser = roundWinners.find(w => !(w.id in penaltyChoices));
                return (
                <div className="space-y-4">
                    <Card>
                        <h2 className="text-xl font-bungee text-center mb-6 uppercase">Ergebnis</h2>
                        <div className="space-y-3">
                            {roundResults.map((p, idx) => {
                                const target = game.rounds.slice(-1)[0].targetWeight;
                                const final = p.weights.slice(-1)[0];
                                const diff = final - target;
                                const isAbove = diff > 0;
                                const isWinner = roundWinners.some(w => w.id === p.id);
                                const isLoser = idx === roundResults.length - 1 && !isWinner;
                                return (
                                    <div key={p.id} className={`p-4 rounded-xl border flex justify-between items-center ${isWinner ? 'bg-green-500/10 border-green-500/30' : 'bg-slate-900/40 border-slate-700'}`}>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold">{p.name}</span>
                                            {isWinner && <span className="text-[10px] font-bold uppercase text-green-500 bg-green-500/20 px-2 py-0.5 rounded">Rundensieger</span>}
                                            {isLoser && <span className="text-[10px] font-bold uppercase text-amber-500 bg-amber-500/20 px-2 py-0.5 rounded">Rundenverlierer</span>}
                                        </div>
                                        <div className="text-right">
                                            <div className={`font-bungee text-xl ${diff === 0 ? 'text-green-400' : isAbove ? 'text-red-400' : 'text-blue-400'}`}>{isAbove ? '+' : ''}{diff} g</div>
                                            <div className="text-[10px] text-slate-500 uppercase font-bold">{diff === 0 ? 'PUNKTGELANDET' : isAbove ? 'ZU WENIG GETRUNKEN' : 'ZU VIEL GETRUNKEN'}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-slate-400 text-xs mt-4 text-center font-bold uppercase">Der Rundenverlierer trinkt mit dem Strafen-Empfänger einen Kurzen.</p>
                    </Card>
                    {!allChosen ? (
                        <Card className="border-amber-500/50">
                            <h2 className="text-sm font-bungee text-center mb-2 uppercase">{nextChooser?.name} wählt</h2>
                            <p className="text-slate-400 text-xs text-center mb-4">Strafe an wen?</p>
                            <div className="grid grid-cols-2 gap-2">
                                {game.players.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => {
                                            const roundIndex = game.rounds.length - 1;
                                            const chooserId = nextChooser!.id;
                                            updateGame(prev => {
                                                if (!prev) return null;
                                                const rounds = [...prev.rounds];
                                                rounds[roundIndex] = { ...rounds[roundIndex], penaltyChoices: { ...(rounds[roundIndex].penaltyChoices || {}), [chooserId]: p.id } };
                                                const players = prev.players.map(pl => pl.id === p.id ? { ...pl, penalties: pl.penalties + 1 } : pl);
                                                return { ...prev, rounds, players };
                                            });
                                        }}
                                        className="py-3 px-4 rounded-xl bg-slate-800 border border-slate-600 font-bold text-sm hover:bg-amber-500/20 hover:border-amber-500/50 transition-colors"
                                    >
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                        </Card>
                    ) : (
                        <Card className="bg-amber-500/10 border-amber-500/30">
                            {roundWinners.map(winner => {
                                const targetId = penaltyChoices[winner.id];
                                const target = game.players.find(p => p.id === targetId);
                                return (
                                    <p key={winner.id} className="text-center text-sm font-bold uppercase text-amber-500">
                                        {winner.name} → Strafe an {target?.name}
                                    </p>
                                );
                            })}
                            <p className="text-center text-xs text-slate-400 mt-1">{roundLoser?.name} trinkt mit den Strafen-Empfängern einen Kurzen.</p>
                        </Card>
                    )}
                    <PlacementCard
                        players={(() => {
                            const sorted = [...game.players].sort((a, b) => calculateAverageDeviation(a.deviations) - calculateAverageDeviation(b.deviations));
                            const prevSorted = [...game.players].sort((a, b) => calculateAverageDeviation(a.deviations.slice(0, -1)) - calculateAverageDeviation(b.deviations.slice(0, -1)));
                            const prevRank: Record<string, number> = Object.fromEntries(prevSorted.map((p, i) => [p.id, i]));
                            return sorted.map((p, currIdx) => ({
                                id: p.id,
                                name: p.name,
                                averageDeviation: calculateAverageDeviation(p.deviations),
                                penalties: p.penalties,
                                penaltiesGiven: getPenaltiesGiven(p.id, game.players, game.rounds),
                                rankChange: p.deviations.length > 1 ? prevRank[p.id] - currIdx : undefined,
                            }));
                        })()}
                    />
                    <Button
                        onClick={() => { const currentMin = Math.min(...game.players.map(p => p.weights.slice(-1)[0])); const bottleCfg = BOTTLE_SIZES[game.bottleSize] ?? BOTTLE_SIZES['0.5']; const maxDrunk = Math.max(...game.players.map(p => (p.weights[0] || 0) - p.weights.slice(-1)[0])); const isFinished = currentMin < bottleCfg.finishedThreshold || maxDrunk >= bottleCfg.liquidWeight; updateGame(p => p ? {...p, status: isFinished ? GameStatus.FINISHED : GameStatus.SETTING_TARGET, currentRoundIndex: p.currentRoundIndex + 1} : null); }}
                        disabled={!allChosen}
                        className="w-full py-4 font-bungee"
                    >
                        NÄCHSTE RUNDE
                    </Button>
                </div>
                );
            })()}

            {game.status === GameStatus.FINISHED && (
                <Card className="text-center py-10"><div className="text-6xl mb-4">🏆</div><h2 className="text-3xl font-bungee text-amber-500 mb-8 uppercase">Finale</h2><div className="space-y-2 mb-8">{[...game.players].sort((a, b) => calculateAverageDeviation(a.deviations) - calculateAverageDeviation(b.deviations)).map((p, idx) => (<div key={p.id} className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between"><div className="font-bungee text-slate-600">#{idx + 1}</div><div className="font-bold">{p.name}</div><div className="font-bungee">{calculateAverageDeviation(p.deviations)} g</div></div>))}</div><Button onClick={() => updateGame(() => null)} className="w-full py-4 font-bungee">MENÜ</Button></Card>
            )}
        </div>
      )}
      {/* ─── DEV PANEL ─────────────────────────────────────────────── */}
      {devMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 border-t border-amber-500/30 backdrop-blur-sm px-3 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest shrink-0">⚙ DEV</span>
          <div className="w-px h-4 bg-slate-700 shrink-0" />
          <div className="flex gap-1 flex-wrap flex-1">
            <button
              onClick={() => { setViewMode(ViewMode.HOST); setViewerPlayerId(null); }}
              className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-colors ${viewMode === ViewMode.HOST ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >Host</button>
            {game?.players.map(p => (
              <button
                key={p.id}
                onClick={() => { setViewMode(ViewMode.PLAYER); setViewerPlayerId(p.id); }}
                className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-colors ${viewMode === ViewMode.PLAYER && viewerPlayerId === p.id ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              >{p.name}</button>
            ))}
          </div>
          <button
            onClick={loadDemoGame}
            title="Demo zurücksetzen"
            className="text-[10px] font-bold text-slate-600 hover:text-slate-400 uppercase px-1 ml-auto shrink-0"
          >↺ RESET</button>
        </div>
      )}

      {showCheers && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="flex flex-col items-center bg-slate-800/30 backdrop-blur-md border border-slate-700 rounded-3xl p-8 shadow-xl">
            <p className="text-6xl font-bungee text-amber-400 mb-2 drop-shadow-lg">Prost!</p>
            <Lottie
              animationData={cheersAnimation}
              loop={false}
              style={{ width: 280, height: 280 }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

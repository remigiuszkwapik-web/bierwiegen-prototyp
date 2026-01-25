
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Game, GameStatus, Player, Round, ViewMode, Reaction } from './types';
import { SupabaseGameRepository } from './repositories/GameRepository';
import { Card, Button, Input, BeerProgressBar, FloatingReaction, EmojiBar, PlacementCard } from './components/UI';
import { MIN_DRINK_DIFF, MAX_DRINK_DIFF } from './constants';
import { 
  calculateAverageDeviation, 
  getPlayerPerformanceTag, 
  getDrinkingProgress,
  generateGameCode
} from './services/GameLogic';

const repo = new SupabaseGameRepository();

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
  
  const [newPlayerName, setNewPlayerName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [drinkAmountInput, setDrinkAmountInput] = useState<string>('');
  
  const gameRef = useRef<Game | null>(null);
  useEffect(() => { gameRef.current = game; }, [game]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) setJoinCodeInput(code.toUpperCase());
  }, []);

  useEffect(() => {
    if (!game?.gameCode) return;

    const channel = repo.getChannel(game.gameCode);
    
    const subscription = repo.subscribeToGame(game.gameCode, (updatedGame) => {
      if (!updatedGame) {
          setGame(null);
          setViewMode(null);
          setViewerPlayerId(null);
          return;
      }
      if (JSON.stringify(gameRef.current) !== JSON.stringify(updatedGame)) {
        setGame(updatedGame);
        if (updatedGame.hostId === myUserId && viewMode !== ViewMode.HOST) {
            setViewMode(ViewMode.HOST);
        }
      }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const userIds = Object.values(state).flat().map((p: any) => p.userId);
        setPresentUsers(userIds);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId: myUserId });
        }
      });

    return () => {
      subscription.unsubscribe();
      channel.unsubscribe();
    };
  }, [game?.gameCode, myUserId, viewMode]);

  const updateGame = useCallback(async (updater: (prev: Game | null) => Game | null) => {
    const prev = gameRef.current;
    const next = updater(prev);
    
    if (next) {
      setGame(next);
      await repo.saveGame(next);
    } else {
      if (prev) {
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
      reactions: [],
      declinedHostIds: []
    };
    setViewMode(ViewMode.HOST);
    updateGame(() => newGame);
  };

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

  if (!game) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full text-center py-12">
          <h1 className="text-5xl font-bungee text-amber-500 mb-2">BIERWIEGEN</h1>
          <p className="text-slate-400 mb-10 text-lg font-bold uppercase tracking-tighter">Multiplayer</p>
          <div className="space-y-4">
            <Button onClick={createGame} className="w-full py-5 text-xl">HOSTEN</Button>
            <Input placeholder="CODE" value={joinCodeInput} onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())} className="text-center font-bungee text-3xl tracking-widest" />
            <Button onClick={joinGame} variant="secondary" className="w-full py-4">BEITRETEN</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
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

      {viewMode === ViewMode.PLAYER ? (
        <div className="p-4 max-w-2xl mx-auto space-y-6">
            {!viewerPlayerId ? (
                <Card className="mt-20"><h2 className="text-xl font-bungee text-center mb-6">WER BIST DU?</h2><div className="grid gap-2">{game.players.map(p => (<button key={p.id} onClick={() => { setViewerPlayerId(p.id); if(!p.userId) updateGame(prev => prev ? {...prev, players: prev.players.map(pl => pl.id === p.id ? {...pl, userId: myUserId} : pl)} : null); }} className="p-4 bg-slate-900/60 rounded-xl border border-slate-700 font-bold text-left flex justify-between">{p.name} <span className="text-amber-500">→</span></button>))}</div></Card>
            ) : (
                <>
                    <header className="flex justify-between items-end"><div><p className="text-[10px] text-slate-500 font-bold uppercase">Spieler</p><h1 className="text-2xl font-bungee text-amber-500">{game.players.find(p => p.id === viewerPlayerId)?.name}</h1></div><div className="text-right text-xs font-bold text-slate-500 uppercase">Code: {game.gameCode}</div></header>
                    <Card className="flex items-center gap-6 border-slate-700">
                        <BeerProgressBar progress={getDrinkingProgress(game.players.find(p => p.id === viewerPlayerId)?.weights.slice(-1)[0] || 0, game.players.find(p => p.id === viewerPlayerId)?.weights[0] || 0)} />
                        <div className="flex-1">
                          <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Gewicht</div>
                          <div className="text-4xl font-bungee text-white mb-2">{game.players.find(p => p.id === viewerPlayerId)?.weights.slice(-1)[0] || 0}g</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                            {getPlayerPerformanceTag(game.players.find(p => p.id === viewerPlayerId)!, game.players).icon} {getPlayerPerformanceTag(game.players.find(p => p.id === viewerPlayerId)!, game.players).label}
                          </div>
                        </div>
                    </Card>
                    {game.status === GameStatus.DRINKING && (
                        <Card className="border-amber-500/50 text-center py-10">
                          <h2 className="text-xs font-bold text-amber-500 uppercase mb-2">Ziel</h2>
                          <div className="text-6xl font-bungee text-white mb-2">{game.rounds.slice(-1)[0]?.targetWeight}g</div>
                          <p className="text-slate-400 text-[10px] font-bold uppercase">Noch {(game.players.find(p => p.id === viewerPlayerId)?.weights.slice(-1)[0] || 0) - (game.rounds.slice(-1)[0]?.targetWeight || 0)}g</p>
                        </Card>
                    )}
                    <Card><h2 className="text-xs font-bold text-slate-500 uppercase mb-4">Ranking</h2><div className="space-y-2">{[...game.players].sort((a,b) => calculateAverageDeviation(a.deviations) - calculateAverageDeviation(b.deviations)).map((p, idx) => (<div key={p.id} className={`p-3 rounded-xl ${p.id === viewerPlayerId ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-slate-900/40'}`}><div className="flex justify-between items-center relative"><div className="flex items-center gap-2"><span className="font-bungee text-slate-600 text-[10px]">#{idx+1}</span><span className="font-bold text-sm">{p.name}</span><div className="relative">{game.reactions?.filter(r => r.targetPlayerId === p.id).map(r => <FloatingReaction key={r.id} emoji={r.emoji} />)}</div></div><div className="font-bungee text-xs">{calculateAverageDeviation(p.deviations)}g</div></div>{p.id !== viewerPlayerId && <div className="mt-2 flex justify-end"><EmojiBar onReact={(emoji) => { updateGame(prev => { if(!prev) return null; return { ...prev, reactions: [...(prev.reactions || []), { id: Math.random().toString(36).substr(2, 9), emoji, targetPlayerId: p.id, timestamp: Date.now() }] }; }); }} /></div>}</div>))}</div></Card>
                </>
            )}
        </div>
      ) : (
        <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-8">
            <header className="flex justify-between items-center">
                <div><h1 className="text-xl font-bungee text-amber-500">HOST MODE</h1><p className="text-[10px] text-slate-500 font-bold uppercase">Code: {game.gameCode}</p></div>
                <div className="flex gap-4 items-center">
                  <button onClick={() => { const url = new URL(window.location.href); url.searchParams.set('code', game.gameCode); navigator.clipboard.writeText(url.toString()); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); }} className={`text-[10px] font-bold uppercase ${copyFeedback ? 'text-green-500' : 'text-slate-400'}`}>{copyFeedback ? 'Kopiert' : 'Link'}</button>
                  <button onClick={() => { if(window.confirm("Spiel wirklich beenden?")) updateGame(() => null); }} className="text-red-500 font-bold text-[10px] uppercase underline">Beenden</button>
                </div>
            </header>

            {game.status === GameStatus.SETUP && (
                <div className="space-y-6">
                    <Card><h2 className="text-lg font-bold mb-4 uppercase">Spieler</h2><div className="flex gap-2 mb-4"><Input value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} placeholder="Name..." className="flex-1" onKeyPress={(e) => e.key === 'Enter' && (newPlayerName.trim() && updateGame(p => p ? {...p, players: [...p.players, { id: Math.random().toString(36).substr(2, 9), name: newPlayerName.trim(), weights: [], deviations: [], penalties: 0 }]} : null), setNewPlayerName(''))} /><Button onClick={() => { if(!newPlayerName.trim()) return; updateGame(p => p ? {...p, players: [...p.players, { id: Math.random().toString(36).substr(2, 9), name: newPlayerName.trim(), weights: [], deviations: [], penalties: 0 }]} : null); setNewPlayerName(''); }}>Add</Button></div><div className="space-y-1">{game.players.map(p => (<div key={p.id} className="flex justify-between p-3 bg-slate-900/40 rounded-xl"><span className="font-bold">{p.name}</span><button onClick={() => updateGame(prev => prev ? { ...prev, players: prev.players.filter(pl => pl.id !== p.id) } : null)} className="text-red-500">✕</button></div>))}</div></Card>
                    <Button onClick={() => updateGame(p => p ? {...p, status: GameStatus.WEIGHING_INITIAL} : null)} disabled={game.players.length < 1} className="w-full py-4 text-xl font-bungee">START</Button>
                </div>
            )}

            {game.status === GameStatus.WEIGHING_INITIAL && (
                <Card><h2 className="text-xl font-bungee text-center mb-6 uppercase">Initialwiegen</h2><div className="space-y-3 mb-6">{game.players.map(p => (<div key={p.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-xl"><div className="font-bold">{p.name}</div><div className="flex items-center gap-2"><Input type="number" value={inputs[p.id] || ''} onChange={(e) => setInputs({...inputs, [p.id]: e.target.value})} placeholder="000" className="w-20 text-center font-bungee" /><span className="text-slate-500 text-[10px] font-bold uppercase">g</span></div></div>))}</div><Button onClick={() => { if(!game.players.every(p => inputs[p.id])) return; updateGame(prev => { if(!prev) return null; return { ...prev, status: GameStatus.SETTING_TARGET, players: prev.players.map(p => ({...p, weights: [parseInt(inputs[p.id])]})) }; }); setInputs({}); }} className="w-full py-4 font-bungee">FERTIG</Button></Card>
            )}

            {game.status === GameStatus.SETTING_TARGET && (
                <Card className="text-center"><h2 className="text-xl font-bungee mb-6 uppercase">Ziel wählen</h2>
                  <div className="bg-slate-900 p-6 rounded-2xl mb-6">
                    <div className="text-[10px] font-bold text-amber-500 uppercase mb-1">Entscheider (Leerste Flasche)</div>
                    <div className="text-xl font-bold text-white mb-4">{minWeightPlayer?.name || '---'}</div>
                    <hr className="border-slate-800 mb-4" />
                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Referenz (Vollstes Bier)</div>
                    <div className="text-4xl font-bungee text-white">{Math.max(...game.players.map(p => p.weights.slice(-1)[0]))}g</div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex gap-2">{[30, 50, 100].map(val => <button key={val} onClick={() => setDrinkAmountInput(val.toString())} className={`flex-1 py-3 rounded-xl font-bungee border-2 transition-colors ${drinkAmountInput === val.toString() ? 'bg-amber-500 border-amber-400 text-slate-900' : 'bg-slate-800 border-slate-700'}`}>{val}g</button>)}</div>
                    <Input type="number" value={drinkAmountInput} onChange={(e) => setDrinkAmountInput(e.target.value)} placeholder="Menge..." className="text-center" />
                    <Button onClick={() => { const amount = parseInt(drinkAmountInput); if(!amount) return; updateGame(prev => { if(!prev) return null; const currentMax = Math.max(...prev.players.map(p => p.weights.slice(-1)[0])); return { ...prev, status: GameStatus.DRINKING, rounds: [...prev.rounds, { roundNumber: prev.rounds.length + 1, targetWeight: currentMax - amount, chooserPlayerId: '', initialWeights: {}, finalWeights: {} }] }; }); setDrinkAmountInput(''); }} className="w-full py-4 font-bungee">RUNDE STARTEN</Button>
                  </div>
                </Card>
            )}

            {game.status === GameStatus.DRINKING && (
                <Card className="text-center py-12"><h2 className="text-4xl font-bungee mb-4 text-amber-500 uppercase">Prost!</h2><p className="text-slate-500 font-bold uppercase text-xs mb-1">Ziel</p><div className="text-7xl font-bungee text-white mb-10">{game.rounds.slice(-1)[0]?.targetWeight}g</div><Button onClick={() => updateGame(p => p ? {...p, status: GameStatus.WEIGHING_FINAL} : null)} className="w-full py-4 font-bungee">WIEGEN</Button></Card>
            )}

            {game.status === GameStatus.WEIGHING_FINAL && (
                <Card><h2 className="text-xl font-bungee text-center mb-6 uppercase">Endwiegen</h2><div className="space-y-3 mb-6">{game.players.map(p => (<div key={p.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-xl"><div className="font-bold">{p.name}</div><div className="flex items-center gap-2"><Input type="number" value={inputs[p.id] || ''} onChange={(e) => setInputs({...inputs, [p.id]: e.target.value})} placeholder="000" className="w-20 text-center font-bungee" /><span className="text-slate-500 text-[10px] font-bold uppercase">g</span></div></div>))}</div><Button onClick={() => { if(!game.players.every(p => inputs[p.id])) return; updateGame(prev => { if(!prev) return null; const target = prev.rounds.slice(-1)[0].targetWeight; return { ...prev, status: GameStatus.ROUND_RESULT, players: prev.players.map(p => ({...p, weights: [...p.weights, parseInt(inputs[p.id])], deviations: [...p.deviations, Math.abs(parseInt(inputs[p.id]) - target)]})) }; }); setInputs({}); }} className="w-full py-4 font-bungee">AUSWERTEN</Button></Card>
            )}

            {game.status === GameStatus.ROUND_RESULT && (
                <div className="space-y-4">
                    <Card><h2 className="text-xl font-bungee text-center mb-6 uppercase">Ergebnis</h2><div className="space-y-3">{[...game.players].sort((a,b) => (a.deviations.slice(-1)[0] || 0) - (b.deviations.slice(-1)[0] || 0)).map((p, idx) => { 
                      const target = game.rounds.slice(-1)[0].targetWeight; 
                      const final = p.weights.slice(-1)[0]; 
                      const diff = final - target; 
                      const isAbove = diff > 0;

                      return (
                        <div key={p.id} className={`p-4 rounded-xl border flex justify-between items-center ${idx === 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-slate-900/40 border-slate-700'}`}>
                          <div className="font-bold">{p.name}</div>
                          <div className="text-right">
                            <div className={`font-bungee text-xl ${diff === 0 ? 'text-green-400' : isAbove ? 'text-red-400' : 'text-blue-400'}`}>{isAbove ? '+' : ''}{diff}g</div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold">{diff === 0 ? 'PUNKTGELANDET' : isAbove ? 'ZU WENIG GETRUNKEN' : 'ZU VIEL GETRUNKEN'}</div>
                          </div>
                        </div>
                      ); 
                    })}</div></Card>
                    <PlacementCard
                      players={[...game.players]
                        .sort((a, b) => calculateAverageDeviation(a.deviations) - calculateAverageDeviation(b.deviations))
                        .map(p => ({ id: p.id, name: p.name, averageDeviation: calculateAverageDeviation(p.deviations) }))}
                    />
                    <Button onClick={() => { const currentMin = Math.min(...game.players.map(p => p.weights.slice(-1)[0])); updateGame(p => p ? {...p, status: currentMin < 100 ? GameStatus.FINISHED : GameStatus.SETTING_TARGET, currentRoundIndex: p.currentRoundIndex + 1} : null); }} className="w-full py-4 font-bungee">NÄCHSTE RUNDE</Button>
                </div>
            )}

            {game.status === GameStatus.FINISHED && (
                <Card className="text-center py-10"><div className="text-6xl mb-4">🏆</div><h2 className="text-3xl font-bungee text-amber-500 mb-8 uppercase">Finale</h2><div className="space-y-2 mb-8">{[...game.players].sort((a, b) => calculateAverageDeviation(a.deviations) - calculateAverageDeviation(b.deviations)).map((p, idx) => (<div key={p.id} className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between"><div className="font-bungee text-slate-600">#{idx + 1}</div><div className="font-bold">{p.name}</div><div className="font-bungee">{calculateAverageDeviation(p.deviations)}g</div></div>))}</div><Button onClick={() => updateGame(() => null)} className="w-full py-4 font-bungee">MENÜ</Button></Card>
            )}
        </div>
      )}
    </div>
  );
};

export default App;

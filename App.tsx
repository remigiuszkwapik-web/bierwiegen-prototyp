
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Lottie from 'lottie-react';
import cheersAnimation from './src/assets/cheers.json';
import { Game, GameStatus, Player, Round, Reaction, Ping, BottleSize, DrinkType } from './types';
import { SupabaseGameRepository, isSupabaseConfigured } from './repositories/GameRepository';
import { Card, Button, Input, BeerProgressBar, FloatingReaction, EmojiBar, PlacementCard } from './components/UI';
import { BOTTLE_SIZES, DRINK_THEMES, DRINK_STORAGE_KEY, applyDrinkTheme } from './constants';
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

/** Kurze, eindeutige ID. (substr ist deprecated – slice leistet dasselbe.) */
const createId = () => Math.random().toString(36).slice(2, 11);

/** Voreingestellte Trinkmenge – muss zur Anzeige und zum Slider passen. */
const DEFAULT_DRINK_AMOUNT = 30;

/** Reaktionen sind fluechtig: aelteres wird weder gezeigt noch gespeichert. */
const REACTION_TTL_MS = 4000;
const recentReactions = (reactions: Reaction[] | undefined) =>
  (reactions ?? []).filter(r => Date.now() - r.timestamp < REACTION_TTL_MS);

/** Wie lange der gelbe Rahmen beim Angepingten bleibt – und wie lange man
 *  denselben Spieler nicht erneut anpingen kann. */
const PING_TTL_MS = 10000;
const PING_COOLDOWN_MS = 5000;

/** Letztes erfasstes Gewicht, oder null wenn der Spieler noch nicht gewogen hat. */
const lastWeight = (p: Player): number | null => {
  const w = p.weights[p.weights.length - 1];
  return typeof w === 'number' && Number.isFinite(w) ? w : null;
};

/** Niedrigstes bekanntes Gewicht aller Spieler – null, wenn noch keiner gewogen hat. */
const minLastWeight = (players: Player[]): number | null => {
  const weights = players.map(lastWeight).filter((w): w is number => w !== null);
  return weights.length ? Math.min(...weights) : null;
};

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
    { id: 'p1', name: 'Max',  weights: [755, 698, 648], deviations: [2,  2],  penalties: 0, userId: 'dev-host' },
    { id: 'p2', name: 'Anna', weights: [748, 694, 640], deviations: [6,  10], penalties: 1 },
    { id: 'p3', name: 'Ben',  weights: [752, 688, 643], deviations: [12, 7],  penalties: 1 },
    { id: 'p4', name: 'Lisa', weights: [745, 692, 635], deviations: [8,  15], penalties: 0 },
  ],
  rounds: [
    { roundNumber: 1, targetWeight: 700, chooserPlayerId: 'p4', initialWeights: {}, finalWeights: {}, penaltyTargetId: 'p2' },
    { roundNumber: 2, targetWeight: 650, chooserPlayerId: 'p4', initialWeights: {}, finalWeights: {}, penaltyTargetId: 'p3' },
  ],
  currentRoundIndex: 2,
  bottleSize: '0.5',
  pendingInitialWeights: {},
};
// ─────────────────────────────────────────────────────────────────────────────

const getUserId = () => {
    let id = localStorage.getItem('bierwiegen_user_id');
    if (!id) {
        id = createId();
        localStorage.setItem('bierwiegen_user_id', id);
    }
    return id;
};

const App: React.FC = () => {
  const myUserId = useMemo(() => getUserId(), []);
  const [game, setGame] = useState<Game | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [myDrink, setMyDrink] = useState<DrinkType>(() => {
    const saved = localStorage.getItem(DRINK_STORAGE_KEY) as DrinkType | null;
    return saved && saved in DRINK_THEMES ? saved : 'beer';
  });
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [devMode, setDevMode] = useState(IS_DEV_PARAM);
  const devModeRef = useRef(IS_DEV_PARAM);
  useEffect(() => { devModeRef.current = devMode; }, [devMode]);

  const [newPlayerName, setNewPlayerName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  // Nach der Namenswahl kommt ein eigener Schritt fürs Getränk.
  const [drinkStep, setDrinkStep] = useState(false);
  // Host hat in der Rangliste auf einen Spieler getippt → Dialog "entfernen?"
  const [removeCandidate, setRemoveCandidate] = useState<Player | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [weightInput, setWeightInput] = useState<string>('');
  const [drinkAmountInput, setDrinkAmountInput] = useState<string>('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [newGameMode, setNewGameMode] = useState<'host' | 'peer'>('peer');
  const [showCheers, setShowCheers] = useState(false);
  const [poppedBubbles, setPoppedBubbles] = useState<Set<number>>(new Set());
  const [resubscribeKey, setResubscribeKey] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [, setReactionTick] = useState(0);
  // Reaktionen sind fluechtige Deko und leben nur lokal – sie gehen per
  // Broadcast an die anderen Geraete, nicht mehr ueber die Spielzeile.
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const channelRef = useRef<ReturnType<typeof repo.subscribeToGame> | null>(null);
  // Pings pro Spieler-ID: wann zuletzt angepingt und von wem. Lebt nur lokal.
  const [pings, setPings] = useState<Record<string, { at: number; from: string }>>({});

  const gameRef = useRef<Game | null>(null);
  useEffect(() => { gameRef.current = game; }, [game]);

  // Speicherfehler an die Oberflaeche holen: vorher divergierte der lokale
  // Stand still und leise von der Datenbank.
  useEffect(() => {
    repo.onError = (msg) => setSyncError(msg);
    return () => { repo.onError = null; };
  }, []);

  // Abgelaufene Pings ausblenden (Rahmen weg, Anpingen wieder möglich).
  const hasPings = Object.keys(pings).length > 0;
  useEffect(() => {
    if (!hasPings) return;
    const t = setInterval(() => {
      const now = Date.now();
      setPings(prev => {
        const alive = Object.entries(prev).filter(([, p]) => now - p.at < PING_TTL_MS);
        return alive.length === Object.keys(prev).length ? prev : Object.fromEntries(alive);
      });
      setReactionTick(n => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [hasPings]);

  // Abgelaufene Reaktionen ausblenden, ohne auf den naechsten State-Wechsel zu warten.
  useEffect(() => {
    if (recentReactions(reactions).length === 0) return;
    const t = setTimeout(() => setReactionTick(n => n + 1), REACTION_TTL_MS);
    return () => clearTimeout(t);
  }, [reactions]);

  // Fix: Prost-Overlay beim Status-Wechsel weg von DRINKING zurücksetzen
  useEffect(() => {
    if (game?.status === GameStatus.DRINKING) {
      setShowCheers(true);
      const timer = setTimeout(() => setShowCheers(false), 3000);
      return () => {
        clearTimeout(timer);
        setShowCheers(false);
      };
    }
  }, [game?.status]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) setJoinCodeInput(code.toUpperCase());
  }, []);

  // Farbschema: gilt nur auf diesem Gerät, wird lokal gemerkt
  useEffect(() => {
    applyDrinkTheme(myDrink);
    localStorage.setItem(DRINK_STORAGE_KEY, myDrink);
  }, [myDrink]);

  // Session-Persistenz: myPlayerId in localStorage speichern
  useEffect(() => {
    if (myPlayerId) {
      localStorage.setItem('bierwiegen_player_id', myPlayerId);
    } else {
      localStorage.removeItem('bierwiegen_player_id');
    }
  }, [myPlayerId]);

  // Eigener Spieler ist verschwunden (vom Host entfernt oder beim Beitritt
  // überschrieben): zurück zum Eintragen, Name bleibt vorausgefüllt.
  useEffect(() => {
    if (!game || !myPlayerId) return;
    if (game.players.some(p => p.id === myPlayerId)) return;
    setMyPlayerId(null);
    setJoinError(game.status === GameStatus.SETUP
      ? 'Du bist nicht mehr in der Lobby – trag dich einfach nochmal ein.'
      : 'Der Host hat dich aus dem Spiel genommen.');
  }, [game, myPlayerId]);

  // Session-Persistenz: beim Start automatisch wiederherstellen
  useEffect(() => {
    if (IS_DEV_PARAM) return;
    const savedCode = localStorage.getItem('bierwiegen_last_session');
    const savedPlayerId = localStorage.getItem('bierwiegen_player_id');
    if (!savedCode) return;
    repo.loadGame(savedCode).then(loaded => {
      if (loaded) {
        setGame(loaded);
        if (savedPlayerId && loaded.players.some(p => p.id === savedPlayerId)) {
          setMyPlayerId(savedPlayerId);
        }
      } else {
        localStorage.removeItem('bierwiegen_last_session');
        localStorage.removeItem('bierwiegen_player_id');
      }
    }).catch(() => {
      // Kein Netz / DB nicht erreichbar: gespeicherte Sitzung behalten,
      // damit ein spaeterer Versuch sie noch wiederherstellen kann.
      setSyncError('Gespeicherte Sitzung konnte nicht geladen werden.');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reconnect: bei Tab-Wechsel zurück frischen Stand laden + neu subscriben
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && gameRef.current?.gameCode && !devModeRef.current) {
        const fresh = await repo.loadGame(gameRef.current.gameCode);
        if (fresh) setGame(fresh);
        setResubscribeKey(k => k + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    if (!game?.gameCode) return;
    if (devModeRef.current) return;

    const channel = repo.subscribeToGame(
      game.gameCode,
      (updatedGame) => {
        if (!updatedGame) {
          setGame(null);
          setMyPlayerId(null);
          return;
        }
        if (JSON.stringify(gameRef.current) !== JSON.stringify(updatedGame)) {
          setGame(updatedGame);
        }
      },
      (reaction) => setReactions(prev => [...recentReactions(prev), reaction]),
      (ping) => setPings(prev => ({ ...prev, [ping.targetPlayerId]: { at: Date.now(), from: ping.fromName } })),
    );
    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      channel.unsubscribe();
    };
  }, [game?.gameCode, resubscribeKey]);

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
      setMyPlayerId(null);
    }
  }, []);

  /**
   * Wie updateGame, aber auf dem frisch geladenen DB-Stand. In der Lobby
   * schreiben mehrere Geräte gleichzeitig (jeder trägt sich selbst ein) –
   * mit dem lokalen, evtl. veralteten Stand würde man frisch beigetretene
   * Spieler wieder überschreiben.
   */
  const updateGameFresh = useCallback(async (updater: (prev: Game | null) => Game | null) => {
    const code = gameRef.current?.gameCode;
    if (code && !devModeRef.current) {
      try {
        const fresh = await repo.loadGame(code);
        if (fresh) gameRef.current = fresh;
      } catch { /* offline: mit lokalem Stand weitermachen */ }
    }
    await updateGame(updater);
  }, [updateGame]);

  const isNameTaken = (players: Player[], name: string) =>
    players.some(p => p.name.trim().toLowerCase() === name.trim().toLowerCase());

  const addPlayer = () => {
    const name = newPlayerName.trim();
    if (!name) return;
    if (game && isNameTaken(game.players, name)) { alert('Den Namen gibt es schon.'); return; }
    updateGameFresh(p => p ? {
      ...p,
      players: isNameTaken(p.players, name) ? p.players
        : [...p.players, { id: createId(), name, weights: [], deviations: [], penalties: 0 }],
    } : null);
    setNewPlayerName('');
  };

  /**
   * Selbst in der Lobby eintragen: Spieler anlegen (oder einen freien Spieler
   * gleichen Namens übernehmen) und direkt an dieses Gerät binden.
   * Weil jedes Gerät die ganze Spielzeile schreibt, kann ein zeitgleicher
   * Beitritt den eigenen überschreiben – darum danach nachprüfen und bei
   * Bedarf erneut eintragen.
   */
  const joinAsPlayer = async () => {
    const name = joinName.trim();
    const code = gameRef.current?.gameCode;
    if (!name || !code || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const fresh = devModeRef.current ? gameRef.current : await repo.loadGame(code);
        if (!fresh) { setJoinError('Den Raum gibt es nicht mehr.'); return; }
        if (fresh.status !== GameStatus.SETUP) { setJoinError('Das Spiel läuft schon – wähle unten deinen Spieler.'); return; }

        const existing = fresh.players.find(p => p.name.trim().toLowerCase() === name.toLowerCase());
        if (existing?.userId && existing.userId !== myUserId) {
          setJoinError('Der Name ist schon vergeben.');
          return;
        }
        const id = existing?.id ?? createId();
        const players = existing
          ? fresh.players.map(p => p.id === id ? { ...p, userId: myUserId } : p)
          : [...fresh.players, { id, name, weights: [], deviations: [], penalties: 0, userId: myUserId }];
        await updateGame(() => ({ ...fresh, players }));

        if (devModeRef.current) { setMyPlayerId(id); setDrinkStep(true); setJoinName(''); return; }

        // Kurz warten, bis evtl. zeitgleiche Schreibvorgänge durch sind, dann prüfen.
        await new Promise(r => setTimeout(r, 600));
        const check = await repo.loadGame(code);
        if (check?.players.some(p => p.id === id && p.userId === myUserId)) {
          setGame(check);
          setMyPlayerId(id);
          setDrinkStep(true);
          setJoinName('');
          return;
        }
      }
      setJoinError('Beitreten hat nicht geklappt – bitte nochmal versuchen.');
    } catch {
      setJoinError('Keine Verbindung zur Datenbank. Bitte nochmal versuchen.');
    } finally {
      setJoining(false);
    }
  };

  const createGame = () => {
    const newGame: Game = {
      id: createId(),
      gameCode: generateGameCode(),
      hostId: myUserId,
      createdAt: Date.now(),
      isFinished: false,
      status: GameStatus.SETUP,
      players: [],
      rounds: [],
      currentRoundIndex: 0,
      bottleSize: '0.5',
          pendingInitialWeights: {},
      mode: newGameMode,
    };
    updateGame(() => newGame);
  };

  /**
   * Host nimmt einen Spieler aus dem laufenden Spiel, damit die anderen nicht
   * auf ihn warten müssen. Seine bisherigen Werte verschwinden mit ihm; wer
   * wiegt, das Ziel wählt oder die Strafe vergibt, ergibt sich danach
   * automatisch aus den verbliebenen Spielern.
   */
  const removePlayer = (playerId: string) => updateGameFresh(prev => {
    if (!prev) return null;
    const players = prev.players.filter(p => p.id !== playerId);
    if (players.length === prev.players.length || players.length === 0) return prev;
    const pendingInitialWeights = { ...(prev.pendingInitialWeights ?? {}) };
    delete pendingInitialWeights[playerId];
    // Hatte der Entfernte gerade die Strafe bekommen, wird sie neu vergeben.
    const lastIdx = prev.rounds.length - 1;
    const rounds = prev.status === GameStatus.ROUND_RESULT && prev.rounds[lastIdx]?.penaltyTargetId === playerId
      ? prev.rounds.map((r, i) => i === lastIdx ? { ...r, penaltyTargetId: undefined } : r)
      : prev.rounds;
    return { ...prev, players, pendingInitialWeights, rounds };
  });

  const loadDemoGame = useCallback(() => {
    devModeRef.current = true;
    setDevMode(true);
    setGame({ ...DEMO_GAME, createdAt: Date.now() });
    setMyPlayerId('p1');
    setWeightInput('');
    setDrinkAmountInput('');
  }, []);

  useEffect(() => {
    if (IS_DEV_PARAM) loadDemoGame();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const joinGame = async () => {
    const code = joinCodeInput.toUpperCase().trim();
    if (!code) return;
    try {
      const loaded = await repo.loadGame(code);
      if (loaded) {
        setGame(loaded);
      } else {
        alert("Raum nicht gefunden!");
      }
    } catch {
      alert("Keine Verbindung zur Datenbank. Prüfe deine Internetverbindung und versuch es erneut.");
    }
  };

  // Derived helpers
  const isCreator = game?.hostId === myUserId;
  const myPlayer = game?.players.find(p => p.id === myPlayerId) ?? null;

  const minWeightPlayer = useMemo(() => {
    if (!game || game.players.length === 0) return null;
    const weighed = game.players.filter(p => lastWeight(p) !== null);
    if (weighed.length === 0) return null;
    return [...weighed].sort((a, b) => lastWeight(a)! - lastWeight(b)!)[0];
  }, [game]);

  const chooserIsMe = useMemo(() => {
    if (!minWeightPlayer || !myPlayerId) return false;
    return minWeightPlayer.id === myPlayerId;
  }, [minWeightPlayer, myPlayerId]);

  const goBack = () => {
    setWeightInput('');
    setDrinkAmountInput('');
    setInputs({});
    updateGame(prev => {
      if (!prev) return null;
      switch (prev.status) {
        case GameStatus.WEIGHING_INITIAL:
          return { ...prev, status: GameStatus.SETUP, players: prev.players.map(p => ({ ...p, weights: [] })), pendingInitialWeights: {} };
        case GameStatus.SETTING_TARGET:
          if (prev.rounds.length === 0) {
            return { ...prev, status: GameStatus.WEIGHING_INITIAL, players: prev.players.map(p => ({ ...p, weights: [] })), pendingInitialWeights: {} };
          }
          return { ...prev, status: GameStatus.ROUND_RESULT };
        case GameStatus.DRINKING:
          return { ...prev, status: GameStatus.SETTING_TARGET, rounds: prev.rounds.slice(0, -1) };
        case GameStatus.WEIGHING_FINAL:
          return { ...prev, status: GameStatus.DRINKING };
        case GameStatus.ROUND_RESULT: {
          const lastRound = prev.rounds[prev.rounds.length - 1];
          const penaltyTargetId = lastRound?.penaltyTargetId;
          return {
            ...prev,
            status: GameStatus.WEIGHING_FINAL,
            players: prev.players.map(p => ({
              ...p,
              weights: p.weights.slice(0, -1),
              deviations: p.deviations.slice(0, -1),
              penalties: p.id === penaltyTargetId ? p.penalties - 1 : p.penalties,
            })),
            rounds: prev.rounds.map((r, i) =>
              i === prev.rounds.length - 1 ? { ...r, penaltyTargetId: undefined, finalWeights: {} } : r
            ),
          };
        }
        default:
          return prev;
      }
    });
  };

  // Auto-advance WEIGHING_INITIAL when all players submitted (peer mode only)
  useEffect(() => {
    if (!game || game.status !== GameStatus.WEIGHING_INITIAL) return;
    if (game.mode === 'host') return;
    const pending = game.pendingInitialWeights ?? {};
    const allSubmitted = game.players.length > 0 && game.players.every(p => pending[p.id] !== undefined);
    if (allSubmitted) {
      updateGame(prev => {
        if (!prev) return null;
        const weights = prev.pendingInitialWeights ?? {};
        return {
          ...prev,
          status: GameStatus.SETTING_TARGET,
          players: prev.players.map(p => ({ ...p, weights: [weights[p.id]] })),
          pendingInitialWeights: {},
        };
      });
    }
  }, [game?.pendingInitialWeights, game?.status, game?.players.length]);

  // Auto-advance WEIGHING_FINAL when all players submitted (peer mode only)
  useEffect(() => {
    if (!game || game.status !== GameStatus.WEIGHING_FINAL) return;
    if (game.mode === 'host') return;
    const currentRound = game.rounds.slice(-1)[0];
    if (!currentRound) return;
    const allSubmitted = game.players.length > 0 && game.players.every(p => currentRound.finalWeights[p.id] !== undefined);
    if (allSubmitted) {
      updateGame(prev => {
        if (!prev) return null;
        const target = prev.rounds.slice(-1)[0].targetWeight;
        const finalWeights = prev.rounds.slice(-1)[0].finalWeights;
        return {
          ...prev,
          status: GameStatus.ROUND_RESULT,
          players: prev.players.map(p => ({
            ...p,
            weights: [...p.weights, finalWeights[p.id]],
            deviations: [...p.deviations, Math.abs(finalWeights[p.id] - target)],
          })),
        };
      });
    }
  }, [game?.rounds, game?.status, game?.players.length]);

  // ─── SCREENS ─────────────────────────────────────────────────────────────────

  // Ohne Supabase-Konfiguration blieb die Seite frueher komplett weiss, weil
  // createClient() schon beim Import warf. Jetzt gibt es eine klare Ansage –
  // der Dev-Mode braucht die Datenbank ohnehin nicht und bleibt nutzbar.
  if (!isSupabaseConfigured && !devMode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <div className="text-5xl mb-4">🔌</div>
          <h1 className="text-xl font-bungee mb-3 uppercase">Nicht konfiguriert</h1>
          <p className="text-slate-400 text-sm mb-4">
            Die Verbindung zur Datenbank fehlt. Lege im Projektordner eine Datei
            <span className="font-bungee text-amber-500"> .env </span>
            an und trage dort ein:
          </p>
          <pre className="text-left text-[11px] bg-slate-900 border border-slate-700 rounded-xl p-3 mb-4 overflow-x-auto text-slate-300">VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...</pre>
          <p className="text-slate-500 text-xs mb-6">Eine Vorlage liegt als <span className="font-bold">.env.example</span> bei. Danach den Dev-Server neu starten.</p>
          <Button variant="secondary" onClick={loadDemoGame} className="w-full">Ohne Datenbank ausprobieren (Demo)</Button>
        </Card>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="h-screen flex flex-col px-6 pt-6 pb-52 relative overflow-hidden">

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
                backgroundColor: 'var(--ac)',
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
        <div className="relative z-20 text-center">
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
                  fill="var(--ac)"
                />
              </svg>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Lobby / Player selection screen ──────────────────────────────────────
  if (!myPlayerId) {
    const inSetup = game.status === GameStatus.SETUP;
    const leave = () => { setGame(null); setMyPlayerId(null); localStorage.removeItem('bierwiegen_last_session'); localStorage.removeItem('bierwiegen_player_id'); };
    const copyLink = () => { const url = new URL(window.location.href); url.searchParams.set('code', game.gameCode); navigator.clipboard.writeText(url.toString()); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); };
    const claimPlayer = (p: Player) => {
      setMyPlayerId(p.id);
      setDrinkStep(true);
      if (!p.userId) {
        updateGameFresh(prev => prev ? { ...prev, players: prev.players.map(pl => pl.id === p.id ? { ...pl, userId: myUserId } : pl) } : null);
      }
    };
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bungee">{inSetup ? 'LOBBY' : 'WER BIST DU?'}</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500 uppercase">Code: {game.gameCode}</span>
              <button onClick={leave} className="text-slate-600 font-bold text-[10px] uppercase hover:text-slate-400">✕ Verlassen</button>
            </div>
          </div>

          {/* Creator: Spieleinstellungen */}
          {isCreator && inSetup && (
            <div className="space-y-4 mb-6">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Modus</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateGameFresh(p => p ? { ...p, mode: 'peer' } : null)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase transition-colors ${game.mode !== 'host' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                  >Jeder selbst</button>
                  <button
                    onClick={() => updateGameFresh(p => p ? { ...p, mode: 'host' } : null)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase transition-colors ${game.mode === 'host' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                  >Host-Mode</button>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Flaschengröße</p>
                <div className="flex gap-2">
                  {(Object.entries(BOTTLE_SIZES) as [BottleSize, typeof BOTTLE_SIZES[keyof typeof BOTTLE_SIZES]][]).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => updateGameFresh(p => p ? { ...p, bottleSize: key } : null)}
                      className={`flex-1 py-3 rounded-xl font-bungee border-2 transition-colors text-sm ${game.bottleSize === key ? 'bg-amber-500 border-amber-400 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'}`}
                    >{val.label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Selbst eintragen (für alle, solange das Spiel nicht läuft) – Getränk kommt im nächsten Schritt */}
          {inSetup && (
            <div className="bg-slate-900/40 border border-slate-700 rounded-2xl p-4 mb-6">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Dein Name</p>
              <Input
                value={joinName}
                onChange={(e) => { setJoinName(e.target.value); setJoinError(null); }}
                placeholder="Name..."
                maxLength={20}
                className="w-full mb-4"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); joinAsPlayer(); } }}
              />
              {joinError && <p className="text-red-400 text-xs font-bold mb-3">{joinError}</p>}
              <Button onClick={joinAsPlayer} disabled={!joinName.trim() || joining} className="w-full py-3 font-bungee">
                {joining ? 'TRETE BEI…' : 'BEITRETEN'}
              </Button>
            </div>
          )}

          {/* Spieler in der Lobby / vorhandenen Spieler übernehmen */}
          {game.players.length > 0 && (
            <>
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">
                {inSetup ? `In der Lobby (${game.players.length}) · steht dein Name schon da? antippen` : 'Wähle deinen Spieler'}
              </p>
              <div className="grid gap-2 mb-4">
                {game.players.map(p => (
                  <div key={p.id} className="flex gap-2">
                    <button
                      onClick={() => claimPlayer(p)}
                      className="flex-1 p-4 bg-slate-900/60 rounded-xl border border-slate-700 font-bold text-left flex justify-between hover:border-amber-500/50 transition-colors"
                    >
                      {p.name}
                      {p.userId && <span className="text-[10px] text-slate-500 font-bold uppercase">{p.userId === myUserId ? 'Du' : 'Online'}</span>}
                      {!p.userId && <span className="text-amber-500">→</span>}
                    </button>
                    {isCreator && inSetup && (
                      <button
                        onClick={() => updateGameFresh(prev => prev ? { ...prev, players: prev.players.filter(pl => pl.id !== p.id) } : null)}
                        className="px-4 rounded-xl bg-slate-900/40 text-red-500"
                        title="Spieler entfernen"
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Creator: Mitspieler schnell selbst eintragen – die suchen sich dann oben aus */}
          {isCreator && inSetup && (
            <div className="mb-6">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Mitspieler eintragen</p>
              <div className="flex gap-2">
                <Input
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Name..."
                  maxLength={20}
                  className="flex-1"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPlayer(); } }}
                />
                <Button variant="secondary" onClick={addPlayer}>Add</Button>
              </div>
            </div>
          )}

          {/* Creator: Link teilen + Start */}
          {isCreator && inSetup && (
            <div className="space-y-3">
              <button
                onClick={copyLink}
                className={`w-full text-[10px] font-bold uppercase py-2 rounded-lg border transition-colors ${copyFeedback ? 'text-green-500 border-green-500/30' : 'text-slate-400 border-slate-700'}`}
              >{copyFeedback ? '✓ Link kopiert' : 'Einladungslink kopieren'}</button>
              <Button
                onClick={() => updateGameFresh(p => p ? { ...p, status: GameStatus.WEIGHING_INITIAL } : null)}
                disabled={game.players.length < 1}
                className="w-full py-4 text-xl font-bungee"
              >START</Button>
            </div>
          )}

          {!inSetup && joinError && (
            <p className="text-red-400 text-xs font-bold mb-3 text-center">{joinError}</p>
          )}

          {!inSetup && game.players.length === 0 && (
            <p className="text-slate-500 text-sm text-center">Spiel läuft bereits. Bitte wähle einen Spieler.</p>
          )}
        </Card>
      </div>
    );
  }

  // ─── Getränk wählen (nach der Namenswahl) ─────────────────────────────────
  if (drinkStep && myPlayer) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Hallo {myPlayer.name}</p>
          <h2 className="text-xl font-bungee mb-6 uppercase">Was trinkst du?</h2>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {(Object.entries(DRINK_THEMES) as [DrinkType, typeof DRINK_THEMES[DrinkType]][]).map(([key, t]) => (
              <button
                key={key}
                onClick={() => setMyDrink(key)}
                className={`py-5 rounded-2xl border-2 flex flex-col items-center gap-2 transition-colors ${myDrink === key ? 'text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                style={myDrink === key ? { backgroundColor: `rgb(${t.c500})`, borderColor: `rgb(${t.c400})` } : undefined}
              >
                <span className="text-4xl leading-none">{t.emoji}</span>
                <span className="text-xs font-bold uppercase">{t.label}</span>
              </button>
            ))}
          </div>
          <Button onClick={() => setDrinkStep(false)} className="w-full py-4 font-bungee">WEITER</Button>
          <button
            onClick={() => { setDrinkStep(false); setMyPlayerId(null); }}
            className="w-full mt-4 text-slate-500 font-bold text-[10px] uppercase hover:text-slate-300"
          >← Anderer Name</button>
        </Card>
      </div>
    );
  }

  // ─── In-game view ─────────────────────────────────────────────────────────
  const roundWinner = game.status === GameStatus.ROUND_RESULT
    ? [...game.players].sort((a, b) => (a.deviations.slice(-1)[0] || 0) - (b.deviations.slice(-1)[0] || 0))[0]
    : null;
  const iAmRoundWinner = roundWinner?.id === myPlayerId;
  const currentRound = game.rounds.slice(-1)[0];
  const penaltyTargetId = currentRound?.penaltyTargetId;

  // Host darf jeden außer sich selbst aus dem laufenden Spiel nehmen.
  const canRemove = (p: Player) => isCreator && p.id !== myPlayerId && game.status !== GameStatus.FINISHED;
  const askRemove = (id: string) => {
    const p = game.players.find(pl => pl.id === id);
    if (p && canRemove(p)) setRemoveCandidate(p);
  };

  /** Auf wen wartet das Spiel gerade? (nur "Jeder selbst" – im Host-Mode tippt der Host alles ein) */
  const waitingOn = (p: Player): string | null => {
    if (game.mode === 'host') return null;
    switch (game.status) {
      case GameStatus.WEIGHING_INITIAL: return (game.pendingInitialWeights ?? {})[p.id] === undefined ? 'fehlt noch' : null;
      case GameStatus.SETTING_TARGET: return minWeightPlayer?.id === p.id ? 'wählt das Ziel' : null;
      case GameStatus.WEIGHING_FINAL: return currentRound && currentRound.finalWeights[p.id] === undefined ? 'fehlt noch' : null;
      case GameStatus.ROUND_RESULT: return !penaltyTargetId && roundWinner?.id === p.id ? 'vergibt die Strafe' : null;
      default: return null;
    }
  };
  const isWeighing = game.mode !== 'host' && (game.status === GameStatus.WEIGHING_INITIAL || game.status === GameStatus.WEIGHING_FINAL);

  const pingCoolingDown = (id: string) => !!pings[id] && Date.now() - pings[id].at < PING_COOLDOWN_MS;
  const sendPing = (p: Player) => {
    if (pingCoolingDown(p.id)) return;
    const ping: Ping = { targetPlayerId: p.id, fromName: myPlayer?.name ?? '', timestamp: Date.now() };
    setPings(prev => ({ ...prev, [p.id]: { at: Date.now(), from: ping.fromName } }));
    if (channelRef.current) repo.sendPing(channelRef.current, ping);
  };
  const pingButton = (player: Player) => (
    <button
      type="button"
      onClick={() => sendPing(player)}
      disabled={pingCoolingDown(player.id)}
      className="shrink-0 whitespace-nowrap px-3 py-2 rounded-full border-2 border-yellow-400 text-yellow-300 text-[10px] font-bold uppercase disabled:border-slate-700 disabled:text-slate-500 transition-colors"
    >{pingCoolingDown(player.id) ? '✓ Angepingt' : '📣 Anpingen'}</button>
  );

  // Ich wurde angepingt und bin noch dran → dicker gelber Rahmen.
  const myPing = myPlayerId ? pings[myPlayerId] : undefined;
  const myWaiting = myPlayer ? waitingOn(myPlayer) : null;
  const showMyPing = !!myPing && !!myWaiting && Date.now() - myPing.at < PING_TTL_MS;
  const myPingText = myWaiting === 'wählt das Ziel' ? 'Du bist dran – wähl das Ziel!'
    : myWaiting === 'vergibt die Strafe' ? 'Du bist dran – vergib die Strafe!'
    : 'Trag dein Gewicht ein!';

  return (
    <div className={`min-h-screen${devMode ? ' pb-20' : ''}`}>
      <div className="p-4 max-w-2xl mx-auto space-y-6">

        {syncError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 flex items-start gap-3">
            <span className="text-lg leading-none">⚠️</span>
            <div className="flex-1">
              <p className="text-red-400 text-xs font-bold uppercase">Nicht gespeichert</p>
              <p className="text-slate-400 text-[11px] mt-0.5">Dein Spielstand konnte nicht synchronisiert werden. Die anderen sehen deine Eingabe evtl. nicht.</p>
            </div>
            <button onClick={() => setSyncError(null)} className="text-slate-500 text-xs font-bold hover:text-slate-300">✕</button>
          </div>
        )}

        {/* Header */}
        <header className="flex justify-between items-end">
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Spieler</p>
            <h1 className="text-2xl font-bungee text-amber-500 flex items-center gap-2">
              {myPlayer?.name ?? '...'}
              <button
                onClick={() => {
                  const keys = Object.keys(DRINK_THEMES) as DrinkType[];
                  setMyDrink(keys[(keys.indexOf(myDrink) + 1) % keys.length]);
                }}
                title={`Getränk: ${DRINK_THEMES[myDrink].label} (tippen zum Wechseln)`}
                className="text-lg leading-none"
              >{DRINK_THEMES[myDrink].emoji}</button>
            </h1>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div className="text-xs font-bold text-slate-500 uppercase">Code: {game.gameCode}</div>
            {isCreator && game.status !== GameStatus.SETUP && game.status !== GameStatus.FINISHED && (
              <button onClick={goBack} className="text-slate-400 font-bold text-[10px] uppercase">← Zurück</button>
            )}
            {isCreator ? (
              <button onClick={() => { if (window.confirm("Spiel wirklich beenden?")) updateGame(() => null); }} className="text-red-500 font-bold text-[10px] uppercase underline">Beenden</button>
            ) : (
              <button onClick={() => { setGame(null); setMyPlayerId(null); localStorage.removeItem('bierwiegen_last_session'); localStorage.removeItem('bierwiegen_player_id'); }} className="text-slate-500 font-bold text-[10px] uppercase">Verlassen</button>
            )}
          </div>
        </header>

        {/* My player card */}
        {myPlayer && (
          <Card className="border-amber-500/30">
            {(() => {
              const devs = myPlayer.deviations;
              const tag = getPlayerPerformanceTag(myPlayer, game.players, game.rounds);
              const best = devs.length ? Math.min(...devs) : null;
              const worst = devs.length ? Math.max(...devs) : null;
              const last = devs.length ? devs[devs.length - 1] : null;
              const wins = getRoundWins(myPlayerId!, game.players, game.rounds);
              return (
                <div className="flex items-start gap-4">
                  <BeerProgressBar progress={getDrinkingProgress(myPlayer.weights.slice(-1)[0] || 0, myPlayer.weights[0] || 0, game.bottleSize)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-end gap-8 mb-1">
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Gewicht</div>
                        <div className="text-4xl font-bungee text-white">{myPlayer.weights.slice(-1)[0] || 0}g</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Trend</div>
                        <div className={`text-4xl font-bungee ${getDeviationTrend(devs).color}`}>{getDeviationTrend(devs).label}</div>
                      </div>
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 mb-3">
                      {tag.icon} {tag.label}
                    </div>
                    <div className="flex items-start gap-1 mb-3">
                      <div className="grid grid-cols-4 gap-1 flex-1 min-w-0">
                        <div className="min-w-0"><div className="text-[9px] text-slate-600 font-bold uppercase truncate">Letzt.</div><div className="text-xs font-bungee text-white">{last ?? '—'}{last != null ? 'g' : ''}</div></div>
                        <div className="min-w-0"><div className="text-[9px] text-slate-600 font-bold uppercase truncate">Beste</div><div className="text-xs font-bungee text-green-400">{best ?? '—'}{best != null ? 'g' : ''}</div></div>
                        <div className="min-w-0"><div className="text-[9px] text-slate-600 font-bold uppercase truncate">Schle.</div><div className="text-xs font-bungee text-red-400">{worst ?? '—'}{worst != null ? 'g' : ''}</div></div>
                        <div className="min-w-0"><div className="text-[9px] text-slate-600 font-bold uppercase truncate">Siege</div><div className="text-xs font-bungee text-amber-400">{wins}</div></div>
                      </div>
                      <div className="w-px self-stretch bg-slate-700 mx-1" />
                      <div className="grid grid-cols-2 gap-1">
                        <div className="min-w-0"><div className="text-[9px] text-slate-600 font-bold uppercase truncate">Kass.</div><div className="text-xs font-bungee text-white">{myPlayer.penalties}</div></div>
                        <div className="min-w-0"><div className="text-[9px] text-slate-600 font-bold uppercase truncate">Vert.</div><div className="text-xs font-bungee text-white">{getPenaltiesGiven(myPlayerId!, game.players, game.rounds)}</div></div>
                      </div>
                    </div>
                    {devs.length > 0 && (
                      <>
                        <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">Rundenverlauf</div>
                        <div className="flex gap-1.5">
                          {devs.map((dev, idx) => {
                            const playersWithDev = game.players.filter(p => p.deviations[idx] !== undefined);
                            const isWin = dev === Math.min(...playersWithDev.map(p => p.deviations[idx]));
                            const finalWeight = myPlayer.weights[idx + 1];
                            const target = game.rounds[idx]?.targetWeight;
                            const tooLittle = finalWeight != null && target != null && finalWeight > target;
                            const tooMuch = finalWeight != null && target != null && finalWeight < target;
                            return (
                              <div key={idx} className={`flex-1 rounded-lg px-1 py-1.5 text-center border ${isWin ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-800/60 border-slate-700'}`}>
                                <div className={`text-[8px] font-bold uppercase mb-0.5 ${isWin ? 'text-amber-500' : 'text-slate-600'}`}>{isWin ? '★' : `R${idx + 1}`}</div>
                                <div className="flex items-center justify-center gap-0.5 leading-none">
                                  <div className={`text-xs font-bungee ${isWin ? 'text-amber-400' : 'text-slate-300'}`}>{dev}g</div>
                                  <div className={`text-[8px] font-bold ${tooLittle ? 'text-red-400' : tooMuch ? 'text-blue-400' : 'text-green-400'}`}>{tooLittle ? '+' : tooMuch ? '-' : '●'}</div>
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
        )}

        {/* ─── WEIGHING_INITIAL ──────────────────────────────────────────────── */}
        {/* ─── SETUP (Spieler bereits gewählt) ───────────────────────────────── */}
        {game.status === GameStatus.SETUP && (
          <Card className="text-center py-8">
            <div className="text-4xl mb-3">⏳</div>
            <h2 className="text-lg font-bungee mb-2 uppercase">
              {isCreator ? 'Bereit zum Start' : 'Warte auf den Ersteller'}
            </h2>
            <p className="text-slate-400 text-xs font-bold uppercase mb-4">
              {isCreator
                ? `${game.players.length} Spieler im Raum`
                : 'Das Spiel wird gleich gestartet...'}
            </p>
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {game.players.map(p => (
                <span
                  key={p.id}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold ${p.id === myPlayerId ? 'bg-amber-500/15 text-amber-400 border border-amber-500/40' : 'bg-slate-900/60 text-slate-300 border border-slate-700'}`}
                >{p.name}{!p.userId && <span className="text-slate-500 font-normal"> · noch frei</span>}</span>
              ))}
            </div>
            {isCreator && (
              <Button
                onClick={() => updateGameFresh(p => p ? { ...p, status: GameStatus.WEIGHING_INITIAL } : null)}
                disabled={game.players.length < 1}
                className="w-full py-4 text-xl font-bungee"
              >START</Button>
            )}
            {isCreator && (
              <button
                onClick={() => { const url = new URL(window.location.href); url.searchParams.set('code', game.gameCode); navigator.clipboard.writeText(url.toString()); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); }}
                className={`w-full mt-3 text-[10px] font-bold uppercase py-2 rounded-lg border transition-colors ${copyFeedback ? 'text-green-500 border-green-500/30' : 'text-slate-400 border-slate-700'}`}
              >{copyFeedback ? '✓ Link kopiert' : 'Einladungslink kopieren'}</button>
            )}
            <button
              onClick={() => setMyPlayerId(null)}
              className="mt-4 text-slate-500 font-bold text-[10px] uppercase hover:text-slate-300"
            >← Zurück zur Lobby</button>
          </Card>
        )}

        {game.status === GameStatus.WEIGHING_INITIAL && (() => {
          const maxW = (BOTTLE_SIZES[game.bottleSize] ?? BOTTLE_SIZES['0.5']).maxWeight;

          if (game.mode === 'host') {
            if (isCreator) {
              return (
                <Card>
                  <h2 className="text-xl font-bungee text-center mb-6 uppercase">Initialwiegen</h2>
                  <div className="space-y-3 mb-6">
                    {game.players.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-xl">
                        <div className="font-bold">{p.name}</div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={inputs[p.id] || ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const num = parseInt(raw);
                              if (!raw || isNaN(num)) { setInputs({ ...inputs, [p.id]: raw }); return; }
                              setInputs({ ...inputs, [p.id]: Math.min(maxW, Math.max(1, num)).toString() });
                            }}
                            placeholder="000"
                            className="w-20 text-center font-bungee"
                          />
                          <span className="text-slate-500 text-[10px] font-bold uppercase">g</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    onClick={() => {
                      if (!game.players.every(p => inputs[p.id] && parseInt(inputs[p.id]) >= 1 && parseInt(inputs[p.id]) <= maxW)) {
                        alert(`Bitte gültige Gewichte eingeben (1–${maxW}g)`);
                        return;
                      }
                      updateGame(prev => {
                        if (!prev) return null;
                        return {
                          ...prev,
                          status: GameStatus.SETTING_TARGET,
                          players: prev.players.map(p => ({ ...p, weights: [parseInt(inputs[p.id])] })),
                          pendingInitialWeights: {},
                        };
                      });
                      setInputs({});
                    }}
                    className="w-full py-4 font-bungee"
                  >FERTIG</Button>
                </Card>
              );
            }
            return (
              <Card className="text-center py-10">
                <div className="text-4xl mb-3">⏳</div>
                <h2 className="text-lg font-bungee mb-2 uppercase">Warte auf Host</h2>
                <p className="text-slate-400 text-xs font-bold uppercase">Host wiegt alle Flaschen ein...</p>
              </Card>
            );
          }

          // Peer mode
          const pending = game.pendingInitialWeights ?? {};
          const mySubmitted = myPlayerId ? pending[myPlayerId] : undefined;
          const submittedCount = game.players.filter(p => pending[p.id] !== undefined).length;

          return (
            <Card>
              <h2 className="text-xl font-bungee text-center mb-2 uppercase">Initialwiegen</h2>
              <p className="text-center text-slate-500 text-xs font-bold uppercase mb-6">
                {submittedCount}/{game.players.length} eingereicht
              </p>
              {mySubmitted !== undefined ? (
                <div className="text-center py-6">
                  <div className="text-4xl font-bungee text-amber-500 mb-2">{mySubmitted}g</div>
                  <p className="text-slate-400 text-xs font-bold uppercase">Eingereicht – warte auf andere...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <div className="relative inline-flex items-center">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={weightInput}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const num = parseInt(raw);
                          if (!raw || isNaN(num)) { setWeightInput(raw); return; }
                          setWeightInput(Math.min(maxW, Math.max(1, num)).toString());
                        }}
                        placeholder="..."
                        className="w-36 pr-10 text-center font-bungee text-2xl bg-slate-900/50 border border-slate-700 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 text-white placeholder:text-slate-600"
                      />
                      <span className="absolute right-3 text-slate-400 font-bungee text-2xl pointer-events-none">G</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      if (!myPlayerId) return;
                      const val = parseInt(weightInput);
                      if (!val || val < 1 || val > maxW) { alert(`Bitte gültiges Gewicht eingeben (1–${maxW}g)`); return; }
                      updateGame(prev => prev ? { ...prev, pendingInitialWeights: { ...(prev.pendingInitialWeights ?? {}), [myPlayerId]: val } } : null);
                      setWeightInput('');
                    }}
                    className="w-full py-4 font-bungee"
                  >EINWIEGEN</Button>
                </div>
              )}
              <div className="mt-4 space-y-1">
                {game.players.filter(p => p.id !== myPlayerId).map(p => (
                  <div key={p.id} className="flex justify-between text-xs text-slate-600 font-bold uppercase px-1">
                    <span>{p.name}</span>
                    <span>{pending[p.id] !== undefined ? `${pending[p.id]}g ✓` : '...'}</span>
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}

        {/* ─── SETTING_TARGET ────────────────────────────────────────────────── */}
        {game.status === GameStatus.SETTING_TARGET && (
          (chooserIsMe || (game.mode === 'host' && isCreator)) ? (
            <Card className="text-center">
              <h2 className="text-xl font-bungee mb-2 uppercase">Du bist dran!</h2>
              <p className="text-slate-400 text-xs font-bold uppercase mb-6">
                {chooserIsMe
                  ? 'Du hast die leerste Flasche – wähle das Ziel'
                  : `${minWeightPlayer?.name} hat die leerste Flasche – wähle das Ziel`}
              </p>
              <div className="bg-slate-900 p-6 rounded-2xl mb-6">
                <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">
                  {chooserIsMe ? 'Dein aktuelles Gewicht' : `Niedrigstes Gewicht (${minWeightPlayer?.name})`}
                </div>
                <div className="text-4xl font-bungee text-white">{minWeightPlayer ? lastWeight(minWeightPlayer) : 0}g</div>
              </div>
              <div className="space-y-4">
                <div className="flex gap-2">
                  {[30, 50, 100].map(val => (
                    <button
                      key={val}
                      onClick={() => setDrinkAmountInput(val.toString())}
                      className={`flex-1 py-3 rounded-xl font-bungee border-2 transition-colors ${drinkAmountInput === val.toString() ? 'bg-amber-500 border-amber-400 text-slate-900' : 'bg-slate-800 border-slate-700'}`}
                    >{val}g</button>
                  ))}
                </div>
                <div className="bg-slate-800 p-4 rounded-xl">
                  <div className="text-center text-2xl font-bungee text-amber-400 mb-3">
                    {drinkAmountInput || DEFAULT_DRINK_AMOUNT}g
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={100}
                    value={drinkAmountInput || DEFAULT_DRINK_AMOUNT}
                    onChange={(e) => setDrinkAmountInput(e.target.value)}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-xs text-slate-500 font-bold mt-1">
                    <span>30g</span>
                    <span>100g</span>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    // Ohne Antippen eines Presets stand hier NaN und der Knopf tat
                    // stillschweigend nichts – obwohl die Karte 30g anzeigt.
                    const parsed = parseInt(drinkAmountInput);
                    const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DRINK_AMOUNT;
                    updateGame(prev => {
                      if (!prev) return null;
                      const currentMin = minLastWeight(prev.players);
                      if (currentMin === null) return prev;
                      return {
                        ...prev,
                        status: GameStatus.DRINKING,
                        rounds: [...prev.rounds, {
                          roundNumber: prev.rounds.length + 1,
                          targetWeight: currentMin - amount,
                          chooserPlayerId: myPlayerId ?? '',
                          initialWeights: {},
                          finalWeights: {},
                        }],
                      };
                    });
                    setDrinkAmountInput('');
                  }}
                  className="w-full py-4 font-bungee"
                >RUNDE STARTEN</Button>
              </div>
            </Card>
          ) : (
            <Card className="text-center py-10">
              <div className="text-4xl mb-3">⏳</div>
              <h2 className="text-lg font-bungee mb-2 uppercase">
                {game.mode === 'host' ? 'Warte auf Host' : `Warte auf ${minWeightPlayer?.name}`}
              </h2>
              <p className="text-slate-400 text-xs font-bold uppercase">
                {game.mode === 'host' ? 'Host wählt das Ziel für diese Runde' : `${minWeightPlayer?.name} wählt das Ziel für diese Runde`}
              </p>
            </Card>
          )
        )}

        {/* ─── DRINKING ─────────────────────────────────────────────────────── */}
        {game.status === GameStatus.DRINKING && (() => {
          const myDrinkAmount = (myPlayer?.weights.slice(-1)[0] || 0) - (currentRound?.targetWeight || 0);
          return (
            <Card className="border-amber-500/50 text-center py-10">
              <h2 className="text-xs font-bold text-amber-500 uppercase mb-2">Ziel</h2>
              <div className="text-6xl font-bungee text-white mb-2">{currentRound?.targetWeight}g</div>
              <div className="bg-slate-900 rounded-xl px-4 py-3 mb-6 inline-block">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Trink</span>
                <div className="text-2xl font-bungee text-amber-400">{myDrinkAmount}g</div>
              </div>
              {game.mode === 'host' ? (
                isCreator
                  ? <Button onClick={() => updateGame(p => p ? { ...p, status: GameStatus.WEIGHING_FINAL } : null)} className="w-full py-4 font-bungee">WIEGEN</Button>
                  : <p className="text-slate-500 text-xs font-bold uppercase mt-4">Host startet das Wiegen...</p>
              ) : (
                <Button onClick={() => updateGame(p => p ? { ...p, status: GameStatus.WEIGHING_FINAL } : null)} className="w-full py-4 font-bungee">WIEGEN</Button>
              )}
            </Card>
          );
        })()}

        {/* ─── WEIGHING_FINAL ────────────────────────────────────────────────── */}
        {game.status === GameStatus.WEIGHING_FINAL && (() => {
          const maxW = (BOTTLE_SIZES[game.bottleSize] ?? BOTTLE_SIZES['0.5']).maxWeight;

          if (game.mode === 'host') {
            if (isCreator) {
              return (
                <Card>
                  <h2 className="text-xl font-bungee text-center mb-4 uppercase">Endwiegen</h2>
                  <div className="text-center mb-6">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Ziel</p>
                    <div className="text-4xl font-bungee text-amber-500">{currentRound?.targetWeight}g</div>
                  </div>
                  <div className="space-y-3 mb-6">
                    {game.players.map(p => {
                      const maxForP = p.weights[0] || maxW;
                      return (
                        <div key={p.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-xl">
                          <div className="font-bold">{p.name}</div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={inputs[p.id] || ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const num = parseInt(raw);
                                if (!raw || isNaN(num)) { setInputs({ ...inputs, [p.id]: raw }); return; }
                                setInputs({ ...inputs, [p.id]: Math.min(maxForP, Math.max(0, num)).toString() });
                              }}
                              placeholder="000"
                              className="w-20 text-center font-bungee"
                            />
                            <span className="text-slate-500 text-[10px] font-bold uppercase">g</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    onClick={() => {
                      const invalid = game.players.find(p => {
                        const val = parseInt(inputs[p.id]);
                        const maxForP = p.weights[0] || maxW;
                        return !inputs[p.id] || isNaN(val) || val < 0 || val > maxForP;
                      });
                      if (invalid) { alert(`Ungültiger Wert für ${invalid.name}`); return; }
                      updateGame(prev => {
                        if (!prev) return null;
                        const target = prev.rounds.slice(-1)[0].targetWeight;
                        return {
                          ...prev,
                          status: GameStatus.ROUND_RESULT,
                          players: prev.players.map(p => ({
                            ...p,
                            weights: [...p.weights, parseInt(inputs[p.id])],
                            deviations: [...p.deviations, Math.abs(parseInt(inputs[p.id]) - target)],
                          })),
                        };
                      });
                      setInputs({});
                    }}
                    className="w-full py-4 font-bungee"
                  >AUSWERTEN</Button>
                </Card>
              );
            }
            return (
              <Card className="text-center py-10">
                <div className="text-4xl mb-3">⏳</div>
                <h2 className="text-lg font-bungee mb-2 uppercase">Warte auf Host</h2>
                <p className="text-slate-400 text-xs font-bold uppercase">Host wiegt alle Flaschen...</p>
                <div className="text-3xl font-bungee text-amber-500 mt-6">{currentRound?.targetWeight}g</div>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Ziel</p>
              </Card>
            );
          }

          // Peer mode
          const maxForMe = myPlayer?.weights[0] ?? maxW;
          const mySubmitted = myPlayerId && currentRound ? currentRound.finalWeights[myPlayerId] : undefined;
          const submittedCount = game.players.filter(p => currentRound?.finalWeights[p.id] !== undefined).length;

          return (
            <Card>
              <h2 className="text-xl font-bungee text-center mb-1 uppercase">Endwiegen</h2>
              <div className="text-center mb-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Ziel</p>
                <div className="text-3xl font-bungee text-amber-500">{currentRound?.targetWeight}g</div>
                <p className="text-[10px] font-bold text-slate-500 uppercase mt-2 mb-0.5">Trink</p>
                <div className="text-xl font-bungee text-amber-400">
                  {(myPlayer?.weights.slice(-1)[0] || 0) - (currentRound?.targetWeight || 0)}g
                </div>
              </div>
              {mySubmitted !== undefined ? (
                <div className="text-center py-4">
                  <div className="text-4xl font-bungee text-amber-500 mb-2">{mySubmitted}g</div>
                  <p className="text-slate-400 text-xs font-bold uppercase">Eingereicht – warte auf andere...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <div className="relative inline-flex items-center">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={weightInput}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const num = parseInt(raw);
                          if (!raw || isNaN(num)) { setWeightInput(raw); return; }
                          setWeightInput(Math.min(maxForMe, Math.max(0, num)).toString());
                        }}
                        placeholder="..."
                        className="w-36 pr-10 text-center font-bungee text-2xl bg-slate-900/50 border border-slate-700 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 text-white placeholder:text-slate-600"
                      />
                      <span className="absolute right-3 text-slate-400 font-bungee text-2xl pointer-events-none">G</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      if (!myPlayerId || !currentRound) return;
                      const val = parseInt(weightInput);
                      if (isNaN(val) || val < 0 || val > maxForMe) { alert(`Ungültiger Wert. Max: ${maxForMe}g`); return; }
                      updateGame(prev => {
                        if (!prev) return null;
                        const rounds = [...prev.rounds];
                        const lastIdx = rounds.length - 1;
                        rounds[lastIdx] = { ...rounds[lastIdx], finalWeights: { ...rounds[lastIdx].finalWeights, [myPlayerId]: val } };
                        return { ...prev, rounds };
                      });
                      setWeightInput('');
                    }}
                    className="w-full py-4 font-bungee"
                  >EINWIEGEN</Button>
                  <p className="text-center text-slate-500 text-xs font-bold uppercase">
                    {submittedCount}/{game.players.length} eingereicht
                  </p>
                </div>
              )}
            </Card>
          );
        })()}

        {/* ─── ROUND_RESULT ─────────────────────────────────────────────────── */}
        {game.status === GameStatus.ROUND_RESULT && (() => {
          const roundResults = [...game.players].sort((a, b) => (a.deviations.slice(-1)[0] || 0) - (b.deviations.slice(-1)[0] || 0));
          const roundLoser = roundResults[roundResults.length - 1];
          const penaltyTarget = penaltyTargetId ? game.players.find(p => p.id === penaltyTargetId) : null;

          return (
            <div className="space-y-4">
              <Card>
                <h2 className="text-xl font-bungee text-center mb-6 uppercase">Ergebnis</h2>
                <div className="space-y-3">
                  {roundResults.map((p, idx) => {
                    const target = currentRound.targetWeight;
                    const final = p.weights.slice(-1)[0];
                    const diff = final - target;
                    const isAbove = diff > 0;
                    const isWinner = idx === 0;
                    const isLoser = idx === roundResults.length - 1;
                    return (
                      <div key={p.id} className={`p-4 rounded-xl border flex justify-between items-center ${isWinner ? 'bg-green-500/10 border-green-500/30' : 'bg-slate-900/40 border-slate-700'}`}>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{p.name}</span>
                          {isWinner && <span className="text-[10px] font-bold uppercase text-green-500 bg-green-500/20 px-2 py-0.5 rounded">Rundensieger</span>}
                          {isLoser && !isWinner && <span className="text-[10px] font-bold uppercase text-amber-500 bg-amber-500/20 px-2 py-0.5 rounded">Rundenverlierer</span>}
                        </div>
                        <div className="text-right">
                          <div className={`font-bungee text-xl ${diff === 0 ? 'text-green-400' : isAbove ? 'text-red-400' : 'text-blue-400'}`}>{isAbove ? '+' : ''}{diff}g</div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold">{diff === 0 ? 'PUNKTGELANDET' : isAbove ? 'ZU WENIG GETRUNKEN' : 'ZU VIEL GETRUNKEN'}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-slate-400 text-xs mt-4 text-center font-bold uppercase">Der Rundenverlierer trinkt mit dem Strafen-Empfänger einen Kurzen.</p>
              </Card>

              {/* Penalty selection – round winner (peer) or host picks */}
              {!penaltyTargetId ? (
                (iAmRoundWinner || (game.mode === 'host' && isCreator)) ? (
                  <Card className="border-amber-500/50">
                    <h2 className="text-sm font-bungee text-center mb-2 uppercase">Du hast gewonnen!</h2>
                    <p className="text-slate-400 text-xs text-center mb-4">Wem gibst du die Strafe?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {game.players.map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            const roundIndex = game.rounds.length - 1;
                            updateGame(prev => {
                              if (!prev) return null;
                              const rounds = [...prev.rounds];
                              rounds[roundIndex] = { ...rounds[roundIndex], penaltyTargetId: p.id };
                              const players = prev.players.map(pl => pl.id === p.id ? { ...pl, penalties: pl.penalties + 1 } : pl);
                              return { ...prev, rounds, players };
                            });
                          }}
                          className="py-3 px-4 rounded-xl bg-slate-800 border border-slate-600 font-bold text-sm hover:bg-amber-500/20 hover:border-amber-500/50 transition-colors"
                        >{p.name}</button>
                      ))}
                    </div>
                  </Card>
                ) : (
                  <Card className="text-center py-6">
                    <div className="text-2xl mb-2">⏳</div>
                    <p className="text-slate-400 text-xs font-bold uppercase">
                      {game.mode === 'host' ? 'Host vergibt gerade die Strafe...' : `${roundWinner?.name} vergibt gerade die Strafe...`}
                    </p>
                    {game.mode !== 'host' && roundWinner && roundWinner.id !== myPlayerId && (
                      <div className="mt-3 flex justify-center">{pingButton(roundWinner)}</div>
                    )}
                  </Card>
                )
              ) : (
                <Card className="bg-amber-500/10 border-amber-500/30">
                  <p className="text-center text-sm font-bold uppercase text-amber-500">Strafe an {penaltyTarget?.name} vergeben</p>
                  <p className="text-center text-xs text-slate-400 mt-1">
                    {roundLoser && penaltyTarget && roundLoser.id === penaltyTarget.id
                      ? `${penaltyTarget.name} trinkt einen Kurzen.`
                      : `${roundLoser?.name} + ${penaltyTarget?.name} trinken einen Kurzen.`}
                  </p>
                </Card>
              )}

              <PlacementCard
                onSelect={isCreator ? askRemove : undefined}
                selectableIds={game.players.filter(canRemove).map(p => p.id)}
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
                onClick={() => {
                  const currentMin = minLastWeight(game.players);
                  const bottleCfg = BOTTLE_SIZES[game.bottleSize] ?? BOTTLE_SIZES['0.5'];
                  const drunkPerPlayer = game.players
                    .map(p => { const last = lastWeight(p); return last === null ? null : (p.weights[0] ?? last) - last; })
                    .filter((d): d is number => d !== null);
                  const maxDrunk = drunkPerPlayer.length ? Math.max(...drunkPerPlayer) : 0;
                  const isFinished = currentMin !== null
                    && (currentMin < bottleCfg.finishedThreshold || maxDrunk >= bottleCfg.liquidWeight);
                  updateGame(p => p ? { ...p, status: isFinished ? GameStatus.FINISHED : GameStatus.SETTING_TARGET, currentRoundIndex: p.currentRoundIndex + 1 } : null);
                }}
                disabled={!penaltyTargetId}
                className="w-full py-4 font-bungee"
              >NÄCHSTE RUNDE</Button>
            </div>
          );
        })()}

        {/* ─── FINISHED ─────────────────────────────────────────────────────── */}
        {game.status === GameStatus.FINISHED && (
          <Card className="text-center py-10">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-3xl font-bungee text-amber-500 mb-8 uppercase">Finale</h2>
            <div className="space-y-2 mb-8">
              {[...game.players].sort((a, b) => calculateAverageDeviation(a.deviations) - calculateAverageDeviation(b.deviations)).map((p, idx) => (
                <div key={p.id} className={`p-4 rounded-xl border flex items-center justify-between ${p.id === myPlayerId ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
                  <div className="font-bungee text-slate-600">#{idx + 1}</div>
                  <div className="font-bold">{p.name}</div>
                  <div className="font-bungee">{calculateAverageDeviation(p.deviations)}g</div>
                </div>
              ))}
            </div>
            {isCreator && (
              <div className="space-y-3">
                {/* Das Finale wird über Schwellwerte der Flaschengröße ausgelöst –
                    bei anderen Gefäßen ist dann oft noch etwas drin. Der Host
                    kann deshalb beliebig oft eine weitere Runde anhängen. */}
                <Button
                  onClick={() => updateGame(p => p ? { ...p, status: GameStatus.SETTING_TARGET } : null)}
                  className="w-full py-4 font-bungee"
                >NOCH EINE RUNDE</Button>
                <Button variant="secondary" onClick={() => updateGame(() => null)} className="w-full py-4 font-bungee">MENÜ</Button>
              </div>
            )}
          </Card>
        )}

        {/* ─── Ranking (always visible except result/finished/setup) ─────────── */}
        {game.status !== GameStatus.ROUND_RESULT && game.status !== GameStatus.FINISHED && game.status !== GameStatus.SETUP && (
          <Card>
            <h2 className={`text-xs font-bold text-slate-500 uppercase ${isCreator ? 'mb-1' : 'mb-4'}`}>Ranking</h2>
            {isCreator && <p className="text-[10px] text-slate-600 mb-4">Spieler antippen, um ihn aus dem Spiel zu nehmen.</p>}
            <div className="space-y-2">
              {[...game.players].sort((a, b) => calculateAverageDeviation(a.deviations) - calculateAverageDeviation(b.deviations)).map((p, idx) => {
                const waiting = waitingOn(p);
                const rowContent = (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bungee text-slate-600 text-[10px]">#{idx + 1}</span>
                      <span className="font-bold text-sm">{p.name}</span>
                      {waiting && <span className="text-[10px] font-bold uppercase text-yellow-300">⏳ {waiting}</span>}
                      {!waiting && isWeighing && <span className="text-[10px] font-bold uppercase text-green-400">✓ eingetragen</span>}
                      <div className="relative">
                        {recentReactions(reactions)
                          .filter(r => r.targetPlayerId === p.id)
                          .map(r => <FloatingReaction key={r.id} emoji={r.emoji} />)}
                      </div>
                    </div>
                    <div className="font-bungee text-xs">{calculateAverageDeviation(p.deviations)}g</div>
                  </>
                );
                return (
                <div key={p.id} className={`p-3 rounded-xl ${p.id === myPlayerId ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-slate-900/40'}`}>
                  {canRemove(p) ? (
                    <button type="button" onClick={() => askRemove(p.id)} className="w-full flex justify-between items-center text-left">{rowContent}</button>
                  ) : (
                    <div className="flex justify-between items-center">{rowContent}</div>
                  )}
                  {p.id !== myPlayerId && (
                    <div className="mt-2 flex items-center justify-end gap-2">
                      {waiting && <div className="mr-auto">{pingButton(p)}</div>}
                      <EmojiBar onReact={(emoji) => {
                        const reaction: Reaction = { id: createId(), emoji, targetPlayerId: p.id, timestamp: Date.now() };
                        // Sofort selbst anzeigen: Broadcast schickt dem Absender
                        // seine eigene Nachricht nicht zurueck (self: false).
                        setReactions(prev => [...recentReactions(prev), reaction]);
                        if (channelRef.current) repo.sendReaction(channelRef.current, reaction);
                      }} />
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </Card>
        )}

      </div>

      {/* ─── DEV PANEL ─────────────────────────────────────────────── */}
      {devMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 border-t border-amber-500/30 backdrop-blur-sm px-3 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest shrink-0">⚙ DEV</span>
          <div className="w-px h-4 bg-slate-700 shrink-0" />
          <div className="flex gap-1 flex-wrap flex-1">
            {game?.players.map(p => (
              <button
                key={p.id}
                onClick={() => setMyPlayerId(p.id)}
                className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-colors ${myPlayerId === p.id ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
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

      {/* ─── Angepingt: dicker gelber Rahmen + Hinweis ─────────────────── */}
      {showMyPing && (
        <>
          <div className="fixed inset-0 z-[60] pointer-events-none border-[14px] border-yellow-400 animate-pulse" />
          <button
            type="button"
            onClick={() => setPings(prev => { const n = { ...prev }; delete n[myPlayerId!]; return n; })}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[61] w-[calc(100%-4rem)] max-w-sm bg-yellow-400 text-slate-900 rounded-2xl px-5 py-4 shadow-2xl text-center"
          >
            <div className="font-bungee text-xl leading-tight">Hey {myPlayer?.name}!</div>
            <div className="text-sm font-bold">{myPingText}</div>
          </button>
        </>
      )}

      {/* ─── Host: Spieler aus dem laufenden Spiel nehmen ───────────────── */}
      {removeCandidate && isCreator && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setRemoveCandidate(null)}>
          <div className="max-w-sm w-full" role="dialog" aria-modal="true" aria-labelledby="remove-title" onClick={(e) => e.stopPropagation()}>
            <Card>
              <h2 id="remove-title" className="text-lg font-bungee uppercase mb-2">{removeCandidate.name} entfernen?</h2>
              <p className="text-slate-400 text-sm mb-6">
                {removeCandidate.name} wird aus dem Spiel genommen und niemand muss mehr auf {removeCandidate.name} warten. Die bisherigen Werte gehen dabei verloren.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setRemoveCandidate(null)} className="flex-1">Abbrechen</Button>
                <Button variant="danger" onClick={() => { removePlayer(removeCandidate.id); setRemoveCandidate(null); }} className="flex-1">Entfernen</Button>
              </div>
            </Card>
          </div>
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


import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Game, GameRepository as IGameRepository, Reaction } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Ob Supabase konfiguriert ist. Wird beim Start geprüft, damit die App bei
 * fehlender .env eine verständliche Meldung zeigt, statt weiß zu bleiben.
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Fehler, der auf eine fehlende/kaputte Supabase-Konfiguration zurückgeht. */
export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigError';
  }
}

let client: SupabaseClient | null = null;

/** Client erst bei Bedarf bauen – so bricht der reine Modul-Import nie die ganze App. */
const getClient = (): SupabaseClient => {
  if (!isSupabaseConfigured) {
    throw new SupabaseConfigError(
      'Supabase ist nicht konfiguriert. Lege eine .env mit VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY an (Vorlage: .env.example).'
    );
  }
  if (!client) client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  return client;
};

const mapData = (data: any): Game => ({
  id: data.id,
  gameCode: data.game_code,
  hostId: data.host_id,
  status: data.status,
  players: data.players,
  rounds: data.rounds,
  currentRoundIndex: data.current_round_index,
  bottleSize: data.bottle_size || '0.5',
  pendingInitialWeights: data.pending_initial_weights || {},
  mode: (data.mode as 'host' | 'peer') || 'peer',
  createdAt: new Date(data.created_at).getTime(),
  isFinished: data.status === 'FINISHED'
});

export class SupabaseGameRepository implements IGameRepository {
  /** Wird gesetzt, wenn ein Speichern fehlschlägt – die App zeigt das als Hinweis an. */
  onError: ((message: string) => void) | null = null;

  private report(action: string, message: string) {
    console.error(`Supabase ${action} Error:`, message);
    this.onError?.(message);
  }

  async saveGame(game: Game): Promise<void> {
    const { error } = await getClient()
      .from('games')
      .upsert({
        game_code: game.gameCode,
        host_id: game.hostId,
        status: game.status,
        players: game.players,
        rounds: game.rounds,
        current_round_index: game.currentRoundIndex,
        bottle_size: game.bottleSize || '0.5',
        // Reaktionen laufen über Broadcast und werden nicht mehr gespeichert.
        // Die Spalte bleibt bestehen (evtl. NOT NULL) und wird leer gehalten.
        reactions: [],
        pending_initial_weights: game.pendingInitialWeights || {},
        mode: game.mode || 'peer'
      }, { onConflict: 'game_code' });

    if (error) this.report('Save', error.message);
    localStorage.setItem('bierwiegen_last_session', game.gameCode);
  }

  /**
   * Lädt ein Spiel. Gibt `null` zurück, wenn es den Raum nicht gibt.
   * Bei einem echten Verbindungs-/DB-Fehler wird geworfen, damit der Aufrufer
   * "nicht gefunden" nicht mit "keine Verbindung" verwechselt.
   */
  async loadGame(code?: string): Promise<Game | null> {
    const searchCode = code || localStorage.getItem('bierwiegen_last_session');
    if (!searchCode) return null;

    const { data, error } = await getClient()
      .from('games')
      .select('*')
      .eq('game_code', searchCode)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapData(data);
  }

  async deleteGameFromDB(code: string): Promise<void> {
    const { error } = await getClient()
      .from('games')
      .delete()
      .eq('game_code', code);

    if (error) this.report('Delete', error.message);
    localStorage.removeItem('bierwiegen_last_session');
  }

  deleteGame(): void {
    localStorage.removeItem('bierwiegen_last_session');
  }

  /**
   * Reaktion an die anderen Geräte schicken – über Realtime-Broadcast statt
   * über die Tabelle. Ein Schreibvorgang auf die Spielzeile würde sonst den
   * kompletten Stand überbügeln und dabei zeitgleich eingereichte Gewichte
   * verlieren. Broadcast fasst die Tabelle gar nicht erst an.
   */
  sendReaction(channel: RealtimeChannel, reaction: Reaction): void {
    channel.send({ type: 'broadcast', event: 'reaction', payload: reaction })
      .catch(() => { /* Reaktionen sind Deko – ein verlorener Tipp ist egal */ });
  }

  subscribeToGame(
    code: string,
    onUpdate: (game: Game | null) => void,
    onReaction?: (reaction: Reaction) => void,
  ) {
    return getClient()
      .channel(`game_room:${code}`)
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        onReaction?.(payload as Reaction);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'games',
        filter: `game_code=eq.${code}`
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          onUpdate(null);
          return;
        }

        const data = payload.new as any;
        if (!data || Object.keys(data).length === 0) {
          onUpdate(null);
          return;
        }

        onUpdate(mapData(data));
      })
      .subscribe();
  }
}

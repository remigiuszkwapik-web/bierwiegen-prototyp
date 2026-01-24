
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { Game, GameRepository } from '../types';

const SUPABASE_URL = 'https://nsktgxlgtdgnyolqfesu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6v6js6FjgV_2Mx7luCeCnQ_Fe8JnYmb';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export class SupabaseGameRepository {
  private client = supabase;

  async saveGame(game: Game): Promise<void> {
    const { error } = await this.client
      .from('games')
      .upsert({
        game_code: game.gameCode,
        host_id: game.hostId,
        status: game.status,
        players: game.players,
        rounds: game.rounds,
        current_round_index: game.currentRoundIndex,
        reactions: game.reactions || [],
        declined_host_ids: game.declinedHostIds || []
      }, { onConflict: 'game_code' });

    if (error) console.error("Supabase Save Error:", error.message);
    localStorage.setItem('bierwiegen_last_session', game.gameCode);
  }

  async loadGame(code?: string): Promise<Game | null> {
    const searchCode = code || localStorage.getItem('bierwiegen_last_session');
    if (!searchCode) return null;

    const { data, error } = await this.client
      .from('games')
      .select('*')
      .eq('game_code', searchCode)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      gameCode: data.game_code,
      hostId: data.host_id,
      status: data.status,
      players: data.players,
      rounds: data.rounds,
      currentRoundIndex: data.current_round_index,
      reactions: data.reactions || [],
      declinedHostIds: data.declined_host_ids || [],
      createdAt: new Date(data.created_at).getTime(),
      isFinished: data.status === 'FINISHED'
    };
  }

  async deleteGameFromDB(code: string): Promise<void> {
    const { error } = await this.client
      .from('games')
      .delete()
      .eq('game_code', code);
    
    if (error) console.error("Supabase Delete Error:", error.message);
    localStorage.removeItem('bierwiegen_last_session');
  }

  deleteGame(): void {
    localStorage.removeItem('bierwiegen_last_session');
  }

  getChannel(code: string) {
    return this.client.channel(`game_room:${code}`);
  }

  subscribeToGame(code: string, onUpdate: (game: Game | null) => void) {
    return this.client
      .channel(`game_room:${code}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'games', 
        filter: `game_code=eq.${code}` 
      }, (payload) => {
        // Wenn das Spiel gelöscht wurde (eventType DELETE), alle zurück zum Start
        if (payload.eventType === 'DELETE') {
            onUpdate(null);
            return;
        }
        
        const data = payload.new as any;
        if (!data || Object.keys(data).length === 0) {
            onUpdate(null);
            return;
        }

        onUpdate({
          id: data.id,
          gameCode: data.game_code,
          hostId: data.host_id,
          status: data.status,
          players: data.players,
          rounds: data.rounds,
          currentRoundIndex: data.current_round_index,
          reactions: data.reactions || [],
          declinedHostIds: data.declined_host_ids || [],
          createdAt: new Date(data.created_at).getTime(),
          isFinished: data.status === 'FINISHED'
        });
      })
      .subscribe();
  }
}

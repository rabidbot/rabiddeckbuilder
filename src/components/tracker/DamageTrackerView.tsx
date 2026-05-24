import { useState, useEffect, useCallback } from 'react';
import { Plus, Minus, Swords, Crown, Footprints, RotateCcw, UserPlus, Trash2, Skull, Droplets, Zap, Star } from 'lucide-react';

interface Player {
  id: string;
  name: string;
  commanderName: string;
  life: number;
  poison: number;
  energy: number;
  experience: number;
  commanderCasts: number;
  isMonarch: boolean;
  hasInitiative: boolean;
  eliminated: boolean;
}

interface GameState {
  players: Player[];
  damage: Record<string, Record<string, number>>;
  startingLife: number;
}

function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem('edh_game_state');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.startingLife) parsed.startingLife = 40;
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

function saveGame(state: GameState) {
  try {
    localStorage.setItem('edh_game_state', JSON.stringify(state));
  } catch { /* ignore */ }
}

const STORAGE_KEY = 'edh_game_state';
const CMDR_DAMAGE_THRESHOLD = 21;

export default function DamageTrackerView() {
  const [game, setGame] = useState<GameState>(() =>
    loadGame() || { players: [], damage: {}, startingLife: 40 },
  );
  const [newName, setNewName] = useState('');
  const [newCommander, setNewCommander] = useState('');
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
    if (game.players.length) saveGame(game);
  }, [game]);

  const setStartingLife = useCallback((life: number) => {
    setGame((g) => {
      const players = g.players.map((p) => ({
        ...p,
        life: p.life === g.startingLife || p.life > life ? life : p.life,
      }));
      return { ...g, players, startingLife: life };
    });
  }, []);

  const addPlayer = useCallback(() => {
    if (!newName.trim() || game.players.length >= 6) return;
    const id = crypto.randomUUID();
    setGame((g) => {
      const players = [...g.players, {
        id,
        name: newName.trim(),
        commanderName: newCommander.trim() || 'Commander',
        life: g.startingLife,
        poison: 0,
        energy: 0,
        experience: 0,
        commanderCasts: 0,
        isMonarch: false,
        hasInitiative: false,
        eliminated: false,
      }];
      const damage = { ...g.damage };
      damage[id] = {};
      for (const p of players) {
        if (p.id !== id) {
          damage[id][p.id] = 0;
          if (!damage[p.id]) damage[p.id] = {};
          damage[p.id][id] = 0;
        }
      }
      return { ...g, players, damage };
    });
    setNewName('');
    setNewCommander('');
  }, [newName, newCommander, game.players.length, game.startingLife]);

  const removePlayer = useCallback((id: string) => {
    setGame((g) => {
      const players = g.players.filter((p) => p.id !== id);
      const damage = { ...g.damage };
      delete damage[id];
      for (const key of Object.keys(damage)) {
        delete damage[key]?.[id];
      }
      return { ...g, players, damage };
    });
    setResetConfirm(false);
  }, []);

  const toggleEliminated = useCallback((playerId: string) => {
    setGame((g) => ({
      ...g,
      players: g.players.map((p) =>
        p.id === playerId ? { ...p, eliminated: !p.eliminated } : p,
      ),
    }));
  }, []);

  const updatePlayer = useCallback((playerId: string, field: keyof Player, delta: number) => {
    setGame((g) => ({
      ...g,
      players: g.players.map((p) =>
        p.id === playerId ? { ...p, [field]: Math.max(0, (p[field] as number) + delta) } : p,
      ),
    }));
  }, []);

  const addCommanderDamage = useCallback((attackerId: string, defenderId: string) => {
    setGame((g) => {
      const damage = { ...g.damage };
      if (!damage[attackerId]) damage[attackerId] = {};
      damage[attackerId] = {
        ...damage[attackerId],
        [defenderId]: (damage[attackerId]?.[defenderId] || 0) + 1,
      };
      return { ...g, damage };
    });
  }, []);

  const subtractCommanderDamage = useCallback((attackerId: string, defenderId: string) => {
    setGame((g) => {
      const damage = { ...g.damage };
      if (!damage[attackerId]) damage[attackerId] = {};
      damage[attackerId] = {
        ...damage[attackerId],
        [defenderId]: Math.max(0, (damage[attackerId]?.[defenderId] || 0) - 1),
      };
      return { ...g, damage };
    });
  }, []);

  const toggleMonarch = useCallback((playerId: string) => {
    setGame((g) => ({
      ...g,
      players: g.players.map((p) => ({
        ...p,
        isMonarch: p.id === playerId ? !p.isMonarch : false,
      })),
    }));
  }, []);

  const toggleInitiative = useCallback((playerId: string) => {
    setGame((g) => ({
      ...g,
      players: g.players.map((p) => ({
        ...p,
        hasInitiative: p.id === playerId ? !p.hasInitiative : false,
      })),
    }));
  }, []);

  const incrementCast = useCallback((playerId: string) => {
    setGame((g) => ({
      ...g,
      players: g.players.map((p) =>
        p.id === playerId ? { ...p, commanderCasts: p.commanderCasts + 1 } : p,
      ),
    }));
  }, []);

  const handleReset = useCallback(() => {
    if (!resetConfirm) {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 4000);
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    setGame({ players: [], damage: {}, startingLife: 40 });
    setResetConfirm(false);
  }, [resetConfirm]);

  const getCommanderTax = (casts: number) => Math.max(0, (casts - 1) * 2);

  const activePlayers = game.players.filter((p) => !p.eliminated);

  const lifeColor = (life: number) =>
    life > 30 ? 'text-success'
    : life > 15 ? 'text-primary'
    : life > 5 ? 'text-accent'
    : 'text-danger';

  if (!game.players.length) {
    return (
      <div className="max-w-xl mx-auto mt-12 space-y-6">
        <div className="text-center">
          <Swords size={48} className="mx-auto text-text-secondary/30 mb-3" />
          <h2 className="text-xl font-semibold text-text mb-2">Commander Damage Tracker</h2>
          <p className="text-text-secondary text-sm max-w-md mx-auto">
            Add players, track life totals, commander damage, poison, energy, experience, tax, monarch, and initiative.
          </p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-card shadow-sm p-6 shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
          <h3 className="text-sm font-semibold text-text mb-4">Game Setup</h3>

          <div className="mb-4">
            <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted block mb-2">Starting Life</span>
            <div className="flex gap-2">
              {[20, 30, 40].map((n) => (
                <button
                  key={n}
                  onClick={() => setStartingLife(n)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    game.startingLife === n
                      ? 'bg-primary/20 border border-primary/30 text-primary'
                      : 'bg-black/[0.02] border border-border/50 text-text-secondary hover:bg-black/[0.04]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <input type="text" placeholder="Player name" value={newName}
              onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
              className="w-full bg-black/[0.03] border border-border rounded-lg text-text px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-text-muted" />
            <input type="text" placeholder="Commander name (optional)" value={newCommander}
              onChange={(e) => setNewCommander(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
              className="w-full bg-black/[0.03] border border-border rounded-lg text-text px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-text-muted" />
            <button onClick={addPlayer} disabled={!newName.trim() || game.players.length >= 6}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/15 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <UserPlus size={16} /> Add Player ({game.players.length}/6)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const gridCols = game.players.length <= 2 ? 2 : Math.min(game.players.length, 4);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text">Damage Tracker</h2>
          <p className="text-sm text-text-muted">
            {activePlayers.length}/{game.players.length} players &middot; Starting life: {game.startingLife}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
              resetConfirm
                ? 'border-danger bg-danger/10 text-danger'
                : 'border-border-light text-text-secondary hover:border-danger hover:text-danger'
            }`}
          >
            <RotateCcw size={15} />
            {resetConfirm ? 'Confirm Reset?' : 'Reset'}
          </button>
        </div>
      </div>

      {/* Life Totals Grid */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
        {game.players.map((player) => {
          const isElim = player.eliminated;

          return (
            <div key={player.id} className={`rounded-2xl border p-5 shadow-[0_18px_36px_rgba(0,0,0,0.28)] flex flex-col items-center ${
              isElim
                ? 'border-border/30 bg-surface-secondary/50 opacity-60'
                : 'border-white/5 bg-card shadow-sm'
            }`}>
              {/* Name row */}
              <div className="flex items-center gap-2 mb-1">
                {isElim && <Skull size={14} className="text-text-muted" />}
                <span className={`text-sm font-semibold ${isElim ? 'text-text-muted line-through' : 'text-text'}`}>
                  {player.name}
                </span>
                <button onClick={() => removePlayer(player.id)}
                  className="text-text-muted hover:text-danger transition-colors" aria-label="Remove">
                  <Trash2 size={13} />
                </button>
              </div>
              <span className="text-[11px] text-text-muted mb-2">{player.commanderName}</span>

              {/* Eliminated toggle */}
              <button
                onClick={() => toggleEliminated(player.id)}
                className={`text-[10px] px-2 py-0.5 rounded-full mb-2 transition-colors ${
                  isElim
                    ? 'bg-text-muted/10 text-text-muted hover:bg-success/10 hover:text-success'
                    : 'bg-danger/10 border border-danger/15 text-danger/60'
                }`}
              >
                {isElim ? 'Eliminated' : 'Eliminate'}
              </button>

              {/* Life */}
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => updatePlayer(player.id, 'life', -1)}
                  className="w-9 h-9 rounded-xl bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 transition-colors flex items-center justify-center">
                  <Minus size={16} />
                </button>
                <span className={`text-3xl font-black tabular-nums min-w-[70px] text-center ${lifeColor(player.life)}`}>
                  {player.life}
                </span>
                <button onClick={() => updatePlayer(player.id, 'life', 1)}
                  className="w-9 h-9 rounded-xl bg-success/10 border border-success/20 text-success hover:bg-success/20 transition-colors flex items-center justify-center">
                  <Plus size={16} />
                </button>
              </div>

              {/* Quick +5/-5 */}
              <div className="flex gap-2 mb-3">
                <button onClick={() => updatePlayer(player.id, 'life', -5)}
                  className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-danger/5 border border-danger/10 text-danger/80 hover:bg-danger/10 transition-colors">-5</button>
                <button onClick={() => updatePlayer(player.id, 'life', 5)}
                  className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-success/5 border border-success/10 text-success/80 hover:bg-success/10 transition-colors">+5</button>
              </div>

              {/* Poison / Energy / Experience row */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-1">
                  <Droplets size={12} className="text-purple" />
                  <button onClick={() => updatePlayer(player.id, 'poison', -1)} disabled={player.poison <= 0}
                    className="text-[9px] text-text-muted hover:text-danger disabled:opacity-20">-</button>
                  <span className="text-xs font-bold tabular-nums text-text-secondary min-w-[16px] text-center">{player.poison}</span>
                  <button onClick={() => updatePlayer(player.id, 'poison', 1)}
                    className="text-[9px] text-text-muted hover:text-purple">+</button>
                </div>
                <div className="flex items-center gap-1">
                  <Zap size={12} className="text-primary" />
                  <button onClick={() => updatePlayer(player.id, 'energy', -1)} disabled={player.energy <= 0}
                    className="text-[9px] text-text-muted hover:text-danger disabled:opacity-20">-</button>
                  <span className="text-xs font-bold tabular-nums text-text-secondary min-w-[16px] text-center">{player.energy}</span>
                  <button onClick={() => updatePlayer(player.id, 'energy', 1)}
                    className="text-[9px] text-text-muted hover:text-primary">+</button>
                </div>
                <div className="flex items-center gap-1">
                  <Star size={12} className="text-primary" />
                  <button onClick={() => updatePlayer(player.id, 'experience', -1)} disabled={player.experience <= 0}
                    className="text-[9px] text-text-muted hover:text-danger disabled:opacity-20">-</button>
                  <span className="text-xs font-bold tabular-nums text-text-secondary min-w-[16px] text-center">{player.experience}</span>
                  <button onClick={() => updatePlayer(player.id, 'experience', 1)}
                    className="text-[9px] text-text-muted hover:text-primary">+</button>
                </div>
              </div>

              {/* Commander Casts */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-text-muted">Cast: {player.commanderCasts}</span>
                <span className="text-[10px] text-accent">Tax: +{getCommanderTax(player.commanderCasts)}</span>
                <button onClick={() => incrementCast(player.id)}
                  className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/15 text-primary text-xs hover:bg-primary/20 transition-colors flex items-center justify-center">+</button>
              </div>

              {/* Status Badges */}
              <div className="flex gap-2">
                <button onClick={() => toggleMonarch(player.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                    player.isMonarch ? 'bg-primary/20 border border-primary/30 text-primary'
                    : 'bg-black/[0.02] border border-border/50 text-text-muted hover:text-text-secondary'}`}>
                  <Crown size={12} /> Monarch
                </button>
                <button onClick={() => toggleInitiative(player.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                    player.hasInitiative ? 'bg-info/20 border border-info/30 text-info'
                    : 'bg-black/[0.02] border border-border/50 text-text-muted hover:text-text-secondary'}`}>
                  <Footprints size={12} /> Initiative
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Commander Damage Matrix */}
      {game.players.length >= 2 && (
        <div className="rounded-2xl border border-white/5 bg-card shadow-sm p-5 shadow-[0_18px_36px_rgba(0,0,0,0.28)] overflow-x-auto">
          <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary mb-4">
            Commander Damage
          </h3>
          <div className="min-w-[500px]">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-text-muted font-medium px-2 py-1 w-24">Attacker &rarr;<br />&darr; Defender</th>
                  {game.players.map((p) => (
                    <th key={p.id} className={`text-center font-medium px-2 py-1 ${p.eliminated ? 'text-text-muted/50' : 'text-text-secondary'}`}>
                      {p.name} {p.eliminated ? '(out)' : ''}
                    </th>
                  ))}
                  <th className="text-center text-danger font-bold px-2 py-1 w-16">Total</th>
                </tr>
              </thead>
              <tbody>
                {game.players.map((defender) => {
                  const totalDamage = game.players.reduce(
                    (sum, attacker) =>
                      attacker.id !== defender.id
                        ? sum + (game.damage[attacker.id]?.[defender.id] || 0)
                        : sum,
                    0,
                  );
                  return (
                    <tr key={defender.id} className={`border-t border-white/[0.02] ${defender.eliminated ? 'opacity-50' : ''}`}>
                      <td className={`px-2 py-1.5 font-medium truncate max-w-[100px] ${defender.eliminated ? 'text-text-muted line-through' : 'text-text'}`}>
                        {defender.name}
                      </td>
                      {game.players.map((attacker) => {
                        if (attacker.id === defender.id) {
                          return <td key={attacker.id} className="px-2 py-1.5 text-center text-border">&mdash;</td>;
                        }
                        const dmg = game.damage[attacker.id]?.[defender.id] || 0;
                        return (
                          <td key={attacker.id} className="px-2 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => subtractCommanderDamage(attacker.id, defender.id)}
                                disabled={dmg <= 0}
                                className="w-5 h-5 rounded-md bg-black/[0.02] border border-border/50 text-text-muted hover:text-danger hover:border-danger/20 text-[10px] flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed transition-colors">-</button>
                              <span className={`min-w-[24px] text-center font-bold tabular-nums ${dmg >= CMDR_DAMAGE_THRESHOLD ? 'text-danger' : 'text-text'}`}>
                                {dmg}
                              </span>
                              <button onClick={() => addCommanderDamage(attacker.id, defender.id)}
                                className="w-5 h-5 rounded-md bg-black/[0.02] border border-border/50 text-text-muted hover:text-success hover:border-success/20 text-[10px] flex items-center justify-center transition-colors">+</button>
                            </div>
                          </td>
                        );
                      })}
                      <td className={`px-2 py-1.5 text-center font-bold tabular-nums ${totalDamage >= CMDR_DAMAGE_THRESHOLD ? 'text-danger' : 'text-text-secondary'}`}>
                        {totalDamage}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-[10px] text-text-muted text-center">
            Red = {CMDR_DAMAGE_THRESHOLD}+ lethal threshold.
          </div>
        </div>
      )}

      {/* Add Player (in-game) */}
      {game.players.length < 6 && (
        <div className="rounded-2xl border border-dashed border-border p-4 flex flex-wrap items-center gap-3 bg-black/[0.01]">
          <input type="text" placeholder="Player name" value={newName}
            onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
            className="flex-1 min-w-[140px] bg-black/[0.03] border border-border rounded-lg text-text px-3 py-1.5 text-sm focus:outline-none focus:border-primary placeholder:text-text-muted" />
          <input type="text" placeholder="Commander name" value={newCommander}
            onChange={(e) => setNewCommander(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
            className="flex-1 min-w-[140px] bg-black/[0.03] border border-border rounded-lg text-text px-3 py-1.5 text-sm focus:outline-none focus:border-primary placeholder:text-text-muted" />
          <button onClick={addPlayer} disabled={!newName.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/15 text-primary text-sm hover:bg-primary/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <UserPlus size={14} /> Add
          </button>
        </div>
      )}
    </div>
  );
}

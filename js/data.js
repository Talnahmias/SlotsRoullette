/* ============================================================
 * Zombie Slots: Graveyard Defense — Game Data
 * Static definitions: symbols, combos, zombies, bosses, waves,
 * upgrades and the meta research tree.
 * ============================================================ */

/* ---------------------- SLOT SYMBOLS ---------------------- */
// weight = relative odds of landing on a reel
const SYMBOLS = {
  sword:     { id: 'sword',     glyph: '⚔️', name: 'Sword',     weight: 22, color: '#cdd6f4' },
  bomb:      { id: 'bomb',      glyph: '💣', name: 'Bomb',      weight: 12, color: '#f38ba8' },
  heart:     { id: 'heart',     glyph: '❤️', name: 'Heart',     weight: 14, color: '#ff6b81' },
  coin:      { id: 'coin',      glyph: '🪙', name: 'Coin',      weight: 18, color: '#f9e2af' },
  lightning: { id: 'lightning', glyph: '⚡', name: 'Lightning', weight: 10, color: '#89dceb' },
  shield:    { id: 'shield',    glyph: '🛡️', name: 'Shield',    weight: 9,  color: '#94e2d5' },
  skull:     { id: 'skull',     glyph: '💀', name: 'Skull',     weight: 8,  color: '#bac2de' },
  spin:      { id: 'spin',      glyph: '🔄', name: 'Spin',      weight: 7,  color: '#cba6f7' },
};

const SYMBOL_ORDER = ['sword', 'bomb', 'heart', 'coin', 'lightning', 'shield', 'skull', 'spin'];

// Per-symbol count tables (1 / 2 / 3 of a kind). Index 1..3.
const SYMBOL_TABLES = {
  sword:     { 1: 10, 2: 30, 3: 75 },        // single-target damage
  bomb:      { 1: 15, 2: 40, 3: 100 },       // splash (AoE) damage
  heart:     { 1: 10, 2: 30, 3: 75 },        // heal
  coin:      { 1: 10, 2: 30, 3: 75 },        // gold
  lightning: { 1: 15, 2: 25, 3: 40 },        // damage per chained target
  shield:    { 1: 15, 2: 35, 3: 60 },        // armor granted
  skull:     { 1: 50, 2: 120, 3: 9999 },     // crit single-target (x3 = instakill via combo)
  spin:      { 1: 1, 2: 2, 3: 5 },           // extra spins
};

// How many targets lightning chains to, by count of lightning symbols.
const LIGHTNING_TARGETS = { 1: 2, 2: 3, 3: 5 };

/* ---------------------- ZOMBIES ---------------------- */
// speed = distance covered per turn (battlefield is 0..100, gate at 0)
const ZOMBIE_TYPES = {
  walker:      { id: 'walker',      name: 'Walker',      glyph: '🧟', hp: 30,  dmg: 8,  speed: 12, reward: 5,  tier: 1 },
  runner:      { id: 'runner',      name: 'Runner',      glyph: '🧟‍♂️', hp: 45,  dmg: 10, speed: 24, reward: 10, tier: 2 },
  tank:        { id: 'tank',        name: 'Tank',        glyph: '🧟‍♀️', hp: 200, dmg: 22, speed: 8,  reward: 25, tier: 3 },
  exploder:    { id: 'exploder',    name: 'Exploder',    glyph: '🤢', hp: 40,  dmg: 35, speed: 14, reward: 20, tier: 2, explodes: true },
  necromancer: { id: 'necromancer', name: 'Necromancer', glyph: '🧙', hp: 90,  dmg: 5,  speed: 10, reward: 40, tier: 3, summons: true },
};

/* ---------------------- BOSSES (every 5 waves) ---------------------- */
const BOSSES = [
  { id: 'butcher',    name: 'The Butcher',  glyph: '🪓', hp: 500,  dmg: 40, speed: 7, reward: 500,  ability: 'Smashes the gate' },
  { id: 'toxicgiant', name: 'Toxic Giant',  glyph: '☣️', hp: 1000, dmg: 30, speed: 6, reward: 1000, ability: 'Poisons the gate', poison: 6 },
  { id: 'graveking',  name: 'Grave King',   glyph: '👑', hp: 2000, dmg: 50, speed: 5, reward: 1500, ability: 'Summons the dead', summons: true },
];

/* ---------------------- WAVE GENERATION ---------------------- */
// Returns an ordered list of zombie spawn descriptors for a given wave.
function buildWave(wave) {
  // Boss waves every 5th wave.
  if (wave % 5 === 0) {
    const bossIndex = Math.floor(wave / 5) - 1;
    const base = BOSSES[Math.min(bossIndex, BOSSES.length - 1)];
    // Scale bosses beyond wave 15 for endless mode.
    const cycles = Math.max(0, Math.floor((wave - 1) / 15));
    const scale = 1 + cycles * 0.6;
    const boss = {
      ...base,
      hp: Math.round(base.hp * scale),
      dmg: Math.round(base.dmg * (1 + cycles * 0.25)),
      reward: Math.round(base.reward * scale),
      isBoss: true,
    };
    // A few minions escort the boss on later cycles.
    const escorts = [];
    const escortCount = Math.min(6, cycles * 2);
    for (let i = 0; i < escortCount; i++) escorts.push({ type: 'runner' });
    return { isBoss: true, boss, list: [{ boss }, ...escorts] };
  }

  const list = [];
  const add = (type, n) => { for (let i = 0; i < n; i++) list.push({ type }); };

  // Difficulty cycle position (1..4 within each 5-wave block) and how many full cycles done.
  const cycle = Math.floor((wave - 1) / 5);
  const pos = ((wave - 1) % 5) + 1; // 1..4 (5 handled above)
  const bump = cycle * 4; // extra zombies per completed cycle

  switch (pos) {
    case 1:
      add('walker', 5 + bump);
      break;
    case 2:
      add('walker', 8 + bump);
      break;
    case 3:
      add('walker', 10 + bump);
      add('runner', 2 + cycle);
      break;
    case 4:
      add('walker', 8 + bump);
      add('runner', 3 + cycle);
      add('exploder', 2 + cycle);
      add('tank', 1 + cycle);
      if (cycle >= 1) add('necromancer', cycle);
      break;
  }
  return { isBoss: false, list };
}

/* ---------------------- IN-RUN UPGRADES (shop) ---------------------- */
// stat keys map to fields on the run state's `up` object.
const UPGRADE_POOL = [
  { id: 'sword',  name: 'Sharper Swords',  icon: '⚔️', desc: '+15% sword damage',   stat: 'sword',  amount: 0.15, baseCost: 40 },
  { id: 'bomb',   name: 'Bigger Bombs',    icon: '💣', desc: '+20% bomb damage',    stat: 'bomb',   amount: 0.20, baseCost: 50 },
  { id: 'heart',  name: 'Holy Water',      icon: '❤️', desc: '+15% heart healing',  stat: 'heart',  amount: 0.15, baseCost: 40 },
  { id: 'coin',   name: 'Greedy Grin',     icon: '🪙', desc: '+15% coin value',     stat: 'coin',   amount: 0.15, baseCost: 45 },
  { id: 'crit',   name: 'Cursed Edge',     icon: '💀', desc: '+8% critical chance', stat: 'crit',   amount: 0.08, baseCost: 60 },
  { id: 'spins',  name: 'Lucky Lever',     icon: '🔄', desc: '+1 starting spin',    stat: 'spins',  amount: 1,    baseCost: 70 },
  { id: 'gate',   name: 'Reinforced Gate', icon: '🧱', desc: '+25 max HP & repair', stat: 'gate',   amount: 25,   baseCost: 55 },
];

/* ---------------------- META RESEARCH TREE (permanent) ---------------------- */
const RESEARCH_TREE = [
  { id: 'hp',      name: 'Fortified Walls', icon: '🧱', desc: '+20 starting max HP per level',     max: 5,  cost: (l) => 100 + l * 120 },
  { id: 'odds',    name: 'Loaded Reels',    icon: '🎰', desc: 'Better attack-symbol odds',        max: 3,  cost: (l) => 150 + l * 200 },
  { id: 'coins',   name: 'Grave Robbing',   icon: '🪙', desc: '+10% coin rewards per level',       max: 5,  cost: (l) => 120 + l * 150 },
  { id: 'boss',    name: 'Boss Slayer',     icon: '🗡️', desc: '+15% damage to bosses per level',   max: 4,  cost: (l) => 180 + l * 220 },
  { id: 'spins',   name: 'Extra Spins',     icon: '🔄', desc: '+1 starting spin per level',        max: 4,  cost: (l) => 160 + l * 200 },
  { id: 'reel',    name: 'Fourth Reel',     icon: '➕', desc: 'Unlock a 4th reel (more combos!)',  max: 1,  cost: () => 1200 },
];

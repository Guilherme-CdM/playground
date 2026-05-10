export const VERSION = '1.0.0';
export const SAVE_KEY = 'barpress-impulse-ascension';
export const SAVE_SCHEMA = 2;
export const OFFLINE_CAP_SECONDS = 60 * 60 * 8;
export const AUTOSAVE_MS = 15_000;
export const BEAT_MS = 620;
export const RHYTHM_WINDOW_MS = 95;
export const CRIT_WINDOW_MS = 34;
export const TAP_COOLDOWN_MS = 74;
export const HOLD_PULSE_MS = 90;
export const HOLD_THRESHOLD_MS = 520;
export const LOG_LIMIT = 18;

export const STAGES = [
  { id: 0, name: 'Primitive Era', min: 0, bg: 'stage-0', hue: 208 },
  { id: 1, name: 'Cyber Era', min: 1e6, bg: 'stage-1', hue: 245 },
  { id: 2, name: 'Galactic Era', min: 1e10, bg: 'stage-2', hue: 273 },
  { id: 3, name: 'Quantum Era', min: 1e14, bg: 'stage-3', hue: 164 },
  { id: 4, name: 'Transcendence Era', min: 1e20, bg: 'stage-4', hue: 36 },
];

export const UPGRADE_DEFS = [
  {
    id: 'tap_core',
    name: 'Tap Core',
    tier: 'manual',
    icon: '◎',
    baseCost: 10,
    growth: 1.18,
    desc: 'Raises direct press value with diminishing returns after deep scaling.',
    effect: (lvl) => 1 + lvl * 1.0,
    unlock: () => true,
  },
  {
    id: 'rhythm_matrix',
    name: 'Rhythm Matrix',
    tier: 'manual',
    icon: '◉',
    baseCost: 60,
    growth: 1.22,
    desc: 'Expands the precision window and combo persistence.',
    effect: (lvl) => 1 + lvl * 0.12,
    unlock: (s) => s.upgrades.tap_core >= 4,
  },
  {
    id: 'auto_drones',
    name: 'Auto Drones',
    tier: 'automation',
    icon: '⟡',
    baseCost: 150,
    growth: 1.23,
    desc: 'Deploys passive drones that generate constant energy.',
    effect: (lvl) => lvl,
    unlock: (s) => s.totalEnergy >= 250,
  },
  {
    id: 'orbital_swarm',
    name: 'Orbital Swarm',
    tier: 'automation',
    icon: '✦',
    baseCost: 750,
    growth: 1.28,
    desc: 'Adds orbiting miners that multiply passive output.',
    effect: (lvl) => 1 + lvl * 0.22,
    unlock: (s) => s.upgrades.auto_drones >= 5,
  },
  {
    id: 'ai_conductor',
    name: 'AI Conductor',
    tier: 'synergy',
    icon: '⌁',
    baseCost: 5000,
    growth: 1.31,
    desc: 'Converts combo streaks into passive acceleration.',
    effect: (lvl) => 1 + lvl * 0.1,
    unlock: (s) => s.prestige.shards >= 4,
  },
  {
    id: 'quantum_grid',
    name: 'Quantum Grid',
    tier: 'quantum',
    icon: '⌬',
    baseCost: 24000,
    growth: 1.34,
    desc: 'Multiplicative boost with a soft cap that still rewards optimization.',
    effect: (lvl) => 1 + Math.log10(1 + lvl) * 0.35,
    unlock: (s) => s.totalEnergy >= 1e8,
  },
  {
    id: 'cosmic_lens',
    name: 'Cosmic Lens',
    tier: 'cosmic',
    icon: '⟠',
    baseCost: 120000,
    growth: 1.38,
    desc: 'Improves prestige gain and expands offline efficiency.',
    effect: (lvl) => 1 + lvl * 0.08,
    unlock: (s) => s.prestige.shards >= 20,
  },
  {
    id: 'transcendent_engine',
    name: 'Transcendent Engine',
    tier: 'transcendence',
    icon: '✧',
    baseCost: 800000,
    growth: 1.42,
    desc: 'A late-game engine that bends scaling and supercharges all layers.',
    effect: (lvl) => 1 + Math.sqrt(lvl) * 0.16,
    unlock: (s) => s.prestige.relics >= 1,
  },
  {
    id: 'entropy_brake',
    name: 'Entropy Brake',
    tier: 'utility',
    icon: '◈',
    baseCost: 900,
    growth: 1.26,
    desc: 'Reduces softcap pressure and increases hold rewards.',
    effect: (lvl) => 1 + lvl * 0.05,
    unlock: (s) => s.totalPresses >= 50,
  },
  {
    id: 'singularity_catalyst',
    name: 'Singularity Catalyst',
    tier: 'utility',
    icon: '⬢',
    baseCost: 1500000,
    growth: 1.46,
    desc: 'Rare upgrade with enormous scaling potential.',
    effect: (lvl) => 1 + lvl * 0.22,
    unlock: (s) => s.prestige.relics >= 2 && s.upgrades.transcendent_engine >= 3,
  },
];

export const ACHIEVEMENTS = [
  { id: 'first_press', name: 'First Impulse', desc: 'Generate your first energy.', check: (s) => s.totalPresses >= 1 },
  { id: 'combo_10', name: 'Tenfold Rhythm', desc: 'Reach a 10 combo.', check: (s) => s.bestCombo >= 10 },
  { id: 'combo_50', name: 'Machine Tempo', desc: 'Reach a 50 combo.', check: (s) => s.bestCombo >= 50 },
  { id: 'energy_1e4', name: 'Momentum', desc: 'Reach 10K lifetime energy.', check: (s) => s.totalEnergy >= 1e4 },
  { id: 'energy_1e9', name: 'Industrial Scale', desc: 'Reach 1B lifetime energy.', check: (s) => s.totalEnergy >= 1e9 },
  { id: 'ascend_1', name: 'Reborn', desc: 'Ascend once.', check: (s) => s.prestige.ascensions >= 1 },
  { id: 'ascend_5', name: 'Layer Walker', desc: 'Ascend five times.', check: (s) => s.prestige.ascensions >= 5 },
  { id: 'relic_1', name: 'Universe Memory', desc: 'Obtain one Relic.', check: (s) => s.prestige.relics >= 1 },
  { id: 'relic_5', name: 'Archive of Worlds', desc: 'Obtain five Relics.', check: (s) => s.prestige.relics >= 5 },
  { id: 'offline', name: 'After You Left', desc: 'Gain offline progress.', check: (s) => s.stats.offlineGained > 0 },
  { id: 'critical_25', name: 'Perfect Strike', desc: 'Trigger 25 critical impulses.', check: (s) => s.stats.criticals >= 25 },
  { id: 'hidden', name: 'Hidden Branch', desc: 'Unlock a secret event.', check: (s) => s.hidden.secretFound },
];

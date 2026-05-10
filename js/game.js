import { VERSION, UPGRADE_DEFS, ACHIEVEMENTS, STAGES, BEAT_MS, RHYTHM_WINDOW_MS, CRIT_WINDOW_MS, TAP_COOLDOWN_MS, HOLD_THRESHOLD_MS, HOLD_PULSE_MS, AUTOSAVE_MS, OFFLINE_CAP_SECONDS, LOG_LIMIT } from './config.js';
import { formatNumber, formatRate, formatDuration } from './utils/format.js';
import { clamp, lerp, softcap, log10 } from './utils/math.js';
import { loadLocalSave, storeLocalSave, clearLocalSave, serializeSave, deserializeSave } from './core/storage.js';
import { AudioSystem } from './systems/audio.js';
import { ParticleSystem } from './systems/particles.js';

const DEFAULT_STATE = () => ({
  version: VERSION,
  energy: 0,
  totalEnergy: 0,
  totalPresses: 0,
  bestCombo: 0,
  prestige: { ascensions: 0, shards: 0, relics: 0 },
  upgrades: Object.fromEntries(UPGRADE_DEFS.map((u) => [u.id, 0])),
  achievements: {},
  stats: { clicks: 0, criticals: 0, combos: 0, offlineGained: 0, boosts: 0, resets: 0 },
  hidden: { secretFound: false },
  timing: { lastPress: 0, lastTick: performance.now(), holdStart: 0, holdActive: false, beatOffset: Math.random() * BEAT_MS, lastSave: 0, lastAuto: performance.now() },
  economy: { combo: 1, comboTimer: 0, rhythmText: 'Neutral', precisionText: '—', tapBuffer: 0, antiSpam: 0, eventTimer: 0, boostMs: 0, boostMult: 1, stageId: 0 },
  history: { runPeak: 0, lifetimePeakCombo: 0 },
});

const STAGE_BY_INDEX = STAGES.map((s) => s.name);

export class Game {
  constructor() {
    this.state = DEFAULT_STATE();
    this.clock = performance.now();
    this.lastRender = 0;
    this.pendingMessage = '';
    this.pendingMessageAt = 0;
    this.dom = this.cacheDom();
    this.particles = new ParticleSystem(this.dom.fx);
    this.audio = new AudioSystem({ sound: true });
    this.load();
    this.bind();
    this.render(true);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    setInterval(() => this.autosave(), AUTOSAVE_MS);
  }

  cacheDom() {
    const $ = (id) => document.getElementById(id);
    return {
      fx: $('fx'),
      app: $('app'),
      energyValue: $('energyValue'),
      tapValue: $('tapValue'),
      passiveValue: $('passiveValue'),
      comboValue: $('comboValue'),
      shardValue: $('shardValue'),
      relicValue: $('relicValue'),
      stageLabel: $('stageLabel'),
      rhythmValue: $('rhythmValue'),
      precisionValue: $('precisionValue'),
      incomeValue: $('incomeValue'),
      message: $('message'),
      upgradeList: $('upgradeList'),
      upgradeCount: $('upgradeCount'),
      achievementList: $('achievementList'),
      achievementCount: $('achievementCount'),
      logList: $('logList'),
      coreButton: $('coreButton'),
      ascendButton: $('ascendButton'),
      collapseButton: $('collapseButton'),
      saveButton: $('saveButton'),
      exportButton: $('exportButton'),
      importButton: $('importButton'),
      resetButton: $('resetButton'),
      saveBox: $('saveBox'),
      prestigeInfo: $('prestigeInfo'),
    };
  }

  bind() {
    this.dom.coreButton.addEventListener('pointerdown', (e) => this.press('tap', e));
    this.dom.coreButton.addEventListener('click', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.audio.unlock();
        this.press('keyboard', e);
      }
    }, { passive: false });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.state.timing.holdActive = false;
    });

    const holdStart = () => {
      this.audio.unlock();
      this.state.timing.holdStart = performance.now();
      this.state.timing.holdActive = true;
    };
    this.dom.coreButton.addEventListener('pointerdown', holdStart);
    this.dom.coreButton.addEventListener('pointerup', () => this.state.timing.holdActive = false);
    this.dom.coreButton.addEventListener('pointerleave', () => this.state.timing.holdActive = false);

    this.dom.ascendButton.addEventListener('click', () => this.ascend());
    this.dom.collapseButton.addEventListener('click', () => this.collapse());
    this.dom.saveButton.addEventListener('click', () => this.autosave(true));
    this.dom.exportButton.addEventListener('click', () => {
      this.dom.saveBox.value = serializeSave(this.exportState());
      this.toast('Save exported to the box below.');
    });
    this.dom.importButton.addEventListener('click', () => this.importFromBox());
    this.dom.resetButton.addEventListener('click', () => this.hardReset());
  }

  exportState() {
    return {
      ...this.state,
      timing: {
        ...this.state.timing,
        lastTick: performance.now(),
      },
    };
  }

  load() {
    const offlineNow = Date.now();
    const saved = loadLocalSave();
    if (!saved) {
      this.toast('New universe initialized.');
      this.rebuildUI();
      return;
    }
    try {
      const payload = saved.state ?? saved;
      this.state = this.migrate(payload);
      const elapsed = clamp((offlineNow - (saved.savedAt || Date.now())) / 1000, 0, OFFLINE_CAP_SECONDS);
      const offlineGain = this.computePassivePerSecond() * elapsed * this.offlineEfficiency();
      if (offlineGain > 0) {
        this.state.energy += offlineGain;
        this.state.totalEnergy += offlineGain;
        this.state.stats.offlineGained += offlineGain;
        this.toast(`Offline synthesis: +${formatNumber(offlineGain)} energy.`);
      }
    } catch (err) {
      console.warn(err);
      this.toast('Save could not be read. Starting a fresh run.');
    }
    this.rebuildUI();
  }

  migrate(raw) {
    const state = DEFAULT_STATE();
    if (!raw) return state;
    Object.assign(state, raw);
    state.prestige = { ...DEFAULT_STATE().prestige, ...(raw.prestige || {}) };
    state.upgrades = { ...DEFAULT_STATE().upgrades, ...(raw.upgrades || {}) };
    state.achievements = { ...DEFAULT_STATE().achievements, ...(raw.achievements || {}) };
    state.stats = { ...DEFAULT_STATE().stats, ...(raw.stats || {}) };
    state.hidden = { ...DEFAULT_STATE().hidden, ...(raw.hidden || {}) };
    state.timing = { ...DEFAULT_STATE().timing, ...(raw.timing || {}) };
    state.economy = { ...DEFAULT_STATE().economy, ...(raw.economy || {}) };
    state.history = { ...DEFAULT_STATE().history, ...(raw.history || {}) };
    if (!state.version) state.version = VERSION;
    return state;
  }

  hardReset() {
    if (!confirm('Hard reset will erase the local save. Continue?')) return;
    clearLocalSave();
    this.state = DEFAULT_STATE();
    this.toast('Hard reset complete.');
    this.rebuildUI();
    this.render(true);
  }

  importFromBox() {
    const raw = this.dom.saveBox.value.trim();
    if (!raw) return;
    try {
      const payload = deserializeSave(raw);
      this.state = this.migrate(payload.state ?? payload);
      this.toast('Save imported successfully.');
      this.rebuildUI();
      this.render(true);
      this.autosave(true);
    } catch (err) {
      console.warn(err);
      this.toast('Import failed. The string is corrupted or from a newer schema.');
    }
  }

  autosave(force = false) {
    const now = performance.now();
    if (!force && now - this.state.timing.lastSave < AUTOSAVE_MS - 300) return;
    try {
      this.state.timing.lastSave = now;
      storeLocalSave(this.exportState());
      this.toast('Saved.');
    } catch (err) {
      console.warn(err);
      this.toast('Could not save right now.');
    }
  }

  computeStage() {
    const value = this.state.totalEnergy + this.state.prestige.relics * 1e18;
    let stage = 0;
    for (let i = STAGES.length - 1; i >= 0; i--) {
      if (value >= STAGES[i].min) {
        stage = i;
        break;
      }
    }
    return STAGES[stage];
  }

  getUpgradeLevel(id) {
    return this.state.upgrades[id] || 0;
  }

  getUpgradeCost(def) {
    const lvl = this.getUpgradeLevel(def.id);
    const soft = lvl >= 20 ? 1 + (lvl - 19) * 0.08 : 1;
    return Math.floor(def.baseCost * Math.pow(def.growth, lvl) * soft);
  }

  isUnlocked(def) {
    try {
      return def.unlock(this.state);
    } catch {
      return false;
    }
  }

  buyUpgrade(id) {
    const def = UPGRADE_DEFS.find((u) => u.id === id);
    if (!def || !this.isUnlocked(def)) return;
    const cost = this.getUpgradeCost(def);
    if (this.state.energy < cost) return;
    this.state.energy -= cost;
    this.state.upgrades[id] += 1;
    this.state.stats.boosts += 1;
    this.audio.upgrade();
    this.particles.emitBurst(window.innerWidth * .5, window.innerHeight * .45, 26);
    this.log(`${def.name} upgraded to level ${this.state.upgrades[id]}.`);
    this.rebuildUI();
  }

  computeMultipliers() {
    const u = this.state.upgrades;
    const tapCore = 1 + u.tap_core * 1.0;
    const rhythm = 1 + u.rhythm_matrix * 0.12;
    const drones = 1 + u.auto_drones * 0.14;
    const swarm = 1 + u.orbital_swarm * 0.22;
    const ai = 1 + u.ai_conductor * 0.1;
    const quantum = 1 + Math.log10(1 + u.quantum_grid) * 0.35;
    const cosmic = 1 + u.cosmic_lens * 0.08;
    const transcend = 1 + Math.sqrt(u.transcendent_engine || 0) * 0.16;
    const entropy = 1 + u.entropy_brake * 0.05;
    const catalyst = 1 + u.singularity_catalyst * 0.22;
    const prestige = 1 + this.state.prestige.shards * 0.045 + this.state.prestige.relics * 0.22;
    const combo = 1 + Math.min(this.state.economy.combo, 120) * 0.04;
    return {
      tap: tapCore * rhythm * quantum * cosmic * transcend * prestige * catalyst,
      passive: drones * swarm * ai * quantum * cosmic * transcend * prestige * entropy * catalyst * combo,
      rhythm,
      prestige,
    };
  }

  computeTapPower() {
    const m = this.computeMultipliers();
    const base = 1 + this.state.upgrades.tap_core * 1.0;
    const soft = softcap(base, 64, 0.72);
    const runBonus = 1 + Math.min(log10(this.state.totalEnergy + 1) * 0.06, 6);
    return soft * m.tap * runBonus;
  }

  computePassivePerSecond() {
    const u = this.state.upgrades;
    const multi = this.computeMultipliers();
    const base = u.auto_drones * 1.5 + u.orbital_swarm * 9 + u.ai_conductor * 18 + u.quantum_grid * 52 + u.cosmic_lens * 140 + u.transcendent_engine * 500 + u.singularity_catalyst * 1000;
    const prod = base * multi.passive;
    return prod * this.offlineEfficiency();
  }

  offlineEfficiency() {
    const lens = 1 + this.state.upgrades.cosmic_lens * 0.03;
    const brake = 1 + this.state.upgrades.entropy_brake * 0.01;
    const relic = 1 + this.state.prestige.relics * 0.05;
    return clamp((lens * brake * relic) / 1.4, 0.25, 1.75);
  }

  tickTimers(dt) {
    const now = performance.now();
    this.state.economy.comboTimer = Math.max(0, this.state.economy.comboTimer - dt * 1000);
    this.state.economy.boostMs = Math.max(0, this.state.economy.boostMs - dt * 1000);
    this.state.economy.eventTimer = Math.max(0, this.state.economy.eventTimer - dt * 1000);
    this.state.timing.antiSpam = Math.max(0, this.state.timing.antiSpam - dt * 1000);
    const isHolding = this.state.timing.holdActive && now - this.state.timing.holdStart >= HOLD_THRESHOLD_MS;
    if (isHolding) {
      this.state.timing.tapBuffer += dt * 1000;
      while (this.state.timing.tapBuffer >= HOLD_PULSE_MS) {
        this.state.timing.tapBuffer -= HOLD_PULSE_MS;
        this.press('hold');
      }
    } else {
      this.state.timing.tapBuffer = 0;
    }
  }

  press(source = 'tap', event = null) {
    const now = performance.now();
    if (now - this.state.timing.lastPress < TAP_COOLDOWN_MS * 0.55 && source !== 'hold') {
      this.state.timing.antiSpam += 1;
      return;
    }
    this.audio.unlock();
    const multipliers = this.computeMultipliers();
    const beatPhase = (now + this.state.timing.beatOffset) % BEAT_MS;
    const rhythmDelta = Math.min(beatPhase, BEAT_MS - beatPhase);
    const rhythmBonus = rhythmDelta <= RHYTHM_WINDOW_MS ? lerp(1.08, 1.5, 1 - rhythmDelta / RHYTHM_WINDOW_MS) : 1;
    const crit = rhythmDelta <= CRIT_WINDOW_MS || (this.state.economy.combo >= 20 && Math.random() < 0.08);
    const comboStep = now - this.state.timing.lastPress <= BEAT_MS * 1.15 ? 1 : -Math.max(1, this.state.economy.combo * 0.35);
    this.state.economy.combo = clamp(this.state.economy.combo + comboStep, 1, 9999);
    this.state.economy.comboTimer = BEAT_MS / 1000;
    this.state.economy.rhythmText = rhythmDelta <= RHYTHM_WINDOW_MS ? 'Aligned' : 'Neutral';
    this.state.economy.precisionText = crit ? 'Critical' : rhythmDelta <= RHYTHM_WINDOW_MS ? 'Aligned' : '—';
    this.state.bestCombo = Math.max(this.state.bestCombo, this.state.economy.combo);
    this.state.history.lifetimePeakCombo = Math.max(this.state.history.lifetimePeakCombo, this.state.economy.combo);
    const holdBonus = source === 'hold' ? 0.62 : 1;
    const antiSpamPenalty = 1 / (1 + this.state.timing.antiSpam * 0.09);
    const boost = this.state.economy.boostMs > 0 ? this.state.economy.boostMult : 1;
    const value = this.computeTapPower() * rhythmBonus * (crit ? 2.5 : 1) * holdBonus * antiSpamPenalty * boost;
    const gained = value;
    this.state.energy += gained;
    this.state.totalEnergy += gained;
    this.state.totalPresses += 1;
    this.state.stats.clicks += 1;
    if (crit) this.state.stats.criticals += 1;
    if (this.state.economy.combo > 1) this.state.stats.combos += 1;
    this.state.timing.lastPress = now;
    this.state.timing.holdStart = source === 'hold' ? this.state.timing.holdStart : now;
    this.state.timing.beatOffset = (this.state.timing.beatOffset + 17) % BEAT_MS;

    const x = event?.clientX ?? window.innerWidth * .5;
    const y = event?.clientY ?? window.innerHeight * .45;
    this.particles.emitBurst(x, y, crit ? 24 : 14);
    this.particles.emitText(x + 16, y - 10, `+${formatNumber(gained)}`, crit ? 'var(--warn)' : 'var(--accent)');
    this.audio.click(crit ? 1.8 : 1);

    if (crit) this.log('Critical impulse. Timing alignment detected.');
    if (this.state.economy.combo >= 10 && this.state.economy.combo % 10 === 0) {
      this.log(`Combo reached x${this.state.economy.combo.toFixed(0)}.`);
    }

    this.state.hidden.secretFound ||= this.state.totalPresses >= 7 && this.state.economy.combo >= 7;
    this.checkRandomEvents();
    this.checkAchievements();
    this.rebuildUI();
  }

  checkRandomEvents() {
    if (this.state.economy.eventTimer > 0) return;
    const stage = this.computeStage().id;
    const chance = [0.06, 0.08, 0.1, 0.12, 0.14][stage] || 0.08;
    if (Math.random() > chance) return;
    const events = [
      { name: 'Quantum Fluctuation', boost: 1.5, duration: 18000, message: 'Quantum fluctuation: +50% impulse output.' },
      { name: 'AI Inspiration', boost: 2.2, duration: 12000, message: 'AI inspiration: clicks and passives are amplified.' },
      { name: 'Cosmic Windfall', boost: 3.0, duration: 9000, message: 'Cosmic windfall: a rare surge rewrites the economy.' },
    ];
    const evt = events[(Math.random() * events.length) | 0];
    this.state.economy.boostMs = evt.duration;
    this.state.economy.boostMult = evt.boost;
    this.state.economy.eventTimer = evt.duration;
    this.log(evt.message);
    this.audio.event();
    this.particles.emitBurst(window.innerWidth * .5, window.innerHeight * .3, 44);
  }

  computePrestigeGain() {
    const score = Math.max(0, log10(this.state.totalEnergy + 1) - 6);
    const bonus = 1 + this.state.upgrades.cosmic_lens * 0.03;
    return Math.floor(Math.pow(score, 1.8) * bonus);
  }

  ascend() {
    const gain = this.computePrestigeGain();
    if (gain <= 0) return this.toast('Need more lifetime energy to ascend.');
    const confirmText = `Ascend and gain ${gain} Shards? This resets the run but keeps permanent progress.`;
    if (!confirm(confirmText)) return;
    this.state.prestige.ascensions += 1;
    this.state.prestige.shards += gain;
    this.state.stats.resets += 1;
    this.state.energy = 0;
    this.state.totalPresses = 0;
    this.state.bestCombo = 0;
    this.state.economy.combo = 1;
    this.state.economy.comboTimer = 0;
    this.state.timing.lastPress = 0;
    this.state.timing.tapBuffer = 0;
    this.state.timing.holdActive = false;
    this.audio.prestige();
    this.log(`Ascension complete. +${gain} Shards.`);
    this.particles.emitBurst(window.innerWidth * .5, window.innerHeight * .45, 56);
    this.rebuildUI();
    this.autosave(true);
  }

  collapse() {
    if (this.state.prestige.shards < 50) {
      this.toast('Collapse requires 50 Shards.');
      return;
    }
    const gain = Math.max(1, Math.floor(Math.log10(this.state.prestige.shards + 1) - 1));
    const confirmText = `Collapse the universe and gain ${gain} Relic${gain > 1 ? 's' : ''}? This resets Shards but permanently increases meta power.`;
    if (!confirm(confirmText)) return;
    this.state.prestige.relics += gain;
    this.state.prestige.shards = 0;
    this.state.energy = 0;
    this.state.totalEnergy = 0;
    this.state.totalPresses = 0;
    this.state.bestCombo = 0;
    this.state.economy.combo = 1;
    this.state.economy.comboTimer = 0;
    this.state.timing.lastPress = 0;
    this.state.stats.resets += 1;
    this.audio.prestige();
    this.log(`Universe collapse initiated. +${gain} Relic${gain > 1 ? 's' : ''}.`);
    this.particles.emitBurst(window.innerWidth * .5, window.innerHeight * .45, 88);
    this.rebuildUI();
    this.autosave(true);
  }

  stageName() {
    return this.computeStage().name;
  }

  checkAchievements() {
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (!this.state.achievements[a.id] && a.check(this.state)) {
        this.state.achievements[a.id] = true;
        changed = true;
        this.log(`Achievement unlocked: ${a.name}.`);
        this.particles.emitBurst(window.innerWidth * .5, window.innerHeight * .22, 32);
      }
    }
    if (changed) this.rebuildUI();
  }

  rebuildUI() {
    this.renderUpgrades();
    this.renderAchievements();
    this.renderStats();
    this.renderPrestigeInfo();
  }

  renderUpgrades() {
    const frag = document.createDocumentFragment();
    let purchased = 0;
    for (const def of UPGRADE_DEFS) {
      const lvl = this.getUpgradeLevel(def.id);
      purchased += lvl;
      const card = document.createElement('div');
      const unlocked = this.isUnlocked(def);
      card.className = `card ${unlocked ? '' : 'locked'}`;
      const cost = this.getUpgradeCost(def);
      card.innerHTML = `
        <div>
          <div class="card-title"><span class="badge">${def.icon}</span><span>${def.name}</span><span class="pill">Lv. ${lvl}</span></div>
          <div class="card-desc">${def.desc}</div>
          <div class="card-meta">
            <span class="pill">${def.tier}</span>
            <span class="pill">Cost: ${formatNumber(cost)}</span>
          </div>
        </div>
        <button class="buy" ${(!unlocked || this.state.energy < cost) ? 'disabled' : ''}>${lvl ? 'Upgrade' : 'Unlock'}</button>
      `;
      card.querySelector('button').addEventListener('click', () => this.buyUpgrade(def.id));
      frag.appendChild(card);
    }
    this.dom.upgradeList.replaceChildren(frag);
    this.dom.upgradeCount.textContent = `${purchased} purchased`;
  }

  renderAchievements() {
    const frag = document.createDocumentFragment();
    let unlocked = 0;
    for (const a of ACHIEVEMENTS) {
      const done = !!this.state.achievements[a.id];
      unlocked += done ? 1 : 0;
      const el = document.createElement('div');
      el.className = `achievement ${done ? 'unlocked' : 'locked'}`;
      el.innerHTML = `<strong>${done ? '✓' : '◌'} ${a.name}</strong><div class="achievement-desc">${a.desc}</div><small>${done ? 'Unlocked' : 'Locked'}</small>`;
      frag.appendChild(el);
    }
    this.dom.achievementList.replaceChildren(frag);
    this.dom.achievementCount.textContent = `${unlocked} / ${ACHIEVEMENTS.length}`;
  }

  renderStats() {
    const mult = this.computeMultipliers();
    const tap = this.computeTapPower();
    const passive = this.computePassivePerSecond();
    const stage = this.computeStage();
    this.dom.energyValue.textContent = formatNumber(this.state.energy);
    this.dom.tapValue.textContent = `+${formatNumber(tap)}`;
    this.dom.passiveValue.textContent = formatRate(passive);
    this.dom.comboValue.textContent = `x${(1 + this.state.economy.combo * 0.04).toFixed(2)}`;
    this.dom.shardValue.textContent = formatNumber(this.state.prestige.shards);
    this.dom.relicValue.textContent = formatNumber(this.state.prestige.relics);
    this.dom.stageLabel.textContent = stage.name;
    this.dom.incomeValue.textContent = formatRate(passive + tap * 1.15);
    this.dom.rhythmValue.textContent = this.state.economy.rhythmText || (this.state.economy.comboTimer > 0 ? 'Alive' : 'Neutral');
    this.dom.precisionValue.textContent = this.state.economy.precisionText || (this.state.economy.combo >= 5 ? 'Armed' : '—');
    this.dom.app.className = `app stage-${stage.id}`;
    document.documentElement.style.setProperty('--accent', stage.id >= 3 ? '#62f6c7' : stage.id >= 2 ? '#9b7bff' : '#77b7ff');
    document.documentElement.style.setProperty('--accent-2', stage.id >= 4 ? '#ffd36b' : '#9b7bff');
    this.audio.setAmbience(stage.hue);
    this.dom.message.textContent = this.currentMessage();
    this.dom.collapseButton.disabled = this.state.prestige.shards < 50;
    this.dom.ascendButton.disabled = this.computePrestigeGain() <= 0;
  }

  renderPrestigeInfo() {
    const gain = this.computePrestigeGain();
    this.dom.prestigeInfo.textContent = gain > 0
      ? `Ascend now for ${formatNumber(gain)} Shards. Collapse becomes available at 50 Shards and awards Relics.`
      : 'Reach more lifetime energy to unlock prestige gains. Shards permanently strengthen the next run.';
  }

  currentMessage() {
    if (this.state.economy.boostMs > 0) return `Temporary boost active: x${this.state.economy.boostMult.toFixed(2)} production.`;
    if (this.state.economy.combo >= 30) return 'The system is resonating. Every press is a structured cascade.';
    if (this.state.bestCombo >= 10) return 'The beat is alive. Precision builds power.';
    return 'Press space to generate Impulse Energy. Hold the rhythm to multiply output.';
  }

  toast(msg) {
    this.dom.message.textContent = msg;
    this.pendingMessage = msg;
    this.pendingMessageAt = performance.now();
  }

  log(text) {
    const line = document.createElement('div');
    line.className = 'log-entry';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.textContent = `[${time}] ${text}`;
    this.dom.logList.prepend(line);
    while (this.dom.logList.children.length > LOG_LIMIT) this.dom.logList.removeChild(this.dom.logList.lastElementChild);
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.clock) / 1000 || 0.016);
    this.clock = now;
    this.tickTimers(dt);
    const passive = this.computePassivePerSecond();
    const holdActive = this.state.timing.holdActive && performance.now() - this.state.timing.holdStart >= HOLD_THRESHOLD_MS;
    if (passive > 0) {
      this.state.energy += passive * dt;
      this.state.totalEnergy += passive * dt;
    }
    if (now - this.lastRender > 33) {
      this.render(false);
      this.lastRender = now;
    }
    this.particles.update(dt);
    if (this.state.timing.holdActive && !holdActive) this.state.timing.holdActive = false;
    requestAnimationFrame(this.loop);
  }

  render(force = false) {
    this.dom.energyValue.textContent = formatNumber(this.state.energy);
    this.dom.tapValue.textContent = `+${formatNumber(this.computeTapPower())}`;
    this.dom.passiveValue.textContent = formatRate(this.computePassivePerSecond());
    this.dom.comboValue.textContent = `x${(1 + this.state.economy.combo * 0.04).toFixed(2)}`;
    this.dom.shardValue.textContent = formatNumber(this.state.prestige.shards);
    this.dom.relicValue.textContent = formatNumber(this.state.prestige.relics);
    this.dom.stageLabel.textContent = this.computeStage().name;
    this.dom.upgradeCount.textContent = `${Object.values(this.state.upgrades).reduce((a,b)=>a+b,0)} purchased`;
    this.dom.achievementCount.textContent = `${Object.values(this.state.achievements).filter(Boolean).length} / ${ACHIEVEMENTS.length}`;
    this.dom.saveBox.value = this.dom.saveBox.value && !force ? this.dom.saveBox.value : this.dom.saveBox.value;
    if (force) this.rebuildUI();
    this.renderPrestigeInfo();
    this.updateButtons();
  }

  updateButtons() {
    const frag = UPGRADE_DEFS.map((def) => {
      const unlocked = this.isUnlocked(def);
      const cost = this.getUpgradeCost(def);
      return { id: def.id, unlocked, cost };
    });
    const cards = [...this.dom.upgradeList.children];
    frag.forEach((info, i) => {
      const card = cards[i];
      if (!card) return;
      const btn = card.querySelector('button');
      btn.disabled = !info.unlocked || this.state.energy < info.cost;
    });
  }
}

export function startGame() {
  const game = new Game();
  window.__BARPRESS__ = game;
  return game;
}

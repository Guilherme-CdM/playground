export class AudioSystem {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.ambient = null;
    this.enabled = false;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.25;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  unlock() {
    if (!this.settings.sound) return;
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    this.enabled = true;
    this.playAmbient(0.18);
  }

  blip(freq = 440, duration = 0.08, gain = 0.08, type = 'sine') {
    if (!this.settings.sound || !this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    env.gain.setValueAtTime(0.0001, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(env);
    env.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  click(intensity = 1) {
    this.blip(220 + Math.random() * 120 + intensity * 40, 0.06, 0.06 + intensity * 0.03, 'triangle');
    this.blip(880 + Math.random() * 90, 0.03, 0.02 + intensity * 0.01, 'sine');
  }

  upgrade() {
    this.blip(330, 0.12, 0.06, 'sawtooth');
    this.blip(660, 0.1, 0.05, 'triangle');
  }

  prestige() {
    this.blip(160, 0.18, 0.06, 'sine');
    this.blip(240, 0.24, 0.05, 'triangle');
  }

  event() {
    this.blip(520, 0.08, 0.06, 'square');
    this.blip(1040, 0.04, 0.03, 'triangle');
  }

  playAmbient(level = 0.12) {
    if (!this.settings.sound || !this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || this.ambient) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 48;
    gain.gain.value = level * 0.3;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.ambient = { osc, gain };
  }

  setAmbience(stageHue = 200) {
    if (!this.ambient || !this.ctx) return;
    this.ambient.osc.frequency.setTargetAtTime(40 + stageHue * 0.2, this.ctx.currentTime, 0.4);
    this.ambient.gain.gain.setTargetAtTime(0.02 + (stageHue % 100) / 1000, this.ctx.currentTime, 0.5);
  }
}

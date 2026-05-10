import { clamp, lerp } from '../utils/math.js';

class Particle {
  constructor() {
    this.alive = false;
    this.x = this.y = this.vx = this.vy = this.life = this.maxLife = this.size = 0;
    this.rot = this.spin = 0;
    this.color = 'rgba(255,255,255,1)';
    this.shape = 0;
    this.scale = 1;
  }
}

export class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 0;
    this.height = 0;
    this.pool = Array.from({ length: 420 }, () => new Particle());
    this.textPool = [];
    this.shake = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  emitBurst(x, y, count, palette = ['rgba(119,183,255,1)', 'rgba(155,123,255,1)', 'rgba(98,246,199,1)']) {
    for (let i = 0; i < count; i++) {
      const p = this.pool.find((item) => !item.alive);
      if (!p) break;
      p.alive = true;
      p.x = x;
      p.y = y;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.4 + Math.random() * 5.2;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - Math.random() * 1.3;
      p.life = 0;
      p.maxLife = 0.45 + Math.random() * 0.7;
      p.size = 1 + Math.random() * 4.6;
      p.rot = Math.random() * Math.PI;
      p.spin = (Math.random() - 0.5) * 0.2;
      p.color = palette[(Math.random() * palette.length) | 0];
      p.shape = Math.random() > 0.55 ? 1 : 0;
      p.scale = 0.8 + Math.random() * 1.2;
    }
    this.shake = Math.min(18, this.shake + count * 0.18);
  }

  emitText(x, y, text, color = '#edf4ff') {
    this.textPool.push({ x, y, text, life: 0, maxLife: 1.2, vy: -28, color });
  }

  update(dt) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.shake > 0.01) {
      const dx = (Math.random() - 0.5) * this.shake;
      const dy = (Math.random() - 0.5) * this.shake;
      ctx.save();
      ctx.translate(dx, dy);
      this.shake = Math.max(0, this.shake - dt * 35);
      this.drawParticles(ctx, dt);
      ctx.restore();
    } else {
      this.drawParticles(ctx, dt);
    }
    this.drawText(ctx, dt);
  }

  drawParticles(ctx, dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        continue;
      }
      p.x += p.vx * (dt * 60);
      p.y += p.vy * (dt * 60);
      p.vy += 0.03 * (dt * 60);
      p.rot += p.spin * (dt * 60);
      const t = p.life / p.maxLife;
      const alpha = 1 - t;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape) {
        ctx.fillRect(-p.size * p.scale, -p.size * 0.5, p.size * 2 * p.scale, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size * p.scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawText(ctx, dt) {
    for (let i = this.textPool.length - 1; i >= 0; i--) {
      const t = this.textPool[i];
      t.life += dt;
      if (t.life >= t.maxLife) {
        this.textPool.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      ctx.save();
      ctx.globalAlpha = clamp(1 - t.life / t.maxLife, 0, 1);
      ctx.fillStyle = t.color;
      ctx.font = '700 18px Inter, sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = 10;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }
}

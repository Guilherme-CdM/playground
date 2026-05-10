const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg'];
export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '∞';
  const abs = Math.abs(value);
  if (abs < 1000) return value.toLocaleString(undefined, { maximumFractionDigits: value < 10 ? digits : 0 });
  const exp = Math.floor(Math.log10(abs));
  const group = Math.floor(exp / 3);
  const suffix = SUFFIXES[group];
  if (suffix) {
    const scaled = value / Math.pow(1000, group);
    return `${scaled.toFixed(scaled < 10 ? digits : 1)}${suffix}`;
  }
  if (abs < 1e33) return `${(value / Math.pow(10, exp)).toFixed(2)}e${exp}`;
  return engineeringNotation(value);
}
export function engineeringNotation(value) {
  if (!Number.isFinite(value) || value === 0) return '0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const exp = Math.floor(Math.log10(abs));
  const eng = exp - (exp % 3);
  const mantissa = abs / Math.pow(10, eng);
  return `${sign}${mantissa.toFixed(mantissa < 10 ? 2 : 1)}e${eng}`;
}
export function hyperNotation(value) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value < 1e308) return formatNumber(value);
  const l1 = Math.log10(value);
  const l2 = Math.log10(l1);
  if (l2 < 1e6) return `10^^${l2.toFixed(2)}`;
  return `10^^^${Math.log10(l2).toFixed(2)}`;
}
export function formatRate(value) {
  return `${formatNumber(value, 2)} /s`;
}
export function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

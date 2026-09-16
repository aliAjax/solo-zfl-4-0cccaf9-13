// 扩散实验室用到的展示工具

/** 秒 → 「12 分 05 秒」/「1 时 03 分」/「45 秒」 */
export function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '未散去';
  const s = Math.round(sec);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分 ${String(s % 60).padStart(2, '0')} 秒`;
  const h = Math.floor(m / 60);
  return `${h} 时 ${String(m % 60).padStart(2, '0')} 分`;
}

/** 紧凑秒数（用于图表标签）：45s / 12:05 / 1:03:20 */
export function formatDurationShort(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '未散去';
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}:${String(s % 60).padStart(2, '0')}`;
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtNum(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 1) return v.toFixed(digits);
  if (abs >= 0.01) return v.toFixed(3);
  return v.toExponential(2);
}

/** m³/s ↔ L/s */
export function toLs(m3s: number): number {
  return m3s * 1000;
}
export function fromLs(ls: number): number {
  return ls / 1000;
}

/** 浓度配色（0 → 米纸色，高 → 焦赭色），带透明度输出 rgba */
export function concentrationColor(c: number, cMax: number): [number, number, number] {
  const t = cMax > 0 ? Math.min(1, Math.max(0, c / cMax)) : 0;
  // 纸色 #EDE3CC(237,227,204) → 赭 #A06932(160,105,50) → 焦褐 #5C3A1D(92,58,29)
  if (t < 0.6) {
    const k = t / 0.6;
    return [
      Math.round(237 + (160 - 237) * k),
      Math.round(227 + (105 - 227) * k),
      Math.round(204 + (50 - 204) * k),
    ];
  }
  const k = (t - 0.6) / 0.4;
  return [
    Math.round(160 + (92 - 160) * k),
    Math.round(105 + (58 - 105) * k),
    Math.round(50 + (29 - 50) * k),
  ];
}

/** 散去时间配色（越早→苔绿，越晚→砖红；未散去→灰紫） */
export function clearTimeColor(t: number, tMax: number): [number, number, number] {
  if (!Number.isFinite(t)) return [155, 138, 166]; // lavender-500
  const k = tMax > 0 ? Math.min(1, t / tMax) : 0;
  // moss #7DA08C(125,160,140) → ochre #B8894F(184,137,79) → brick #B8623A(184,98,58)
  if (k < 0.55) {
    const q = k / 0.55;
    return [
      Math.round(125 + (184 - 125) * q),
      Math.round(160 + (137 - 160) * q),
      Math.round(140 + (79 - 140) * q),
    ];
  }
  const q = (k - 0.55) / 0.45;
  return [
    Math.round(184 + (184 - 184) * q),
    Math.round(137 + (98 - 137) * q),
    Math.round(79 + (58 - 79) * q),
  ];
}

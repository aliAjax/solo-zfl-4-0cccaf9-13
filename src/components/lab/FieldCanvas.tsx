import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SimResult, SimFrame } from '../../diffusion/types';
import { concentrationColor, fmtNum } from '../../diffusion/format';

export interface ProbePoint {
  x: number;
  y: number;
}

interface Props {
  result: SimResult;
  mode: 'concentration' | 'clearTime';
  frame?: SimFrame;
  showContour?: boolean;
  pinned?: ProbePoint | null;
  onPin?: (p: ProbePoint | null) => void;
}

const PAD = { left: 38, right: 10, top: 10, bottom: 24 };
const SOURCE_COLOR = '#3D5A4A';
const VENT_COLOR = '#3D6B9E';
const LAST_COLOR = '#B8623A';

// Marching Squares 线段表（每格 0~15，点对序列，点编号 0=底边左→右,1=右边下→上,2=顶边右→左,3=左边上→下）
const SEG_TABLE: number[][][] = [
  [],
  [[0, 3]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [[0, 3], [1, 2]],
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]],
  [[0, 1], [2, 3]],
  [[1, 2]],
  [[1, 3]],
  [[0, 1]],
  [[0, 3]],
  [],
];

export default function FieldCanvas({ result, mode, frame, showContour = true, pinned, onPin }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cssWidth, setCssWidth] = useState(520);
  const [hover, setHover] = useState<{ px: number; py: number; x: number; y: number } | null>(null);

  const { nx, ny, dx, dy } = result.grid;
  const L = nx * dx;
  const W = ny * dy;
  const cMax = result.params.intensity;
  const ctMax = useMemo(() => {
    let m = 0;
    for (let k = 0; k < result.clearTime.length; k++) {
      const t = result.clearTime[k];
      if (Number.isFinite(t) && t > m) m = t;
    }
    return m;
  }, [result]);
  // 首达时间为 0 的格（气味从未到达）单独显示中性纸色；
  // 其余时间做平方根归一化，拉开早散去区域的层次。
  const ctShade = useMemo(() => makeCtShade(ctMax), [ctMax]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setCssWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 单元场 -> 离屏 canvas
  const offscreen = useMemo(() => {
    const off = document.createElement('canvas');
    off.width = nx;
    off.height = ny;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const val = mode === 'concentration' ? (frame ? frame.field[k] : 0) : result.clearTime[k];
        const [r, g, b] =
          mode === 'concentration'
            ? concentrationColor(val, cMax)
            : ctShade(val);
        // 未散去（clearTime = Infinity）单独降低饱和：clearTimeColor 已处理
        const o = k * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return off;
  }, [result, mode, frame, nx, ny, cMax, ctShade]);

  const plot = useMemo(() => {
    const w = cssWidth;
    const h = w * (W / L);
    return {
      w,
      h,
      x0: PAD.left,
      y0: PAD.top,
      pw: w - PAD.left - PAD.right,
      ph: h - PAD.top - PAD.bottom,
    };
  }, [cssWidth, L, W]);

  const toRoom = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const fx = (clientX - rect.left - plot.x0) / plot.pw;
      const fy = (clientY - rect.top - plot.y0) / plot.ph;
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
      return { x: fx * L, y: fy * W, px: clientX - rect.left, py: clientY - rect.top };
    },
    [plot, L, W],
  );

  // 主绘制
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(plot.w * dpr);
    canvas.height = Math.round(plot.h * dpr);
    canvas.style.width = `${plot.w}px`;
    canvas.style.height = `${plot.h}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, plot.w, plot.h);

    // 热图
    ctx.drawImage(offscreen, plot.x0, plot.y0, plot.pw, plot.ph);

    // 阈值等值线（marching squares）
    if (mode === 'concentration' && frame && showContour) {
      drawContour(ctx, result, frame, plot);
    }

    // 边框（墙）
    ctx.strokeStyle = '#5C3A1D';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(plot.x0, plot.y0, plot.pw, plot.ph);

    // 坐标轴刻度
    ctx.fillStyle = 'rgba(74,63,51,0.65)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ticksX = Math.min(6, Math.max(2, Math.round(L)));
    for (let t = 0; t <= ticksX; t++) {
      const xm = (t / ticksX) * L;
      const px = plot.x0 + (xm / L) * plot.pw;
      ctx.fillText(`${xm.toFixed(t === 0 || t === ticksX ? 0 : 1)}`, px, plot.y0 + plot.ph + 5);
      ctx.strokeStyle = 'rgba(92,58,29,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, plot.y0 + plot.ph);
      ctx.lineTo(px, plot.y0 + plot.ph + 3);
      ctx.stroke();
    }
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const ticksY = Math.min(5, Math.max(2, Math.round(W)));
    for (let t = 0; t <= ticksY; t++) {
      const ym = (t / ticksY) * W;
      const py = plot.y0 + plot.ph - (ym / W) * plot.ph;
      ctx.fillText(`${ym.toFixed(t === 0 || t === ticksY ? 0 : 1)}`, plot.x0 - 6, py);
    }
    ctx.restore();

    const mx = (xm: number) => plot.x0 + (xm / L) * plot.pw;
    const my = (ym: number) => plot.y0 + plot.ph - (ym / W) * plot.ph;

    // 源点
    drawMarker(ctx, mx(result.params.sourceX), my(result.params.sourceY), SOURCE_COLOR, '源', 8);
    // 风口
    result.params.vents.forEach((v, i) => {
      drawMarker(ctx, mx(v.x), my(v.y), VENT_COLOR, v.flow > 0 ? `风${i + 1}` : '闭', 7, v.flow <= 0);
    });
    // 最晚散去点
    if (result.lastPoint && (result.roomClearTime !== null || mode === 'clearTime')) {
      const lp = result.lastPoint;
      ctx.strokeStyle = LAST_COLOR;
      ctx.lineWidth = 2;
      const px = mx(lp.x);
      const py = my(lp.y);
      ctx.beginPath();
      ctx.moveTo(px - 9, py);
      ctx.lineTo(px + 9, py);
      ctx.moveTo(px, py - 9);
      ctx.lineTo(px, py + 9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = LAST_COLOR;
      ctx.fill();
    }
    // 钉住的探针
    if (pinned) {
      const px = mx(pinned.x);
      const py = my(pinned.y);
      ctx.strokeStyle = '#2A2118';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#2A2118';
      ctx.fill();
    }
  }, [offscreen, plot, result, mode, frame, showContour, pinned, L, W]);

  const handleMove = (e: React.MouseEvent) => {
    const r = toRoom(e.clientX, e.clientY);
    setHover(r);
  };

  const probeConc = hover && frame && mode === 'concentration'
    ? bilinear(result, frame, hover.x, hover.y)
    : null;
  const probeClear = hover && mode === 'clearTime'
    ? result.clearTime[indexAt(result, hover.x, hover.y)]
    : null;

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <canvas
        ref={canvasRef}
        className="block w-full rounded-xl cursor-crosshair touch-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          if (!onPin) return;
          const r = toRoom(e.clientX, e.clientY);
          if (!r) {
            onPin(null);
            return;
          }
          if (pinned && Math.abs(pinned.x - r.x) < dx && Math.abs(pinned.y - r.y) < dy) {
            onPin(null);
          } else {
            onPin({ x: r.x, y: r.y });
          }
        }}
      />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 bg-ink-900/90 text-paper-50 text-[11px] rounded-lg px-2.5 py-1.5 leading-tight whitespace-nowrap shadow-lg"
          style={{
            left: Math.min(hover.px + 12, plot.w - 150),
            top: Math.max(hover.py - 44, 4),
          }}
        >
          <div>({fmtNum(hover.x, 2)}, {fmtNum(hover.y, 2)}) m</div>
          {mode === 'concentration' && probeConc !== null && (
            <div>浓度 <b>{fmtNum(probeConc, 3)}</b> / 阈值 {result.params.threshold}</div>
          )}
          {mode === 'clearTime' && (
            <div>
              首达阈值：
              <b>{Number.isFinite(probeClear ?? NaN) ? `${fmtNum(probeClear!, 0)} s` : '总时长内未散去'}</b>
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-700/70">
        <Legend color={SOURCE_COLOR} label="气味源" />
        <Legend color={VENT_COLOR} label="通风口" />
        <Legend color={LAST_COLOR} label="最晚散去点" mark="cross" />
        <span>点击图面可钉住探针，再点一次取消</span>
      </div>
    </div>
  );
}

function Legend({ color, label, mark = 'dot' }: { color: string; label: string; mark?: 'dot' | 'cross' }) {
  return (
    <span className="inline-flex items-center gap-1">
      {mark === 'dot' ? (
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      ) : (
        <span className="relative w-2.5 h-2.5">
          <span className="absolute left-1/2 top-0 bottom-0 w-px" style={{ backgroundColor: color }} />
          <span className="absolute top-1/2 left-0 right-0 h-px" style={{ backgroundColor: color }} />
        </span>
      )}
      {label}
    </span>
  );
}

/** 首达阈值时间配色：t=0（从未到达）纸色；Infinity（未散去）淡紫灰；其余按 sqrt(t/tMax) 映射 */
function makeCtShade(ctMax: number): (t: number) => [number, number, number] {
  return (t: number) => {
    if (!Number.isFinite(t)) return [184, 173, 196];
    if (t <= 0 || ctMax <= 0) return [237, 227, 204];
    const k = Math.sqrt(Math.min(1, t / ctMax));
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
  };
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  color: string,
  text: string,
  r = 7,
  faded = false,
) {
  ctx.save();
  ctx.globalAlpha = faded ? 0.45 : 1;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#FBF7EE';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#FBF7EE';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, px, py + 0.5);
  ctx.restore();
}

function drawContour(
  ctx: CanvasRenderingContext2D,
  result: SimResult,
  frame: SimFrame,
  plot: { x0: number; y0: number; pw: number; ph: number },
) {
  const { nx, ny, dx, dy } = result.grid;
  const L = nx * dx;
  const W = ny * dy;
  const thr = result.params.threshold;
  // 角点网格 (nx+1)×(ny+1)，节点 (a,b) 物理坐标 (a·dx, b·dy)，自房间左下角起。
  // 角点值取相邻格平均（边界角点自然按 Neumann 外推）。
  const node = (a: number, b: number) => nodes[b * (nx + 1) + a];
  const nodes = new Float64Array((nx + 1) * (ny + 1));
  for (let b = 0; b <= ny; b++) {
    for (let a = 0; a <= nx; a++) {
      let s = 0;
      let cnt = 0;
      for (const db of [-1, 0]) {
        for (const da of [-1, 0]) {
          const ci = a + da;
          const cj = b + db;
          if (ci >= 0 && ci < nx && cj >= 0 && cj < ny) {
            s += frame.field[cj * nx + ci];
            cnt++;
          }
        }
      }
      nodes[b * (nx + 1) + a] = s / cnt;
    }
  }

  // 单元 (i,jc) 四角：BL=(i,jc) 位1，BR=(i+1,jc) 位2，TR=(i+1,jc+1) 位4，TL=(i,jc+1) 位8
  // 边：0=底(BL→BR)，1=右(BR→TR)，2=顶(TR→TL)，3=左(TL→BL)
  const edgeXY = (i: number, jc: number, edge: number): [number, number] => {
    let x = 0;
    let y = 0;
    const interp = (va: number, vb: number) => (thr - va) / (vb - va);
    if (edge === 0) {
      const t = interp(node(i, jc), node(i + 1, jc));
      x = (i + t) * dx;
      y = jc * dy;
    } else if (edge === 1) {
      const t = interp(node(i + 1, jc), node(i + 1, jc + 1));
      x = (i + 1) * dx;
      y = (jc + t) * dy;
    } else if (edge === 2) {
      const t = interp(node(i + 1, jc + 1), node(i, jc + 1));
      x = (i + 1 - t) * dx;
      y = (jc + 1) * dy;
    } else {
      const t = interp(node(i, jc + 1), node(i, jc));
      x = i * dx;
      y = (jc + 1 - t) * dy;
    }
    return [x, y];
  };

  ctx.save();
  ctx.strokeStyle = 'rgba(251,247,238,0.95)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  for (let jc = 0; jc < ny; jc++) {
    for (let i = 0; i < nx; i++) {
      const code =
        (node(i, jc) > thr ? 1 : 0) +
        (node(i + 1, jc) > thr ? 2 : 0) +
        (node(i + 1, jc + 1) > thr ? 4 : 0) +
        (node(i, jc + 1) > thr ? 8 : 0);
      for (const [e1, e2] of SEG_TABLE[code]) {
        const [x1, y1] = edgeXY(i, jc, e1);
        const [x2, y2] = edgeXY(i, jc, e2);
        ctx.moveTo(plot.x0 + (x1 / L) * plot.pw, plot.y0 + plot.ph - (y1 / W) * plot.ph);
        ctx.lineTo(plot.x0 + (x2 / L) * plot.pw, plot.y0 + plot.ph - (y2 / W) * plot.ph);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

function indexAt(result: SimResult, x: number, y: number): number {
  const { nx, ny, dx, dy } = result.grid;
  const i = Math.min(nx - 1, Math.max(0, Math.floor(x / dx)));
  const j = Math.min(ny - 1, Math.max(0, Math.floor(y / dy)));
  return j * nx + i;
}

function bilinear(result: SimResult, frame: SimFrame, x: number, y: number): number {
  const { nx, ny, dx, dy } = result.grid;
  const fx = x / dx - 0.5;
  const fy = y / dy - 0.5;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;
  const at = (i: number, j: number) =>
    frame.field[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  return (at(i0, j0) * (1 - tx) + at(i0 + 1, j0) * tx) * (1 - ty) +
    (at(i0, j0 + 1) * (1 - tx) + at(i0 + 1, j0 + 1) * tx) * ty;
}

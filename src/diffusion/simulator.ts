// 二维气味扩散 + 通风口排风求解器
// 数值方法：显式 FTCS 有限差分扩散；四壁 Neumann 无通量边界（封闭房间质量严格守恒）；
// 通风口按有限体积「单元汇」排风，排出量逐步入账（开通风房间总量 = 室内余量 + 累计排出）。
import type {
  SimParams,
  GridInfo,
  ValidationResult,
  ValidationIssue,
  SimFrame,
  SimResult,
} from './types';

/** 网格规模上限：超过即判定「网格过密」，防止浏览器内存/算力爆炸 */
export const MAX_CELLS = 14_400; // 120 × 120
/** 时间步总数上限：dt 相对总时长过小会导致步数爆炸 */
export const MAX_STEPS = 120_000;
/** 单场计算量预算（格数 × 步数）上限，防止总耗时过长 */
export const MAX_CELL_STEPS = 30_000_000;
/** 回放快照上限帧 */
export const MAX_FRAMES = 140;
/** 显式 FTCS 二维扩散稳定上限：D·dt·(1/dx² + 1/dy²) ≤ 0.5 */
const CFL_LIMIT = 0.5;
const EPS = 1e-12;

function issue(
  list: ValidationIssue[],
  level: 'error' | 'warning',
  field: string,
  message: string,
) {
  list.push({ level, field, message });
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * 校验参数并构建网格。error 级问题不允许运行模拟；warning 级仅提示。
 */
export function validateParams(p: SimParams): ValidationResult {
  const issues: ValidationIssue[] = [];

  // ---- 基础数值合法性（NaN / 负数 / 零）----
  if (!isFiniteNum(p.roomLength) || p.roomLength <= 0)
    issue(issues, 'error', 'roomLength', '房间长度必须为大于 0 的数值（米），不能为负或空。');
  if (!isFiniteNum(p.roomWidth) || p.roomWidth <= 0)
    issue(issues, 'error', 'roomWidth', '房间宽度必须为大于 0 的数值（米），不能为负或空。');
  if (!isFiniteNum(p.roomHeight) || p.roomHeight <= 0)
    issue(issues, 'error', 'roomHeight', '层高必须为大于 0 的数值（米），不能为负或空。');
  if (!isFiniteNum(p.intensity) || p.intensity <= 0)
    issue(issues, 'error', 'intensity', '气味强度必须大于 0。');
  else if (p.intensity > 10)
    issue(issues, 'warning', 'intensity', '气味强度通常在 1~10 之间，当前值超出常规刻度。');
  if (!isFiniteNum(p.sourceRadius) || p.sourceRadius < 0)
    issue(issues, 'error', 'sourceRadius', '源斑半径不能为负（点源填 0）。');
  if (!isFiniteNum(p.diffusionCoeff) || p.diffusionCoeff < 0)
    issue(issues, 'error', 'diffusionCoeff', '扩散系数不能为负（静止空气可取 0，仅靠通风排出）。');
  if (!isFiniteNum(p.dx) || p.dx <= 0)
    issue(issues, 'error', 'dx', '网格步长必须为大于 0 的数值（米）。');
  if (!isFiniteNum(p.dy) || p.dy <= 0)
    issue(issues, 'error', 'dy', '网格步长必须为大于 0 的数值（米）。');
  if (!isFiniteNum(p.totalTime) || p.totalTime <= 0)
    issue(issues, 'error', 'totalTime', '总时长必须为大于 0 的数值（秒）。');
  if (!isFiniteNum(p.dt) || p.dt <= 0)
    issue(issues, 'error', 'dt', '时间步长必须为大于 0 的数值（秒）。');
  if (!isFiniteNum(p.threshold) || p.threshold <= 0)
    issue(issues, 'error', 'threshold', '安全阈值必须为大于 0 的浓度值。');

  const geomReady =
    isFiniteNum(p.roomLength) && p.roomLength > 0 &&
    isFiniteNum(p.roomWidth) && p.roomWidth > 0 &&
    isFiniteNum(p.roomHeight) && p.roomHeight > 0 &&
    isFiniteNum(p.dx) && p.dx > 0 &&
    isFiniteNum(p.dy) && p.dy > 0;

  let grid: GridInfo | null = null;
  let maxStableDt: number | null = null;

  if (geomReady) {
    const nx = Math.max(2, Math.round(p.roomLength / p.dx));
    const ny = Math.max(2, Math.round(p.roomWidth / p.dy));
    const dxEff = p.roomLength / nx;
    const dyEff = p.roomWidth / ny;
    const cells = nx * ny;
    const cellVolume = dxEff * dyEff * p.roomHeight;

    // 源点位置：必须落在墙内（坐标区间 [0, L] × [0, W]）
    if (!isFiniteNum(p.sourceX) || !isFiniteNum(p.sourceY)) {
      issue(issues, 'error', 'source', '源点坐标必须是数字。');
    } else {
      if (p.sourceX < -EPS || p.sourceX > p.roomLength + EPS)
        issue(
          issues,
          'error',
          'sourceX',
          `源点在墙外：x=${p.sourceX} m 超出房间范围 [0, ${p.roomLength}] m。`,
        );
      if (p.sourceY < -EPS || p.sourceY > p.roomWidth + EPS)
        issue(
          issues,
          'error',
          'sourceY',
          `源点在墙外：y=${p.sourceY} m 超出房间范围 [0, ${p.roomWidth}] m。`,
        );
      if (
        p.sourceX >= 0 && p.sourceX <= p.roomLength &&
        p.sourceY >= 0 && p.sourceY <= p.roomWidth &&
        (p.sourceX === 0 || p.sourceX === p.roomLength || p.sourceY === 0 || p.sourceY === p.roomWidth)
      )
        issue(issues, 'warning', 'source', '源点恰好在墙上，模拟时会贴到最近的室内格。');
    }

    // 通风口：位置、面积、风量
    const seenVentCell = new Set<number>();
    p.vents.forEach((v, idx) => {
      const tag = `vent-${v.id ?? idx}`;
      if (!isFiniteNum(v.x) || !isFiniteNum(v.y)) {
        issue(issues, 'error', tag, `第 ${idx + 1} 个通风口坐标必须是数字。`);
        return;
      }
      if (v.x < -EPS || v.x > p.roomLength + EPS || v.y < -EPS || v.y > p.roomWidth + EPS)
        issue(issues, 'error', tag, `第 ${idx + 1} 个通风口在墙外：(${v.x}, ${v.y}) m。`);
      if (!isFiniteNum(v.area) || v.area < 0)
        issue(issues, 'error', tag, `第 ${idx + 1} 个通风口面积不能为负。`);
      else if (v.area === 0 && isFiniteNum(v.flow) && v.flow > 0)
        issue(issues, 'error', tag, `第 ${idx + 1} 个通风口面积为 0，却设置了正风量，物理上不可能排风。`);
      if (!isFiniteNum(v.flow) || v.flow < 0)
        issue(issues, 'error', tag, `第 ${idx + 1} 个通风口风量不能为负（关闭请填 0）。`);

      if (
        v.x >= 0 && v.x <= p.roomLength && v.y >= 0 && v.y <= p.roomWidth &&
        isFiniteNum(v.area) && v.area > 0
      ) {
        const vi = clampIndex(Math.round(v.x / dxEff), nx);
        const vj = clampIndex(Math.round(v.y / dyEff), ny);
        const key = vj * nx + vi;
        if (seenVentCell.has(key))
          issue(issues, 'warning', tag, `第 ${idx + 1} 个通风口与另一通风口落在同一网格，排风将叠加。`);
        seenVentCell.add(key);
      }
    });

    // 网格密度
    if (cells > MAX_CELLS) {
      const suggest = Math.sqrt((p.roomLength * p.roomWidth) / (MAX_CELLS / 1.5));
      issue(
        issues,
        'error',
        'grid',
        `网格过密：${nx} × ${ny} = ${cells.toLocaleString()} 格，超过上限 ${MAX_CELLS.toLocaleString()} 格。请加大网格步长（建议 ≥ ${suggest.toFixed(2)} m）。`,
      );
    }
    if (dxEff < 0.02 || dyEff < 0.02)
      issue(issues, 'warning', 'grid', `网格步长过小（实际 ${dxEff.toFixed(3)} × ${dyEff.toFixed(3)} m），2 厘米以下精度对气味扩散意义不大且很慢。`);

    const sourceI = isFiniteNum(p.sourceX)
      ? clampIndex(Math.round(Math.min(Math.max(p.sourceX, 0), p.roomLength) / dxEff), nx)
      : 0;
    const sourceJ = isFiniteNum(p.sourceY)
      ? clampIndex(Math.round(Math.min(Math.max(p.sourceY, 0), p.roomWidth) / dyEff), ny)
      : 0;

    let steps = 0;
    if (isFiniteNum(p.totalTime) && p.totalTime > 0 && isFiniteNum(p.dt) && p.dt > 0) {
      steps = Math.max(1, Math.ceil(p.totalTime / p.dt));
      if (steps > MAX_STEPS) {
        issue(
          issues,
          'error',
          'dt',
          `时间步数过多：${steps.toLocaleString()} 步（超过上限 ${MAX_STEPS.toLocaleString()}）。请加大时间步长或缩短总时长。`,
        );
      }
      // 计算量预算：格数 × 步数
      if (cells * steps > MAX_CELL_STEPS) {
        issue(
          issues,
          'error',
          'grid',
          `计算量过大：${cells.toLocaleString()} 格 × ${steps.toLocaleString()} 步 = ${(cells * steps / 1e6).toFixed(1)}M 格·步（上限 ${MAX_CELL_STEPS / 1e6}M）。请加大网格步长或时间步长。`,
        );
      }

      // CFL 稳定条件
      if (isFiniteNum(p.diffusionCoeff) && p.diffusionCoeff > 0) {
        maxStableDt = CFL_LIMIT / (p.diffusionCoeff * (1 / (dxEff * dxEff) + 1 / (dyEff * dyEff)));
        if (p.dt > maxStableDt * (1 + 1e-9)) {
          issue(
            issues,
            'error',
            'dt',
            `时间步长越过显式扩散稳定条件（CFL）：当前 dt=${p.dt}s，最大允许 dt≈${maxStableDt.toFixed(3)}s。请调小 dt 或加大网格步长。`,
          );
        }
      }

      // 通风口单格换气率的显式稳定提示（排分项被限幅保正，过强时给警告）
      p.vents.forEach((v, idx) => {
        if (isFiniteNum(v.flow) && v.flow > 0 && isFiniteNum(v.area) && v.area > 0) {
          const effectiveArea = Math.min(v.area, dxEff * dyEff);
          const turnover = v.flow / (effectiveArea * p.roomHeight); // 1/s
          if (turnover * p.dt > 1 + 1e-9) {
            issue(
              issues,
              'warning',
              `vent-${v.id ?? idx}`,
              `第 ${idx + 1} 个通风口局部换气过强：建议 dt ≤ ${(1 / turnover).toFixed(3)}s（或增大风口面积），否则排风会被限幅近似。`,
            );
          }
        }
      });
    }

    if (isFiniteNum(p.threshold) && p.threshold > 0 && isFiniteNum(p.intensity) && p.intensity > 0) {
      if (p.threshold >= p.intensity)
        issue(issues, 'warning', 'threshold', '安全阈值不低于源点初始强度，t=0 时即视为全部达标。');
    }

    if (isFiniteNum(p.diffusionCoeff) && p.diffusionCoeff === 0) {
      const hasFlow = p.vents.some((v) => v.flow > 0);
      if (!hasFlow)
        issue(issues, 'warning', 'diffusionCoeff', '扩散系数为 0 且没有任何排风：气味将永远停在源区，房间不会散去。');
    }

    grid = {
      nx,
      ny,
      cells,
      dx: dxEff,
      dy: dyEff,
      cellVolume,
      sourceI,
      sourceJ,
      steps,
    };
  }

  return {
    ok: !issues.some((i) => i.level === 'error'),
    issues,
    grid,
    maxStableDt,
  };
}

function clampIndex(raw: number, n: number): number {
  return Math.min(Math.max(raw, 0), n - 1);
}

function sum(a: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}

/**
 * 步进式引擎：init 后反复 step()，可分块让出主线程。
 * 质量账（封闭守恒 / 通风「室内+排出」闭合）只依赖离散方程本身，
 * 与分块方式无关，所以异步驱动与一次性运行结果完全一致。
 */
export interface SimEngine {
  params: SimParams;
  grid: GridInfo;
  nSteps: number;
  field: Float64Array;
  clearTime: Float64Array;
  frames: SimFrame[];
  stepIndex: number;
  removedByVents: number;
  maxConcentration: number;
  earlyStopped: boolean;
  initialMass: number;
  /** 执行最多 budgetSteps 步；返回是否已结束 */
  step: (budgetSteps: number) => boolean;
  finish: () => SimResult;
}

export function createEngine(p: SimParams, validation?: ValidationResult): SimEngine {
  const v = validation ?? validateParams(p);
  if (!v.ok || !v.grid) {
    throw new Error('参数校验未通过，无法运行模拟：' + v.issues.map((i) => i.message).join('；'));
  }
  const g = v.grid;
  const { nx, ny, cellVolume } = g;
  const nSteps = Math.max(1, Math.ceil(p.totalTime / p.dt));
  g.steps = nSteps;
  const n = nx * ny;

  const initial: Float64Array = new Float64Array(n);
  // 初始场：源点周围 sourceRadius 圆内格浓度 = intensity（峰值即气味强度），至少覆盖源格
  {
    let coveredAny = false;
    if (p.sourceRadius > 0) {
      const r2 = p.sourceRadius * p.sourceRadius;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const cx = (i + 0.5) * g.dx;
          const cy = (j + 0.5) * g.dy;
          if ((cx - p.sourceX) ** 2 + (cy - p.sourceY) ** 2 <= r2) {
            initial[j * nx + i] = p.intensity;
            coveredAny = true;
          }
        }
      }
    }
    if (!coveredAny) initial[g.sourceJ * nx + g.sourceI] = p.intensity;
  }

  const clearTime = new Float64Array(n).fill(Infinity);
  for (let k = 0; k < n; k++) if (initial[k] <= p.threshold) clearTime[k] = 0;

  // 通风口 -> 网格单元映射（同格多口风量叠加）
  const betaByCell = new Map<number, number>();
  for (const vent of p.vents) {
    if (!(vent.flow > 0) || !(vent.area > 0)) continue;
    const vi = clampIndex(Math.round(vent.x / g.dx), nx);
    const vj = clampIndex(Math.round(vent.y / g.dy), ny);
    const key = vj * nx + vi;
    const effectiveArea = Math.min(vent.area, g.dx * g.dy);
    betaByCell.set(key, (betaByCell.get(key) ?? 0) + vent.flow / (effectiveArea * p.roomHeight));
  }

  const D = p.diffusionCoeff;
  const rx = D * p.dt / (g.dx * g.dx);
  const ry = D * p.dt / (g.dy * g.dy);
  const frameEvery = Math.max(1, Math.ceil(nSteps / (MAX_FRAMES - 1)));
  const frames: SimFrame[] = [{ t: 0, field: new Float64Array(initial) }];
  const initialMass = sum(initial) * cellVolume;

  // 双缓冲：cur 为本场，next 为待写的新场，每步交换引用
  let cur = initial;
  let buf = new Float64Array(n);
  let stepIndex = 0;
  let removedByVents = 0;
  let maxConc = p.intensity;
  let earlyStopped = false;

  function doStep() {
    stepIndex++;
    const t = Math.min(stepIndex * p.dt, p.totalTime);
    buf.set(cur);

    // ---- 扩散（Neumann 边界：墙外虚格 = 墙内格，跨壁通量为 0）----
    if (D > 0) {
      for (let j = 0; j < ny; j++) {
        const row = j * nx;
        const jm = j > 0 ? -nx : 0;
        const jp = j < ny - 1 ? nx : 0;
        for (let i = 0; i < nx; i++) {
          const k = row + i;
          const im = i > 0 ? -1 : 0;
          const ip = i < nx - 1 ? 1 : 0;
          buf[k] +=
            rx * (cur[k + ip] + cur[k + im] - 2 * cur[k]) +
            ry * (cur[k + jp] + cur[k + jm] - 2 * cur[k]);
        }
      }
    }

    // ---- 通风口排风（有限体积汇，排出量入账）----
    if (betaByCell.size) {
      for (const [key, betaRaw] of betaByCell) {
        const decay = Math.min(betaRaw * p.dt, 1); // 显式 Euler 保正限幅
        const c = buf[key];
        if (c > 0) {
          removedByVents += decay * c * cellVolume;
          buf[key] = c * (1 - decay);
        }
      }
    }

    // 交换缓冲引用（旧 cur 成为下一步的 buf）
    const tmp = cur;
    cur = buf;
    buf = tmp;

    for (let k = 0; k < n; k++) {
      const c = cur[k];
      if (c > maxConc) maxConc = c;
      if (clearTime[k] === Infinity && c <= p.threshold) clearTime[k] = t;
    }

    if (stepIndex % frameEvery === 0 || stepIndex === nSteps) {
      frames.push({ t, field: new Float64Array(cur) });
    }

    // 全场已低于阈值的 1%，继续算没有意义
    let maxNow = 0;
    for (let k = 0; k < n; k++) if (cur[k] > maxNow) maxNow = cur[k];
    if (maxNow < p.threshold * 0.01) {
      earlyStopped = true;
      for (let k = 0; k < n; k++) if (clearTime[k] === Infinity) clearTime[k] = t;
    }
  }

  const engine: SimEngine = {
    params: p,
    grid: g,
    nSteps,
    get field() {
      return cur;
    },
    clearTime,
    frames,
    get stepIndex() {
      return stepIndex;
    },
    get removedByVents() {
      return removedByVents;
    },
    get maxConcentration() {
      return maxConc;
    },
    get earlyStopped() {
      return earlyStopped;
    },
    initialMass,
    step(budget: number) {
      let used = 0;
      while (used < budget && stepIndex < nSteps && !earlyStopped) {
        doStep();
        used++;
      }
      return earlyStopped || stepIndex >= nSteps;
    },
    finish() {
      const finalMass = sum(cur) * cellVolume;
      const balanceError = initialMass > EPS
        ? (finalMass + removedByVents - initialMass) / initialMass
        : 0;

      let lastPoint: SimResult['lastPoint'] = null;
      let roomClearTime: number | null = 0;
      let anyUnclear = false;
      for (let k = 0; k < n; k++) {
        const ct = clearTime[k];
        if (ct === Infinity) {
          anyUnclear = true;
          continue;
        }
        if (ct > (roomClearTime as number)) {
          roomClearTime = ct;
          const i = k % nx;
          const j = Math.floor(k / nx);
          lastPoint = { i, j, x: (i + 0.5) * g.dx, y: (j + 0.5) * g.dy, t: ct };
        }
      }
      if (anyUnclear) roomClearTime = null;

      return {
        params: p,
        grid: g,
        frames,
        clearTime,
        lastPoint,
        roomClearTime,
        earlyStopped,
        diagnostics: {
          initialMass,
          finalMass,
          removedByVents,
          balanceError,
          equilibrium: initialMass / (n * cellVolume),
          maxConcentration: maxConc,
        },
      };
    },
  };
  return engine;
}

export interface RunOptions {
  onProgress?: (fraction: number) => void;
  shouldCancel?: () => boolean;
  /** 每个分块的步数，0 表示同步一次跑完 */
  chunkSteps?: number;
}

/** 运行模拟（默认分块异步，避免阻塞 UI；onProgress 可更新进度，shouldCancel 可中途取消） */
export async function runSimulationAsync(
  p: SimParams,
  validation?: ValidationResult,
  opts: RunOptions = {},
): Promise<SimResult> {
  const engine = createEngine(p, validation);
  const chunk = opts.chunkSteps ?? 4000;
  opts.onProgress?.(0);
  // 小算量直接同步跑完，省一帧延迟
  if (chunk <= 0 || engine.nSteps * engine.grid.cells <= 500_000) {
    engine.step(Infinity);
    opts.onProgress?.(1);
    return engine.finish();
  }
  await Promise.resolve();
  while (true) {
    if (opts.shouldCancel?.()) {
      const result = engine.finish();
      return result;
    }
    const done = engine.step(chunk);
    opts.onProgress?.(Math.min(1, engine.stepIndex / engine.nSteps));
    if (done) return engine.finish();
    // 让出主线程
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** 同步运行（主要用于测试/对比页一次性算多套方案） */
export function runSimulation(p: SimParams, validation?: ValidationResult): SimResult {
  const engine = createEngine(p, validation);
  engine.step(Infinity);
  return engine.finish();
}

/** 双线性插值读取任意坐标处浓度，坐标越界返回 null */
export function sampleAt(result: SimResult, frame: SimFrame, x: number, y: number): number | null {
  const { nx, ny, dx, dy } = result.grid;
  if (x < 0 || x > nx * dx || y < 0 || y > ny * dy) return null;
  const fx = x / dx - 0.5;
  const fy = y / dy - 0.5;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;
  const at = (i: number, j: number) =>
    frame.field[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  const c00 = at(i0, j0);
  const c10 = at(i0 + 1, j0);
  const c01 = at(i0, j0 + 1);
  const c11 = at(i0 + 1, j0 + 1);
  return (c00 * (1 - tx) + c10 * tx) * (1 - ty) + (c01 * (1 - tx) + c11 * tx) * ty;
}

/** 房间当前总「质量」（Σ浓度·格体积），用于守恒展示 */
export function frameMass(result: SimResult, frame: SimFrame): number {
  return sum(frame.field) * result.grid.cellVolume;
}

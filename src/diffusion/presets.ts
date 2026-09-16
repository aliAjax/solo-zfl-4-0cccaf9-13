import type { SimParams, Vent, RoomSetup } from './types';
import type { SmellMemory } from '../utils/constants';
import { generateId } from '../utils/helpers';

export function makeVent(partial?: Partial<Vent>): Vent {
  return {
    id: generateId(),
    x: 5.5,
    y: 2,
    area: 0.09, // 0.3m × 0.3m
    flow: 0.05, // 50 L/s
    ...partial,
  };
}

/** 一组可直接通过校验的默认参数：6m×4m×2.7m 卧室，单个排风口 */
export function createDefaultParams(overrides: Partial<SimParams> = {}): SimParams {
  return {
    name: '未命名方案',
    roomLength: 6,
    roomWidth: 4,
    roomHeight: 2.7,
    intensity: 8,
    sourceX: 1.5,
    sourceY: 2,
    sourceRadius: 0.3,
    vents: [makeVent()],
    diffusionCoeff: 0.02,
    dx: 0.2,
    dy: 0.2,
    totalTime: 3600,
    dt: 0.25,
    threshold: 0.05,
    ...overrides,
  };
}

/** 默认房间登记（不含 name/intensity） */
export function defaultRoomSetup(): RoomSetup {
  const p = createDefaultParams();
  return {
    roomLength: p.roomLength,
    roomWidth: p.roomWidth,
    roomHeight: p.roomHeight,
    sourceX: p.sourceX,
    sourceY: p.sourceY,
    sourceRadius: p.sourceRadius,
    vents: p.vents.map((v) => ({ ...v })),
    diffusionCoeff: p.diffusionCoeff,
    dx: p.dx,
    dy: p.dy,
    totalTime: p.totalTime,
    dt: p.dt,
    threshold: p.threshold,
  };
}

/**
 * 合并一份可能残缺的房间登记与默认值（旧记忆缺字段时逐字段补齐，
 * 不改动记忆的其它内容，也不持久化默认值）。
 */
export function normalizeRoomSetup(raw: Partial<RoomSetup> | undefined | null): RoomSetup {
  const d = defaultRoomSetup();
  if (!raw || typeof raw !== 'object') return structuredCloneSafe(d);
  const vents = Array.isArray(raw.vents)
    ? raw.vents
        .filter((v) => v && typeof v === 'object')
        .map((v) => ({
          id: typeof v.id === 'string' && v.id ? v.id : generateId(),
          x: numOr(v.x, d.vents[0]?.x ?? 5.5),
          y: numOr(v.y, d.vents[0]?.y ?? 2),
          // 面积必须为正（负值视为脏数据回退默认）；风量允许 0（风口关闭）
          area: posOr(v.area, 0.09),
          flow: nonNegOr(v.flow, 0),
        }))
    : structuredCloneSafe(d.vents);
  return {
    roomLength: posOr(raw.roomLength, d.roomLength),
    roomWidth: posOr(raw.roomWidth, d.roomWidth),
    roomHeight: posOr(raw.roomHeight, d.roomHeight),
    sourceX: numOr(raw.sourceX, d.sourceX),
    sourceY: numOr(raw.sourceY, d.sourceY),
    sourceRadius: nonNegOr(raw.sourceRadius, d.sourceRadius),
    vents,
    diffusionCoeff: nonNegOr(raw.diffusionCoeff, d.diffusionCoeff),
    dx: posOr(raw.dx, d.dx),
    dy: posOr(raw.dy, d.dy),
    totalTime: posOr(raw.totalTime, d.totalTime),
    dt: posOr(raw.dt, d.dt),
    threshold: posOr(raw.threshold, d.threshold),
  };
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
/** 必须为正；非法（含负数、0、NaN）回退默认 */
function posOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}
/** 必须非负；负数/NaN 回退默认，0 保留 */
function nonNegOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 从记忆带出模拟参数：有房间登记用登记（逐字段补默认），没有则用默认房间；强度取记忆 */
export function paramsFromMemory(memory: Pick<SmellMemory, 'location' | 'intensity' | 'room'>): SimParams {
  const setup = normalizeRoomSetup(memory.room);
  return {
    name: `${memory.location}·散去推演`,
    intensity: memory.intensity,
    ...setup,
  };
}

/** 把当前参数中的房间登记部分提取出来（用于保存回记忆，不含 name/intensity） */
export function roomSetupFromParams(p: SimParams): RoomSetup {
  return {
    roomLength: p.roomLength,
    roomWidth: p.roomWidth,
    roomHeight: p.roomHeight,
    sourceX: p.sourceX,
    sourceY: p.sourceY,
    sourceRadius: p.sourceRadius,
    vents: p.vents.map((v) => ({ ...v })),
    diffusionCoeff: p.diffusionCoeff,
    dx: p.dx,
    dy: p.dy,
    totalTime: p.totalTime,
    dt: p.dt,
    threshold: p.threshold,
  };
}

export interface ScenarioSeed {
  memoryId?: string | null;
  params: SimParams;
}

/** 首次进入实验室时的示例方案：封闭 vs 弱风 vs 强风，可并排比较散去时间 */
export function seedScenarios(): ScenarioSeed[] {
  return [
    {
      params: createDefaultParams({
        name: '封闭书房（仅扩散）',
        vents: [],
      }),
    },
    {
      params: createDefaultParams({
        name: '弱通风卧室（对角 30L/s）',
        vents: [makeVent({ x: 5.5, y: 3.4, flow: 0.03 })],
      }),
    },
    {
      params: createDefaultParams({
        name: '强通风卧室（对角 120L/s）',
        vents: [makeVent({ x: 5.5, y: 3.4, flow: 0.12 })],
      }),
    },
  ];
}

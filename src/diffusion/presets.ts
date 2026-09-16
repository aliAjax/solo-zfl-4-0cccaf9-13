import type { SimParams, Vent } from './types';
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

/** 从某段气味记忆带出默认参数（强度取记忆的 1~10 分） */
export function paramsFromMemory(memory: {
  location: string;
  intensity: number;
}): SimParams {
  return createDefaultParams({
    name: `${memory.location}·散去推演`,
    intensity: memory.intensity,
  });
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

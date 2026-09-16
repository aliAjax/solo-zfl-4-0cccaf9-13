import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SimParams } from '../diffusion/types';
import { createDefaultParams, seedScenarios } from '../diffusion/presets';
import { generateId } from '../utils/helpers';

export interface Scenario {
  id: string;
  memoryId?: string | null;
  params: SimParams;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioInput {
  name: string;
  params: SimParams;
  memoryId?: string | null;
}

interface ScenarioStore {
  scenarios: Scenario[];
  /** 对比页勾选的方案 id（并排比较散去时间） */
  compareIds: string[];
  seeded: boolean;
  addScenario: (input: ScenarioInput) => string;
  updateScenario: (id: string, params: SimParams) => void;
  deleteScenario: (id: string) => void;
  duplicateScenario: (id: string) => string | null;
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
  seedIfEmpty: () => void;
}

export const useScenarioStore = create<ScenarioStore>()(
  persist(
    (set, get) => ({
      scenarios: [],
      compareIds: [],
      seeded: false,

      addScenario: ({ name, params, memoryId }) => {
        const id = generateId();
        const now = new Date().toISOString();
        const scenario: Scenario = {
          id,
          memoryId,
          params: { ...params, vents: params.vents.map((v) => ({ ...v })), name },
          createdAt: now,
          updatedAt: now,
        };
        set({ scenarios: [scenario, ...get().scenarios] });
        return id;
      },

      updateScenario: (id, params) => {
        set({
          scenarios: get().scenarios.map((s) =>
            s.id === id
              ? { ...s, params: { ...params, vents: params.vents.map((v) => ({ ...v })) }, updatedAt: new Date().toISOString() }
              : s,
          ),
        });
      },

      deleteScenario: (id) => {
        set({
          scenarios: get().scenarios.filter((s) => s.id !== id),
          compareIds: get().compareIds.filter((c) => c !== id),
        });
      },

      duplicateScenario: (id) => {
        const src = get().scenarios.find((s) => s.id === id);
        if (!src) return null;
        const newId = generateId();
        const now = new Date().toISOString();
        const copy: Scenario = {
          id: newId,
          memoryId: src.memoryId,
          params: {
            ...src.params,
            vents: src.params.vents.map((v) => ({ ...v, id: generateId() })),
            name: `${src.params.name} 副本`,
          },
          createdAt: now,
          updatedAt: now,
        };
        set({ scenarios: [copy, ...get().scenarios] });
        return newId;
      },

      toggleCompare: (id) => {
        const ids = get().compareIds;
        if (ids.includes(id)) {
          set({ compareIds: ids.filter((x) => x !== id) });
        } else {
          // 最多并排 4 套
          set({ compareIds: [...ids, id].slice(-4) });
        }
      },

      clearCompare: () => set({ compareIds: [] }),

      seedIfEmpty: () => {
        if (get().scenarios.length === 0) {
          const now = new Date().toISOString();
          const seeds: Scenario[] = seedScenarios().map((s) => ({
            id: generateId(),
            memoryId: s.memoryId ?? null,
            params: s.params,
            createdAt: now,
            updatedAt: now,
          }));
          set({ scenarios: seeds, seeded: true });
        }
      },
    }),
    {
      name: 'scent-diffusion-scenarios',
      storage: createJSONStorage(() => localStorage),
      version: 2,
      // 旧版本数据补齐新字段，保证刷新后历史方案仍可打开
      migrate: (persisted: unknown) => {
        const state = persisted as Partial<ScenarioStore> | undefined;
        if (!state || !Array.isArray(state.scenarios)) return state as ScenarioStore;
        state.scenarios = state.scenarios.map((s) => {
          const p = s.params ?? createDefaultParams();
          return {
            ...s,
            params: {
              ...createDefaultParams(),
              ...p,
              sourceRadius: typeof p.sourceRadius === 'number' ? p.sourceRadius : 0.3,
              vents: Array.isArray(p.vents) ? p.vents : [],
            },
          };
        });
        return state as ScenarioStore;
      },
    },
  ),
);

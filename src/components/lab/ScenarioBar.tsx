import { Link } from 'react-router-dom';
import { Check, Copy, Pencil, Trash2, GitCompareArrows, Link2 } from 'lucide-react';
import { useScenarioStore } from '../../store/scenarioStore';
import { useMemoryStore } from '../../store/memoryStore';
import { formatDate } from '../../utils/helpers';
import { validateParams } from '../../diffusion/simulator';

interface Props {
  activeId?: string | null;
  onLoad?: (id: string) => void;
  compact?: boolean;
}

export default function ScenarioBar({ activeId, onLoad, compact }: Props) {
  const { scenarios, compareIds, toggleCompare, deleteScenario, duplicateScenario } = useScenarioStore();
  const memories = useMemoryStore((s) => s.memories);

  if (scenarios.length === 0) {
    return (
      <div className="text-xs text-ink-700/55 bg-paper-100 border border-dashed border-paper-400 rounded-xl px-3 py-2.5">
        还没有保存方案——调好参数后点「另存为新方案」，刷新页面也不会丢。
      </div>
    );
  }

  void compact;
  return (
    <div className={`space-y-2 ${compact ? '' : ''}`}>
      {scenarios.map((s) => {
        const active = s.id === activeId;
        const checked = compareIds.includes(s.id);
        const v = validateParams(s.params);
        return (
          <div
            key={s.id}
            className={`group rounded-xl border px-3 py-2 transition-all duration-200 ${
              active
                ? 'border-ochre-500 bg-ochre-50/80 shadow-paper'
                : 'border-paper-300 bg-paper-50 hover:border-ochre-300'
            }`}
          >
            <div
              role={onLoad ? 'button' : undefined}
              tabIndex={onLoad ? 0 : undefined}
              onClick={() => onLoad?.(s.id)}
              onKeyDown={(e) => {
                if (onLoad && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onLoad(s.id);
                }
              }}
              className={`block w-full text-left ${onLoad ? 'cursor-pointer' : ''}`}
              title={onLoad ? '载入到参数表单' : undefined}
            >
              <div className="flex items-center gap-2">
                <span className="font-serif text-sm font-semibold text-ink-800 truncate flex-1">
                  {s.params.name || '未命名方案'}
                </span>
                {s.memoryId && (() => {
                  const mem = memories.find((m) => m.id === s.memoryId);
                  return mem ? (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-moss-100 text-moss-600 shrink-0"
                      title={`关联记忆：${mem.location}（方案是独立快照，不会改动记忆）`}
                    >
                      <Link2 className="w-2.5 h-2.5" />
                      {mem.location}
                    </span>
                  ) : null;
                })()}
                {!v.ok && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brick-400/15 text-brick-600 shrink-0">
                    待修正
                  </span>
                )}
              </div>
              <div className="text-[11px] text-ink-700/55 mt-0.5 flex flex-wrap gap-x-2">
                <span>{s.params.roomLength}×{s.params.roomWidth}×{s.params.roomHeight}m</span>
                <span>D={s.params.diffusionCoeff}</span>
                <span>{s.params.vents.filter((x) => x.flow > 0).length} 个风口</span>
              </div>
              <div className="text-[10px] text-ink-700/40 mt-0.5">更新于 {formatDate(s.updatedAt)}</div>
            </div>
            <div
              className="mt-1.5 flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => toggleCompare(s.id)}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                  checked
                    ? 'bg-moss-100 border-moss-200 text-moss-600'
                    : 'border-paper-300 text-ink-700/70 hover:bg-paper-200'
                }`}
                title="加入并排比较"
              >
                {checked ? <Check className="w-3 h-3" /> : <GitCompareArrows className="w-3 h-3" />}
                对比
              </button>
              <Link
                to={`/lab?scenario=${s.id}`}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg text-ochre-600 hover:bg-ochre-100 transition-colors"
                title="在实验室中打开"
              >
                <Pencil className="w-3 h-3" /> 编辑
              </Link>
              <button
                type="button"
                onClick={() => duplicateScenario(s.id)}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg text-ink-700/70 hover:bg-paper-200 transition-colors"
                title="复制方案"
              >
                <Copy className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`确认删除方案「${s.params.name}」吗？`)) deleteScenario(s.id);
                }}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg text-brick-500 hover:bg-brick-500/10 transition-colors ml-auto"
                title="删除方案"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

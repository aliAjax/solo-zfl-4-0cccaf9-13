import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Play, Pause, RotateCcw, Save, Plus, Loader2, XCircle, GitCompareArrows, Wind, House } from 'lucide-react';
import SiteNav from '../components/lab/SiteNav';
import ParamForm from '../components/lab/ParamForm';
import FieldCanvas, { type ProbePoint } from '../components/lab/FieldCanvas';
import ResultPanel from '../components/lab/ResultPanel';
import ScenarioBar from '../components/lab/ScenarioBar';
import { validateParams, runSimulationAsync } from '../diffusion/simulator';
import type { SimParams, SimResult } from '../diffusion/types';
import { createDefaultParams, paramsFromMemory, roomSetupFromParams } from '../diffusion/presets';
import { useScenarioStore } from '../store/scenarioStore';
import { useMemoryStore } from '../store/memoryStore';
import { formatDuration, formatDurationShort, fmtNum } from '../diffusion/format';

export default function LabPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { scenarios, addScenario, updateScenario, compareIds, seedIfEmpty } = useScenarioStore();
  const memories = useMemoryStore((s) => s.memories);
  const initIfEmpty = useMemoryStore((s) => s.initIfEmpty);
  const updateMemoryRoom = useMemoryStore((s) => s.updateMemoryRoom);

  const [params, setParams] = useState<SimParams>(() => createDefaultParams());
  const [loadedId, setLoadedId] = useState<string | null>(null);
  /** 当前会话关联的记忆（?memory= 或方案自带的 memoryId）；只有显式保存才写回该记忆 */
  const [linkedMemoryId, setLinkedMemoryId] = useState<string | null>(null);
  /** 房间登记相对关联记忆是否有未保存修改 */
  const [roomDirty, setRoomDirty] = useState(false);
  const [paramsVersion, setParamsVersion] = useState(0);
  const [result, setResult] = useState<SimResult | null>(null);
  const [runVersion, setRunVersion] = useState(0);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<'concentration' | 'clearTime'>('concentration');
  const [pinned, setPinned] = useState<ProbePoint | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const playTimer = useRef<number | null>(null);

  useEffect(() => {
    seedIfEmpty();
    initIfEmpty();
  }, [seedIfEmpty, initIfEmpty]);

  // 把一组参数载入到表单（方案或记忆）；程序载入不算"未保存修改"
  const applyParams = useCallback(
    (next: SimParams, opts: { scenarioId?: string | null; memoryId?: string | null } = {}) => {
      setParams({ ...next, vents: next.vents.map((v) => ({ ...v })) });
      setLoadedId(opts.scenarioId ?? null);
      setLinkedMemoryId(opts.memoryId ?? null);
      setParamsVersion((v) => v + 1);
      setRoomDirty(false);
      setResult(null);
      setPinned(null);
    },
    [],
  );

  // URL 预填：?scenario= 载入已存方案，?memory= 从气味记忆带出房间登记。
  // 用 ref 保证同一个 URL 只应用一次——否则新增方案导致 scenarios.length
  // 变化时会重新覆盖表单（如把刚另存方案的 loadedId 冲掉）。
  const appliedUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const urlKey = searchParams.toString();
    if (appliedUrlRef.current === urlKey) return;
    const sid = searchParams.get('scenario');
    const mid = searchParams.get('memory');
    if (sid) {
      const s = scenarios.find((x) => x.id === sid);
      if (!s) return; // 数据尚未就绪，等下一次（seeding 后）再试
      appliedUrlRef.current = urlKey;
      applyParams(s.params, { scenarioId: s.id, memoryId: s.memoryId ?? null });
      return;
    }
    if (mid) {
      const m = memories.find((x) => x.id === mid);
      if (!m) return;
      appliedUrlRef.current = urlKey;
      applyParams(paramsFromMemory(m), { memoryId: m.id });
      return;
    }
    appliedUrlRef.current = urlKey; // /lab 无参数：保留默认草稿
  }, [searchParams, scenarios, memories, applyParams]);

  const validation = useMemo(() => validateParams(params), [params]);

  const linkedMemory = linkedMemoryId ? memories.find((m) => m.id === linkedMemoryId) ?? null : null;

  const handleChange = (next: SimParams) => {
    setParams(next);
    setParamsVersion((v) => v + 1);
    setRoomDirty(true);
    setSaveMsg(null);
  };

  const run = useCallback(async () => {
    const v = validateParams(params);
    if (!v.ok) return;
    setRunning(true);
    setProgress(0);
    setPlaying(false);
    cancelRef.current = false;
    // 让进度条先渲染
    await new Promise((r) => setTimeout(r, 30));
    const res = await runSimulationAsync(params, v, {
      onProgress: setProgress,
      shouldCancel: () => cancelRef.current,
    });
    setResult(res);
    // 结果对应「此刻的参数版本」：之后再改参数 paramsVersion 自增，即显示过期角标
    setRunVersion(paramsVersion);
    setFrameIdx(0);
    setMode('concentration');
    setRunning(false);
  }, [params, paramsVersion]);

  // 回放
  useEffect(() => {
    if (!playing || !result) return;
    playTimer.current = window.setInterval(() => {
      setFrameIdx((i) => {
        if (i >= result.frames.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 120);
    return () => {
      if (playTimer.current) window.clearInterval(playTimer.current);
    };
  }, [playing, result]);

  const frame = result?.frames[Math.min(frameIdx, result.frames.length - 1)];
  const dirty = result !== null && paramsVersion !== runVersion;

  const saveAsNew = () => {
    // 方案保留对记忆的关联，但只是一份快照，绝不回写记忆
    const id = addScenario({
      name: params.name || '未命名方案',
      params,
      memoryId: linkedMemoryId,
    });
    setLoadedId(id);
    setSaveMsg('已另存为新方案（与当前记忆保持关联）');
    setTimeout(() => setSaveMsg(null), 2500);
  };
  const saveExisting = () => {
    if (!loadedId) return;
    updateScenario(loadedId, params);
    setSaveMsg('方案已更新');
    setTimeout(() => setSaveMsg(null), 2500);
  };
  /** 把房间尺寸/源点/风口/扩散参数写回关联记忆（只动 room 字段，强度等其它内容不变） */
  const saveRoomToMemory = () => {
    if (!linkedMemoryId) return;
    updateMemoryRoom(linkedMemoryId, roomSetupFromParams(params));
    setRoomDirty(false);
    const label = linkedMemory ? `记忆「${linkedMemory.location}」` : '该记忆';
    setSaveMsg(`房间登记已保存到${label}，下次打开自动带出`);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const loadScenario = (id: string) => {
    const s = scenarios.find((x) => x.id === id);
    if (!s) return;
    applyParams(s.params, { scenarioId: id, memoryId: s.memoryId ?? null });
    setSearchParams({ scenario: id }, { replace: true });
  };

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="container max-w-7xl py-6 pb-20">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h1 className="font-serif text-3xl font-bold text-ink-800 flex items-center gap-2">
              <Wind className="w-7 h-7 text-ochre-500" />
              房间扩散与通风实验室
            </h1>
            <p className="text-sm text-ink-700/65 mt-1 font-hand text-lg">
              二维浓度场按时间步推进 · 封闭房间总量严格守恒 · 通风排出逐步入账
            </p>
          </div>
          <Link
            to="/lab/compare"
            className="btn-secondary text-sm inline-flex items-center gap-1.5"
          >
            <GitCompareArrows className="w-4 h-4" />
            并排比较方案{compareIds.length > 0 && `（${compareIds.length}）`}
          </Link>
        </div>

        <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] gap-5">
          {/* 左：参数 + 方案库 */}
          <div className="space-y-4">
            <section className="bg-paper-50/90 backdrop-blur rounded-2xl border border-paper-300 shadow-paper p-4">
              <ParamForm params={params} onChange={handleChange} validation={validation} />
              <div className="mt-5 pt-4 border-t border-paper-200 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={run}
                    disabled={!validation.ok || running}
                    className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    {running ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        推进中 {Math.round(progress * 100)}%
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        运行模拟
                      </>
                    )}
                  </button>
                  {running && (
                    <button
                      type="button"
                      onClick={() => {
                        cancelRef.current = true;
                      }}
                      className="btn-secondary !px-3"
                      title="取消"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {running && (
                  <div className="h-2 rounded-full bg-paper-200 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-ochre-300 to-ochre-600 transition-all duration-150"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveExisting}
                    disabled={!loadedId}
                    className="btn-secondary flex-1 text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={loadedId ? '更新当前方案' : '当前是未保存的草稿'}
                  >
                    <Save className="w-3.5 h-3.5" /> 保存到方案
                  </button>
                  <button
                    type="button"
                    onClick={saveAsNew}
                    className="btn-secondary flex-1 text-xs inline-flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> 另存为新方案
                  </button>
                </div>
                {linkedMemory && (
                  <button
                    type="button"
                    onClick={saveRoomToMemory}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium rounded-xl px-4 py-2.5 transition-all duration-200 bg-moss-500 hover:bg-moss-600 text-paper-50 shadow-paper hover:-translate-y-0.5 active:translate-y-0"
                    title="把房间尺寸、源点、风口风量与扩散参数保存到这一段记忆，下次从卡片进入自动带出"
                  >
                    <House className="w-3.5 h-3.5" />
                    保存房间登记到记忆「{linkedMemory.location}」
                    {roomDirty && <span className="ml-1 w-2 h-2 rounded-full bg-paper-50 animate-pulse" />}
                  </button>
                )}
                <div className="flex items-start justify-between gap-2 text-[11px] leading-relaxed">
                  <span className={saveMsg ? 'text-moss-600' : 'text-ink-700/45'}>
                    {saveMsg ??
                      (linkedMemory
                        ? roomDirty
                          ? `房间登记尚未保存到记忆「${linkedMemory.location}」（改参数不影响记忆，点上方按钮才写入）`
                          : `正在用记忆「${linkedMemory.location}」的房间登记，已保存`
                        : loadedId
                          ? `正在编辑方案：${params.name || '未命名方案'}`
                          : '当前为未保存草稿，刷新会丢失（已存方案与记忆不受影响）')}
                  </span>
                </div>
              </div>
            </section>

            <section className="bg-paper-50/90 backdrop-blur rounded-2xl border border-paper-300 shadow-paper p-4">
              <h3 className="font-hand text-lg text-ochre-600 mb-3">方案库（{scenarios.length}）</h3>
              <ScenarioBar activeId={loadedId} onLoad={loadScenario} />
            </section>
          </div>

          {/* 右：可视化 + 结果 */}
          <div className="space-y-4 min-w-0">
            <section className="bg-paper-50/90 backdrop-blur rounded-2xl border border-paper-300 shadow-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="inline-flex rounded-xl border border-paper-300 overflow-hidden text-sm">
                  {(['concentration', 'clearTime'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`px-3 py-1.5 transition-colors ${
                        mode === m ? 'bg-ochre-500 text-paper-50' : 'bg-paper-50 text-ink-700 hover:bg-paper-200'
                      }`}
                    >
                      {m === 'concentration' ? '浓度场' : '首达阈值时间'}
                    </button>
                  ))}
                </div>
                {dirty && (
                  <span className="text-[11px] px-2 py-1 rounded-full bg-brick-400/10 text-brick-600 border border-brick-400/30">
                    参数已修改，下图为上次运行结果
                  </span>
                )}
              </div>

              {!result || !frame ? (
                <div className="rounded-xl border-2 border-dashed border-paper-400 bg-paper-100/60 py-20 text-center">
                  <div className="text-5xl mb-3 select-none">💨</div>
                  <h3 className="font-serif text-xl text-ink-800 mb-1">
                    {validation.ok ? '参数就绪，运行模拟吧' : '请先修正左侧参数'}
                  </h3>
                  <p className="text-sm text-ink-700/55 max-w-md mx-auto">
                    {validation.ok
                      ? '将按时间步推进二维浓度场，给出每点浓度、首次降到安全阈值的时间，以及最晚散去的位置。'
                      : '左侧标红处给出了具体原因（如尺寸为负、源点墙外、网格过密或步长越过稳定条件），修正后即可运行。'}
                  </p>
                </div>
              ) : (
                <>
                  <FieldCanvas
                    result={result}
                    mode={mode}
                    frame={frame}
                    pinned={pinned}
                    onPin={setPinned}
                  />
                  {mode === 'concentration' && (
                    <LegendBar
                      stops={[0, 0.6, 1].map((t) => {
                        const c = t < 0.6
                          ? [237 + (160 - 237) * (t / 0.6), 227 + (105 - 227) * (t / 0.6), 204 + (50 - 204) * (t / 0.6)]
                          : [160 + (92 - 160) * ((t - 0.6) / 0.4), 105 + (58 - 105) * ((t - 0.6) / 0.4), 50 + (29 - 50) * ((t - 0.6) / 0.4)];
                        return `rgb(${c.map((x) => Math.round(x)).join(',')}) ${t * 100}%`;
                      })}
                      labelMin="0"
                      labelMax={`浓度 ${fmtNum(result.params.intensity, 1)}`}
                      caption={`虚线 = 安全阈值等值线（${result.params.threshold}）`}
                    />
                  )}
                  {mode === 'clearTime' && (
                    <LegendBar
                      stops={['rgb(237,227,204) 0%', 'rgb(125,160,140) 18%', 'rgb(184,137,79) 62%', 'rgb(184,98,58) 100%']}
                      labelMin="早散去"
                      labelMax="晚散去"
                      caption="纸色格=气味从未到达（t=0 即达标）；紫灰格=总时长内仍未降到阈值"
                    />
                  )}

                  {/* 回放控制 */}
                  <div className="mt-4 rounded-xl bg-paper-100/80 border border-paper-200 p-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setFrameIdx(0);
                          setPlaying(false);
                        }}
                        className="btn-ghost !p-2"
                        title="回到开始"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (frameIdx >= result.frames.length - 1) setFrameIdx(0);
                          setPlaying((p) => !p);
                        }}
                        className="btn-primary !p-2.5"
                      >
                        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={result.frames.length - 1}
                        step={1}
                        value={frameIdx}
                        onChange={(e) => {
                          setPlaying(false);
                          setFrameIdx(Number(e.target.value));
                        }}
                        className="flex-1"
                      />
                      <div className="text-right shrink-0">
                        <div className="font-mono text-sm text-ink-800">{formatDurationShort(frame.t)}</div>
                        <div className="text-[10px] text-ink-700/50">/ {formatDuration(result.params.totalTime)}</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </section>

            {result && frame && (
              <section className="bg-paper-50/90 backdrop-blur rounded-2xl border border-paper-300 shadow-paper p-4">
                <h3 className="font-hand text-lg text-ochre-600 mb-3">模拟结果与总量账单</h3>
                <ResultPanel result={result} frame={frame} pinned={pinned} />
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function LegendBar({
  stops,
  labelMin,
  labelMax,
  caption,
}: {
  stops: string[];
  labelMin: string;
  labelMax: string;
  caption?: string;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-ink-700/60 w-16 text-right">{labelMin}</span>
        <div
          className="flex-1 h-3 rounded-full border border-paper-300"
          style={{ background: `linear-gradient(90deg, ${stops.join(', ')})` }}
        />
        <span className="text-[11px] text-ink-700/60 w-16">{labelMax}</span>
      </div>
      {caption && <div className="text-center text-[11px] text-ink-700/50 mt-1">{caption}</div>}
    </div>
  );
}

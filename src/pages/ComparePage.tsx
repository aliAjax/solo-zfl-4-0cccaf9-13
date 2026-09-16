import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GitCompareArrows, Loader2, Play, Check, Wind } from 'lucide-react';
import SiteNav from '../components/lab/SiteNav';
import FieldCanvas from '../components/lab/FieldCanvas';
import { useScenarioStore } from '../store/scenarioStore';
import { runSimulationAsync, validateParams } from '../diffusion/simulator';
import type { SimResult } from '../diffusion/types';
import { formatDuration, formatDurationShort, fmtNum, toLs } from '../diffusion/format';

interface CompareEntry {
  id: string;
  name: string;
  result: SimResult | null;
  error?: string;
}

export default function ComparePage() {
  const { scenarios, compareIds, toggleCompare, clearCompare, seedIfEmpty } = useScenarioStore();
  const [entries, setEntries] = useState<CompareEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ran, setRan] = useState(false);

  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);

  const selected = useMemo(
    () => compareIds.map((id) => scenarios.find((s) => s.id === id)).filter(Boolean) as typeof scenarios,
    [compareIds, scenarios],
  );

  const runAll = async () => {
    setRunning(true);
    setProgress(0);
    setRan(false);
    const out: CompareEntry[] = [];
    for (let i = 0; i < selected.length; i++) {
      const s = selected[i];
      const v = validateParams(s.params);
      if (!v.ok) {
        out.push({ id: s.id, name: s.params.name, result: null, error: v.issues.find((x) => x.level === 'error')?.message });
      } else {
        try {
          const result = await runSimulationAsync(s.params, v, {
            onProgress: (f) => setProgress((i + f) / selected.length),
          });
          out.push({ id: s.id, name: s.params.name, result });
        } catch (e) {
          out.push({ id: s.id, name: s.params.name, result: null, error: String(e) });
        }
      }
    }
    setEntries(out);
    setRunning(false);
    setRan(true);
  };

  // 条形图归一化（未散去按满格）
  const validTimes = entries.map((e) => e.result?.roomClearTime ?? null);
  const maxTime = Math.max(1, ...validTimes.map((t) => (t === null ? 0 : t)));

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main className="container max-w-7xl py-6 pb-20">
        <div className="mb-5">
          <h1 className="font-serif text-3xl font-bold text-ink-800 flex items-center gap-2">
            <GitCompareArrows className="w-7 h-7 text-ochre-500" />
            方案并排比较
          </h1>
          <p className="text-sm text-ink-700/65 mt-1 font-hand text-lg">
            勾选 2~4 套方案，比较各房间的散去时间与最晚散去位置
          </p>
        </div>

        <section className="bg-paper-50/90 rounded-2xl border border-paper-300 shadow-paper p-4 mb-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-hand text-lg text-ochre-600">
              选择方案（已选 {selected.length}/4）
            </h3>
            <div className="flex items-center gap-2">
              {compareIds.length > 0 && (
                <button type="button" onClick={clearCompare} className="btn-ghost text-xs">
                  清空选择
                </button>
              )}
              <button
                type="button"
                onClick={runAll}
                disabled={selected.length === 0 || running}
                className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {running ? `计算中 ${Math.round(progress * 100)}%` : '运行对比'}
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {scenarios.map((s) => {
              const checked = compareIds.includes(s.id);
              const v = validateParams(s.params);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleCompare(s.id)}
                  className={`text-left rounded-xl border p-3 transition-all duration-200 ${
                    checked
                      ? 'border-ochre-500 bg-ochre-50/80 shadow-paper'
                      : 'border-paper-300 bg-paper-50 hover:border-ochre-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                        checked ? 'bg-ochre-500 border-ochre-500 text-paper-50' : 'border-paper-400'
                      }`}
                    >
                      {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-serif text-sm font-semibold text-ink-800 truncate">
                        {s.params.name || '未命名方案'}
                      </div>
                      <div className="text-[11px] text-ink-700/55 mt-0.5">
                        {s.params.roomLength}×{s.params.roomWidth}×{s.params.roomHeight}m ·{' '}
                        {s.params.vents.filter((x) => x.flow > 0).length} 风口
                      </div>
                      {!v.ok && (
                        <div className="text-[10px] text-brick-600 mt-1">参数待修正，无法运行</div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {ran && entries.length > 0 && (
          <>
            {/* 散去时间条形对比 */}
            <section className="bg-paper-50/90 rounded-2xl border border-paper-300 shadow-paper p-4 mb-5">
              <h3 className="font-hand text-lg text-ochre-600 mb-4">全室散去时间对比</h3>
              <div className="space-y-3">
                {entries.map((e) => {
                  const t = e.result?.roomClearTime ?? null;
                  const pct = t === null ? 100 : Math.max(2, (t / maxTime) * 100);
                  return (
                    <div key={e.id} className="flex items-center gap-3">
                      <div className="w-40 shrink-0 truncate text-sm text-ink-800 font-medium" title={e.name}>
                        {e.name}
                      </div>
                      <div className="flex-1 h-7 bg-paper-200 rounded-lg overflow-hidden relative">
                        <div
                          className={`h-full rounded-lg flex items-center px-2 transition-all duration-500 ${
                            e.error
                              ? 'bg-brick-400/40'
                              : t === null
                                ? 'bg-gradient-to-r from-lavender-400 to-lavender-600'
                                : 'bg-gradient-to-r from-moss-300 via-ochre-300 to-brick-400'
                          }`}
                          style={{ width: `${e.error ? 100 : pct}%` }}
                        >
                          <span className="text-[11px] text-paper-50 font-semibold whitespace-nowrap drop-shadow">
                            {e.error ? '无法运行' : t === null ? '总时长内未散去' : formatDuration(t)}
                          </span>
                        </div>
                      </div>
                      <div className="w-20 shrink-0 text-right text-xs font-mono text-ink-700">
                        {e.error ? '—' : t === null ? '∞' : formatDurationShort(t)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-ink-700/50 mt-3">
                颜色仅作相对比较：绿→赭→砖红表示散去由快到慢；紫色条表示在设定总时长结束时仍有位置高于安全阈值。
              </p>
            </section>

            {/* 首达时间热图并排 */}
            <section className="grid md:grid-cols-2 gap-4 mb-5">
              {entries.map((e) => (
                <div key={e.id} className="bg-paper-50/90 rounded-2xl border border-paper-300 shadow-paper p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="font-serif text-base font-semibold text-ink-800 truncate">{e.name}</h4>
                    <Link
                      to={`/lab?scenario=${e.id}`}
                      className="text-xs text-ochre-600 hover:underline shrink-0 inline-flex items-center gap-1"
                    >
                      <Wind className="w-3.5 h-3.5" /> 打开
                    </Link>
                  </div>
                  {e.result ? (
                    <>
                      <FieldCanvas result={e.result} mode="clearTime" />
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                        <MiniStat k="全室散去" v={e.result.roomClearTime === null ? '未散去' : formatDuration(e.result.roomClearTime)} bad={e.result.roomClearTime === null} />
                        <MiniStat
                          k="最晚点"
                          v={e.result.lastPoint ? `(${fmtNum(e.result.lastPoint.x, 1)}, ${fmtNum(e.result.lastPoint.y, 1)}) m` : '—'}
                        />
                        <MiniStat
                          k="总排风量"
                          v={`${fmtNum(toLs(e.result.params.vents.reduce((s, x) => s + (x.flow > 0 ? x.flow : 0), 0)), 1)} L/s`}
                        />
                        <MiniStat
                          k="守恒残差"
                          v={`${(e.result.diagnostics.balanceError * 100).toExponential(1)}%`}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-brick-400/40 bg-brick-400/10 text-brick-600 text-xs p-3">
                      {e.error ?? '运行失败'}
                    </div>
                  )}
                </div>
              ))}
            </section>

            {/* 参数对照表 */}
            <section className="bg-paper-50/90 rounded-2xl border border-paper-300 shadow-paper p-4 overflow-x-auto">
              <h3 className="font-hand text-lg text-ochre-600 mb-3">参数与结果对照</h3>
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="text-left text-ink-700/60 border-b border-paper-300">
                    <th className="py-2 pr-3 font-medium">方案</th>
                    <th className="py-2 pr-3 font-medium">房间 (m)</th>
                    <th className="py-2 pr-3 font-medium">网格</th>
                    <th className="py-2 pr-3 font-medium">D (m²/s)</th>
                    <th className="py-2 pr-3 font-medium">dt (s)</th>
                    <th className="py-2 pr-3 font-medium">总时长</th>
                    <th className="py-2 pr-3 font-medium">阈值</th>
                    <th className="py-2 pr-3 font-medium">风口排风</th>
                    <th className="py-2 pr-3 font-medium">散去时间</th>
                    <th className="py-2 pr-3 font-medium">最晚点</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const r = e.result;
                    const p = r?.params;
                    return (
                      <tr key={e.id} className="border-b border-paper-200/70 text-ink-800">
                        <td className="py-2 pr-3 font-medium max-w-[140px] truncate">{e.name}</td>
                        <td className="py-2 pr-3">{p ? `${p.roomLength}×${p.roomWidth}×${p.roomHeight}` : '—'}</td>
                        <td className="py-2 pr-3">{r ? `${r.grid.nx}×${r.grid.ny}` : '—'}</td>
                        <td className="py-2 pr-3">{p ? fmtNum(p.diffusionCoeff, 3) : '—'}</td>
                        <td className="py-2 pr-3">{p ? fmtNum(p.dt, 3) : '—'}</td>
                        <td className="py-2 pr-3">{p ? formatDurationShort(p.totalTime) : '—'}</td>
                        <td className="py-2 pr-3">{p ? fmtNum(p.threshold, 3) : '—'}</td>
                        <td className="py-2 pr-3">
                          {p
                            ? p.vents.length === 0
                              ? '封闭'
                              : `${fmtNum(toLs(p.vents.reduce((s, x) => s + (x.flow > 0 ? x.flow : 0), 0)), 1)} L/s`
                            : '—'}
                        </td>
                        <td className={`py-2 pr-3 font-semibold ${r?.roomClearTime === null ? 'text-brick-600' : 'text-moss-600'}`}>
                          {!r ? '—' : r.roomClearTime === null ? '未散去' : formatDuration(r.roomClearTime)}
                        </td>
                        <td className="py-2 pr-3">
                          {r?.lastPoint ? `(${fmtNum(r.lastPoint.x, 2)}, ${fmtNum(r.lastPoint.y, 2)})` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function MiniStat({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="rounded-lg bg-paper-100 border border-paper-200 px-2.5 py-1.5">
      <div className="text-ink-700/55">{k}</div>
      <div className={`font-semibold ${bad ? 'text-brick-600' : 'text-ink-800'}`}>{v}</div>
    </div>
  );
}

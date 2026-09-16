import type { SimParams, Vent, ValidationResult } from '../../diffusion/types';
import { makeVent } from '../../diffusion/presets';
import { toLs, fromLs, fmtNum } from '../../diffusion/format';
import { SectionTitle, NumberField, IssueList } from './fields';
import { Plus, Trash2, Wand2 } from 'lucide-react';

interface Props {
  params: SimParams;
  onChange: (next: SimParams) => void;
  validation: ValidationResult;
}

export default function ParamForm({ params, onChange, validation }: Props) {
  const set = <K extends keyof SimParams>(key: K, value: SimParams[K]) =>
    onChange({ ...params, [key]: value });

  const errorFields = new Set(validation.issues.filter((i) => i.level === 'error').map((i) => i.field));
  const warnFields = new Set(validation.issues.filter((i) => i.level === 'warning').map((i) => i.field));
  const invalid = (field: string) => errorFields.has(field);
  const hinted = (field: string) => warnFields.has(field);

  const errors = validation.issues.filter((i) => i.level === 'error' && !i.field.startsWith('vent-'));
  const warnings = validation.issues.filter((i) => i.level === 'warning' && !i.field.startsWith('vent-'));

  // ---- 通风口编辑 ----
  const setVent = (id: string, patch: Partial<Vent>) =>
    set(
      'vents',
      params.vents.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    );
  const addVent = () =>
    set('vents', [
      ...params.vents,
      makeVent({
        x: +(params.roomLength * 0.8).toFixed(2),
        y: +(params.roomWidth * 0.8).toFixed(2),
        flow: 0,
      }),
    ]);
  const removeVent = (id: string) => set('vents', params.vents.filter((v) => v.id !== id));

  // 采用 CFL 安全步长（留 20% 余量）
  const safeDt = validation.maxStableDt ? validation.maxStableDt * 0.8 : null;
  const grid = validation.grid;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-700">方案名称</span>
        {grid && (
          <span className="text-[11px] text-moss-600 bg-moss-100 px-2 py-0.5 rounded-full">
            网格 {grid.nx} × {grid.ny} = {grid.cells.toLocaleString()} 格
            {grid.steps > 0 && ` · ${grid.steps.toLocaleString()} 步`}
          </span>
        )}
      </div>
      <input
        type="text"
        value={params.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder="给这套方案起个名字"
        className="scent-input py-2 text-sm"
      />

      {/* 房间 */}
      <div className="space-y-3">
        <SectionTitle color="ochre" title="房间尺寸" hint="矩形房间，单位：米" />
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="长 L" value={params.roomLength} onValue={(v) => set('roomLength', v)} unit="m" step={0.1} invalid={invalid('roomLength')} />
          <NumberField label="宽 W" value={params.roomWidth} onValue={(v) => set('roomWidth', v)} unit="m" step={0.1} invalid={invalid('roomWidth')} />
          <NumberField label="层高 H" value={params.roomHeight} onValue={(v) => set('roomHeight', v)} unit="m" step={0.1} invalid={invalid('roomHeight')} />
        </div>
      </div>

      {/* 源点 */}
      <div className="space-y-3">
        <SectionTitle color="moss" title="气味源" />
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="源点 x" value={params.sourceX} onValue={(v) => set('sourceX', v)} unit="m" step={0.1} invalid={invalid('sourceX') || invalid('source')} />
          <NumberField label="源点 y" value={params.sourceY} onValue={(v) => set('sourceY', v)} unit="m" step={0.1} invalid={invalid('sourceY') || invalid('source')} />
          <NumberField label="源斑半径" value={params.sourceRadius} onValue={(v) => set('sourceRadius', v)} unit="m" step={0.05} hint="气味覆盖范围" invalid={invalid('sourceRadius')} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-ink-700">气味强度（源处初始浓度）</label>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-ochre-100 text-ochre-600 font-semibold text-xs">
              {params.intensity || 0} / 10
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={Number.isFinite(params.intensity) ? params.intensity : 5}
            onChange={(e) => set('intensity', Number(e.target.value))}
            className="scent-slider"
          />
        </div>
      </div>

      {/* 物理参数 */}
      <div className="space-y-3">
        <SectionTitle color="lavender" title="扩散与时间" />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="扩散系数 D"
            value={params.diffusionCoeff}
            onValue={(v) => set('diffusionCoeff', v)}
            unit="m²/s"
            step={0.005}
            hint="空气约 1e-5，扰动空气可取更大"
            invalid={invalid('diffusionCoeff')}
          />
          <NumberField
            label="安全阈值"
            value={params.threshold}
            onValue={(v) => set('threshold', v)}
            unit="浓度"
            step={0.01}
            hint="低于此值视为散去"
            invalid={invalid('threshold') || hinted('threshold')}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="网格步长 dx" value={params.dx} onValue={(v) => set('dx', v)} unit="m" step={0.05} invalid={invalid('grid') || invalid('dx')} />
          <NumberField label="网格步长 dy" value={params.dy} onValue={(v) => set('dy', v)} unit="m" step={0.05} invalid={invalid('grid') || invalid('dy')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="时间步长 dt"
            value={params.dt}
            onValue={(v) => set('dt', v)}
            unit="s"
            step={0.05}
            invalid={invalid('dt')}
          />
          <NumberField label="总时长 T" value={params.totalTime} onValue={(v) => set('totalTime', v)} unit="s" step={60} invalid={invalid('totalTime')} />
        </div>
        {safeDt !== null && (
          <button
            type="button"
            onClick={() => set('dt', +(safeDt).toFixed(3))}
            className="inline-flex items-center gap-1.5 text-xs text-moss-600 bg-moss-100 hover:bg-moss-200/70 border border-moss-200 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <Wand2 className="w-3.5 h-3.5" />
            采用稳定安全步长 dt≈{fmtNum(safeDt, 3)}s（当前 CFL 上限 {fmtNum(validation.maxStableDt!, 3)}s）
          </button>
        )}
      </div>

      {/* 通风口 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle color="moss" title={`通风口（${params.vents.length}）`} hint="排风会从室内总量中扣减并入账" />
          <button type="button" onClick={addVent} className="btn-ghost !py-1.5 !px-3 text-xs inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> 添加风口
          </button>
        </div>
        {params.vents.length === 0 && (
          <div className="text-xs text-ink-700/55 bg-paper-100 border border-dashed border-paper-400 rounded-xl px-3 py-2.5">
            没有通风口：这是一个封闭房间，四壁无通量，气味不会凭空消失，只会扩散至均匀。
          </div>
        )}
        <div className="space-y-3">
          {params.vents.map((v, idx) => {
            const bad = validation.issues.some((i) => i.field === `vent-${v.id}`);
            const ownIssues = validation.issues.filter((i) => i.field === `vent-${v.id}`);
            return (
              <div key={v.id} className={`rounded-xl border p-3 space-y-2 ${bad ? 'border-brick-400/60 bg-brick-400/5' : 'border-paper-300 bg-paper-50'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink-800">风口 #{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeVent(v.id)}
                    className="p-1 rounded-lg text-brick-500 hover:bg-brick-500/10 transition-colors"
                    title="删除风口"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="x 坐标" value={v.x} onValue={(nv) => setVent(v.id, { x: nv })} unit="m" step={0.1} invalid={bad} />
                  <NumberField label="y 坐标" value={v.y} onValue={(nv) => setVent(v.id, { y: nv })} unit="m" step={0.1} invalid={bad} />
                  <NumberField label="有效面积" value={v.area} onValue={(nv) => setVent(v.id, { area: nv })} unit="m²" step={0.01} hint="如 0.3×0.3=0.09" invalid={bad} />
                  <label className="block">
                    <span className="block text-xs font-medium text-ink-700 mb-1">排风量</span>
                    <div className="relative">
                      <input
                        type="number"
                        step={5}
                        min={0}
                        value={Number.isFinite(v.flow) ? String(+toLs(v.flow).toFixed(3)) : ''}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          setVent(v.id, { flow: raw === '' ? NaN : fromLs(Number(raw)) });
                        }}
                        className={`scent-input py-2 text-sm ${bad ? 'border-brick-500 ring-2 ring-brick-400/30' : ''}`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-700/50 pointer-events-none">L/s</span>
                    </div>
                  </label>
                </div>
                {ownIssues.length > 0 && <IssueList issues={ownIssues} />}
              </div>
            );
          })}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-1.5">
          <IssueList issues={warnings} />
        </div>
      )}
      {errors.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-brick-600">下列问题需要修正后才能运行：</div>
          <IssueList issues={errors} />
        </div>
      )}
    </div>
  );
}

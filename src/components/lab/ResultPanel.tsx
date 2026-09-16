import type { SimResult, SimFrame } from '../../diffusion/types';
import { sampleAt, frameMass } from '../../diffusion/simulator';
import { formatDuration, fmtNum, toLs } from '../../diffusion/format';
import { Clock, MapPin, ShieldCheck, ShieldAlert, Scale, Gauge } from 'lucide-react';
import type { ProbePoint } from './FieldCanvas';

interface Props {
  result: SimResult;
  frame: SimFrame;
  pinned: ProbePoint | null;
}

function Stat({
  icon,
  label,
  children,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  tone?: 'default' | 'good' | 'bad';
}) {
  const toneCls =
    tone === 'good'
      ? 'bg-moss-100/70 border-moss-200'
      : tone === 'bad'
        ? 'bg-brick-400/10 border-brick-400/40'
        : 'bg-paper-100 border-paper-300';
  return (
    <div className={`rounded-xl border p-3 ${toneCls}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-ink-700/60 mb-1">
        {icon}
        {label}
      </div>
      <div className="font-serif text-lg text-ink-800 leading-snug">{children}</div>
    </div>
  );
}

export default function ResultPanel({ result, frame, pinned }: Props) {
  const { diagnostics: d, params, grid } = result;
  const remaining = frameMass(result, frame);
  // 任意时刻都满足「室内余量 + 风口累计排出 = 初始总量」（守恒残差为机器精度），
  // 所以逐帧的累计排出量直接由恒等式推出，保证两段相加恒为 100%。
  const vented = Math.max(0, d.initialMass - remaining);
  const remainPct = d.initialMass > 0 ? (remaining / d.initialMass) * 100 : 0;
  const ventedPct = d.initialMass > 0 ? (vented / d.initialMass) * 100 : 0;
  const isClosed = params.vents.every((v) => !(v.flow > 0));
  const cleared = result.roomClearTime !== null;
  const pinnedConc = pinned ? sampleAt(result, frame, pinned.x, pinned.y) : null;
  const pinnedClear = pinned
    ? result.clearTime[
        Math.min(grid.ny - 1, Math.max(0, Math.floor(pinned.y / grid.dy))) * grid.nx +
        Math.min(grid.nx - 1, Math.max(0, Math.floor(pinned.x / grid.dx)))
      ]
    : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat
          icon={cleared ? <ShieldCheck className="w-3.5 h-3.5 text-moss-600" /> : <ShieldAlert className="w-3.5 h-3.5 text-brick-500" />}
          label="全室散去时间"
          tone={cleared ? 'good' : 'bad'}
        >
          {cleared ? formatDuration(result.roomClearTime) : '总时长内未散去'}
        </Stat>
        <Stat icon={<Clock className="w-3.5 h-3.5 text-ochre-500" />} label="模拟总时长">
          {formatDuration(params.totalTime)}
        </Stat>
        <Stat icon={<MapPin className="w-3.5 h-3.5 text-brick-500" />} label="最晚散去位置">
          {result.lastPoint ? (
            <span className="text-base">
              ({fmtNum(result.lastPoint.x, 2)}, {fmtNum(result.lastPoint.y, 2)}) m
              <span className="block text-xs text-ink-700/60 font-sans">
                {formatDuration(result.lastPoint.t)} 时达标
              </span>
            </span>
          ) : (
            <span className="text-base">—</span>
          )}
        </Stat>
        <Stat icon={<Gauge className="w-3.5 h-3.5 text-lavender-600" />} label="全程最高浓度">
          {fmtNum(d.maxConcentration, 3)}
        </Stat>
      </div>

      {!cleared && (
        <div className="text-xs leading-relaxed rounded-xl border border-brick-400/40 bg-brick-400/10 text-brick-600 px-3 py-2">
          {isClosed ? (
            d.equilibrium <= params.threshold
              ? `封闭房间没有排风，气味只会扩散至均匀。平衡浓度 ${fmtNum(d.equilibrium, 4)} 低于阈值 ${fmtNum(params.threshold, 4)}，理论上最终可达标，但总时长内尚未散去。总量始终不变。`
              : `封闭房间没有排风，气味只会扩散至均匀：平衡浓度 ${fmtNum(d.equilibrium, 4)} 高于安全阈值 ${fmtNum(params.threshold, 4)}，永远无法靠扩散散去（需通风）。总量始终不变。`
          ) : (
            '到模拟结束时仍有位置高于安全阈值（可加大风量/风口面积或延长总时长）。'
          )}
        </div>
      )}

      {/* 质量守恒账单 */}
      <div className="rounded-xl border border-paper-300 bg-paper-50 p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-800">
          <Scale className="w-3.5 h-3.5 text-ochre-500" />
          总量账单（不许凭空增减）
        </div>
        <div className="text-[11px] text-ink-700/60">
          单位为「归一化质量」= Σ浓度 × 格体积；封闭房间该值全程恒定，通风时 = 室内余量 + 风口累计排出。
        </div>
        <div className="h-3 rounded-full overflow-hidden bg-paper-200 flex">
          <div
            className="h-full bg-gradient-to-r from-ochre-300 to-ochre-600"
            style={{ width: `${Math.max(0, remainPct)}%` }}
            title="室内余量"
          />
          <div
            className="h-full bg-gradient-to-r from-moss-300 to-moss-500"
            style={{ width: `${Math.max(0, ventedPct)}%` }}
            title="风口累计排出"
          />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <Row k="初始总量" v={fmtNum(d.initialMass, 3)} />
          <Row k="当前室内" v={`${fmtNum(remaining, 3)}（${remainPct.toFixed(1)}%）`} />
          <Row k="风口累计排出" v={`${fmtNum(vented, 3)}（${ventedPct.toFixed(1)}%）`} />
          <Row
            k="守恒残差"
            v={`${(d.balanceError * 100).toExponential(1)}%`}
            good={Math.abs(d.balanceError) < 1e-9}
          />
        </div>
        <div className="text-[11px] text-ink-700/55">
          排风量合计：{fmtNum(toLs(params.vents.reduce((s, v) => s + (v.flow > 0 ? v.flow : 0), 0)), 1)} L/s
          {result.earlyStopped && <span className="ml-2 text-moss-600">· 全场已低于阈值 1%，提前结束</span>}
        </div>
      </div>

      {/* 钉住探针读数 */}
      {pinned && pinnedConc !== null && (
        <div className="rounded-xl border border-ink-900/20 bg-ink-900 text-paper-50 p-3 text-xs space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> 探针 ({fmtNum(pinned.x, 2)}, {fmtNum(pinned.y, 2)}) m
          </div>
          <div className="flex justify-between">
            <span className="text-paper-200/70">当前浓度</span>
            <b>{fmtNum(pinnedConc, 4)}</b>
          </div>
          <div className="flex justify-between">
            <span className="text-paper-200/70">首次降到阈值</span>
            <b>{Number.isFinite(pinnedClear) ? formatDuration(pinnedClear as number) : '总时长内未散去'}</b>
          </div>
          <div className="flex justify-between">
            <span className="text-paper-200/70">安全阈值</span>
            <b>{fmtNum(params.threshold, 4)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-700/60">{k}</span>
      <span className={`font-mono ${good ? 'text-moss-600' : 'text-ink-800'}`}>{v}</span>
    </div>
  );
}

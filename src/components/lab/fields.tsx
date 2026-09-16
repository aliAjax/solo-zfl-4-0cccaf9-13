import type { ReactNode } from 'react';
import { AlertTriangle, XCircle, Info } from 'lucide-react';
import type { ValidationIssue } from '../../diffusion/types';

export function SectionTitle({ color, title, hint }: { color: 'ochre' | 'moss' | 'lavender'; title: string; hint?: string }) {
  const bar = { ochre: 'bg-ochre-500', moss: 'bg-moss-500', lavender: 'bg-lavender-500' }[color];
  const text = { ochre: 'text-ochre-600', moss: 'text-moss-600', lavender: 'text-lavender-600' }[color];
  return (
    <div className="flex items-baseline gap-2 pb-2 border-b border-paper-200">
      <span className={`w-1.5 h-5 rounded-full ${bar}`} />
      <h3 className={`font-hand text-lg ${text}`}>{title}</h3>
      {hint && <span className="text-[11px] text-ink-700/50">{hint}</span>}
    </div>
  );
}

interface NumberFieldProps {
  label: ReactNode;
  value: number;
  onValue: (v: number) => void;
  step?: number;
  unit?: string;
  placeholder?: string;
  hint?: string;
  invalid?: boolean;
  min?: number;
  max?: number;
}

/** 数字输入：允许暂时清空/非法中间态（向外抛 NaN，由校验报错拦截） */
export function NumberField({ label, value, onValue, step = 0.1, unit, placeholder, hint, invalid, min, max }: NumberFieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-700 mb-1">{label}</span>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={Number.isFinite(value) ? String(value) : ''}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onValue(raw === '' ? NaN : Number(raw));
          }}
          className={`scent-input py-2 text-sm ${invalid ? 'border-brick-500 ring-2 ring-brick-400/30' : ''}`}
        />
        {unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-700/50 pointer-events-none">
            {unit}
          </span>
        )}
      </div>
      {hint && <span className="block text-[11px] text-ink-700/45 mt-1">{hint}</span>}
    </label>
  );
}

export function IssueList({
  issues,
  fieldPrefix = '',
}: {
  issues: ValidationIssue[];
  fieldPrefix?: string;
}) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {issues.map((iss, idx) => {
        const Icon = iss.level === 'error' ? XCircle : iss.field === 'global' ? Info : AlertTriangle;
        const tone =
          iss.level === 'error'
            ? 'bg-brick-400/10 border-brick-400/40 text-brick-600'
            : 'bg-ochre-100/70 border-ochre-300 text-ochre-700';
        return (
          <li
            key={`${iss.field}-${idx}`}
            data-issue-field={fieldPrefix + iss.field}
            className={`flex items-start gap-2 text-xs leading-relaxed px-3 py-2 rounded-lg border ${tone}`}
          >
            <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{iss.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

import type { CSSProperties, ReactNode } from 'react';
import { cx, vars } from '@/lib/css';
import type { Palette } from '@/lib/palette';

export function Dot({
  color,
  size = 7,
  style,
}: {
  color: string;
  size?: number;
  style?: CSSProperties;
}) {
  return <div className="dot" style={{ width: size, height: size, background: color, ...style }} />;
}

export function Pill({
  color,
  children,
  tight,
  style,
}: {
  color: string;
  children: ReactNode;
  tight?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span className={cx('pill', tight && 'pill--tight')} style={vars({ '--pill': color }, style)}>
      {children}
    </span>
  );
}

export function Meter({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="meter">
      <div
        className="meter__fill"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: color }}
      />
    </div>
  );
}

export function LabeledMeter({
  label,
  value,
  percent,
  color,
}: {
  label: string;
  value: string;
  percent: number;
  color: string;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{label}</span>
        <span className="mono" style={{ fontSize: 11 }}>
          {value}
        </span>
      </div>
      <Meter percent={percent} color={color} />
    </div>
  );
}

/** Load bars turn amber past 70% and red past 85%. */
export function loadTone(percent: number, palette: Palette, accent: string): string {
  if (percent >= 85) return palette.bad;
  if (percent >= 70) return palette.warn;
  return accent;
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="sect" style={style}>
      {children}
    </div>
  );
}

/** Left colour rail + body, used by warnings, risks and security signals. */
export function NoteRow({
  color,
  children,
  style,
}: {
  color: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', gap: 11, ...style }}>
      <div style={{ width: 3, flex: 'none', borderRadius: 2, background: color }} />
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  suffix,
  hint,
  valueColor,
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  hint: string;
  valueColor?: string;
}) {
  return (
    <div className="panel panel--r11" style={{ padding: '14px 15px' }}>
      <div style={{ fontSize: 10.5, color: 'var(--text2)' }}>{label}</div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 300,
          marginTop: 6,
          letterSpacing: '-.02em',
          color: valueColor,
        }}
      >
        {value}
        {suffix ? <span style={{ fontSize: 15, color: 'var(--text3)' }}>{suffix}</span> : null}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4 }}>{hint}</div>
    </div>
  );
}

/** Card header used by every full-width panel in the content views. */
export function PanelTitle({
  title,
  subtitle,
  action,
  style,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={style}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        {action}
      </div>
      {subtitle ? (
        <div className="pretty" style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

export function ViewHeading({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 18,
      }}
    >
      <div>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.01em' }}>{title}</div>
        {subtitle ? (
          <div className="pretty" style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 4 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {right}
    </div>
  );
}

/** Command block with a copy affordance. */
export function CommandCard({
  label,
  command,
  copyLabel,
  onCopy,
  surface = 'panel2',
}: {
  label: string;
  command: string;
  copyLabel: string;
  onCopy: () => void;
  surface?: 'panel' | 'panel2';
}) {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 9,
        overflow: 'hidden',
        background: surface === 'panel' ? 'var(--panel)' : 'var(--panel2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 11px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>{label}</span>
        <button type="button" className="link" style={{ fontSize: 10 }} onClick={onCopy}>
          {copyLabel}
        </button>
      </div>
      <div
        className="mono"
        style={{ padding: '10px 11px', fontSize: 10.5, lineHeight: 1.6, wordBreak: 'break-all' }}
      >
        {command}
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { SectionLabel } from '../ui';

export interface Column {
  label: string;
  /** Renders in the monospaced, non-wrapping style. */
  mono?: boolean;
  width?: string;
}

export function DataTable({ columns, rows }: { columns: Column[]; rows: ReactNode[][] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="dtable">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label} style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={columns[j]?.mono ? 'num' : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Block({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 9,
        }}
      >
        <SectionLabel>{title}</SectionLabel>
        {action}
      </div>
      {hint ? (
        <div
          className="pretty"
          style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.55, marginBottom: 9 }}
        >
          {hint}
        </div>
      ) : null}
      <div className="panel" style={{ overflow: 'hidden' }}>
        {children}
      </div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      className="pretty"
      style={{
        padding: '22px 16px',
        textAlign: 'center',
        color: 'var(--text3)',
        fontSize: 11.5,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {help ? <span className="field__help">{help}</span> : null}
    </label>
  );
}

/** Monospaced inline value, used for VLANs, addresses and ports. */
export function Mono({ children }: { children: ReactNode }) {
  return (
    <span className="mono" style={{ fontSize: 10.5 }}>
      {children}
    </span>
  );
}

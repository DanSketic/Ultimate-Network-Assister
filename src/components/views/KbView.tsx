import { articles } from '@/data/knowledge';
import { useI18n } from '@/i18n';
import { vars } from '@/lib/css';
import { tint } from '@/lib/palette';
import type { CopyApi } from '@/state/useAppState';
import { CommandCard, Dot, SectionLabel } from '../ui';

export function KbView({
  accent,
  copy,
  selectedIndex,
  onSelect,
}: {
  accent: string;
  copy: CopyApi;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const { lang, t } = useI18n();
  const list = articles(lang);
  const article = list[selectedIndex] ?? list[0]!;

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
      <div
        style={{
          width: 320,
          flex: 'none',
          borderRight: '1px solid var(--line)',
          background: 'var(--panel)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t.kb.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>{t.kb.subtitle}</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
          {list.map((a, i) => {
            const active = i === selectedIndex;
            return (
              <button
                key={a.title}
                type="button"
                className="tile"
                aria-pressed={active}
                style={vars({
                  '--tile-bg': active ? tint(accent, '14') : 'transparent',
                  '--tile-bc': active ? tint(accent, '66') : 'var(--line)',
                })}
                onClick={() => onSelect(i)}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: 'var(--accent)',
                    border: '1px solid var(--accent)',
                    borderRadius: 4,
                    padding: '1px 5px',
                    display: 'inline-block',
                  }}
                >
                  {a.tag}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, marginTop: 8, lineHeight: 1.35 }}>
                  {a.title}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 30px 32px', minWidth: 0 }}>
        <div style={{ maxWidth: 760 }}>
          <div
            style={{
              fontSize: 9.5,
              color: 'var(--accent)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
            }}
          >
            {article.tag}
          </div>
          <div
            className="pretty"
            style={{
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: '-.015em',
              marginTop: 9,
              lineHeight: 1.25,
            }}
          >
            {article.title}
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 12,
              padding: '5px 10px',
              border: '1px solid var(--line)',
              borderRadius: 7,
              background: 'var(--panel)',
            }}
          >
            <Dot color={accent} size={5} />
            <span className="mono" style={{ fontSize: 10, color: 'var(--text2)' }}>
              {article.related}
            </span>
          </div>

          <div
            className="pretty"
            style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text2)', marginTop: 18 }}
          >
            {article.lead}
          </div>

          {article.sections.map((section) => (
            <div key={section.heading} style={{ marginTop: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{section.heading}</div>
              <div
                className="pretty"
                style={{ fontSize: 12.5, lineHeight: 1.75, color: 'var(--text2)', marginTop: 7 }}
              >
                {section.body}
              </div>
            </div>
          ))}

          {article.commands.length > 0 ? (
            <div style={{ marginTop: 24 }}>
              <SectionLabel style={{ marginBottom: 10 }}>{t.kb.referenceCommands}</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {article.commands.map((c, i) => {
                  const key = `art-${selectedIndex}-${i}`;
                  return (
                    <CommandCard
                      key={c.label}
                      label={c.label}
                      command={c.command}
                      copyLabel={copy.label(key)}
                      onCopy={() => copy.copy(c.command, key)}
                      surface="panel"
                    />
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

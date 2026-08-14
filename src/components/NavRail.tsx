import type { ViewId } from '@/config';
import { useT } from '@/i18n';
import { vars } from '@/lib/css';
import { tint } from '@/lib/palette';
import { NavIcon } from './icons';

/** Design order differs from VIEWS: the topology map is the landing view. */
const NAV_ORDER: ViewId[] = [
  'overview',
  'topology',
  'survey',
  'advice',
  'backup',
  'planner',
  'ssh',
  'kb',
  'settings',
];

export function NavRail({
  view,
  accent,
  onSelect,
}: {
  view: ViewId;
  accent: string;
  onSelect: (view: ViewId) => void;
}) {
  const t = useT();

  return (
    <nav className="navrail" aria-label={t.nav.label}>
      {NAV_ORDER.map((id) => {
        const active = view === id;
        return (
          <button
            key={id}
            type="button"
            className="nav-item"
            aria-current={active ? 'page' : undefined}
            style={vars({
              '--nav-bg': active ? tint(accent, '1f') : 'transparent',
              '--nav-fg': active ? accent : 'var(--text2)',
            })}
            onClick={() => onSelect(id)}
          >
            <NavIcon view={id} />
            <span className="nav-item__label">
              {t.nav[id].map((line, i) => (
                <span key={line}>
                  {i > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

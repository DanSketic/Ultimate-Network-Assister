import { useT } from '@/i18n';
import type { ThemeName, ThemePref } from '@/lib/palette';
import { MonitorIcon, MoonIcon, SunIcon } from './icons';

/**
 * Three-way theme control: follow the system, or pin light or dark.
 *
 * `auto` is a preference, not a colour, so the control shows what was chosen
 * rather than what is currently on screen — otherwise the button would appear
 * to move on its own when the operating system switches at dusk.
 */
export function ThemeSwitch({
  value,
  resolved,
  onChange,
}: {
  value: ThemePref;
  /** What `auto` currently resolves to, used only for the tooltip. */
  resolved: ThemeName;
  onChange: (value: ThemePref) => void;
}) {
  const t = useT();
  const autoTitle = t.theme.autoNow(
    resolved === 'dark' ? t.theme.darkWord : t.theme.lightWord,
  );

  return (
    <div className="seg" role="radiogroup" aria-label={t.theme.group}>
      <button
        type="button"
        role="radio"
        className="seg__btn"
        aria-checked={value === 'auto'}
        title={autoTitle}
        onClick={() => onChange('auto')}
      >
        <MonitorIcon />
        <span className="seg__label">{t.theme.autoShort}</span>
      </button>
      <button
        type="button"
        role="radio"
        className="seg__btn"
        aria-checked={value === 'light'}
        aria-label={t.theme.light}
        title={t.theme.light}
        onClick={() => onChange('light')}
      >
        <SunIcon />
      </button>
      <button
        type="button"
        role="radio"
        className="seg__btn"
        aria-checked={value === 'dark'}
        aria-label={t.theme.dark}
        title={t.theme.dark}
        onClick={() => onChange('dark')}
      >
        <MoonIcon />
      </button>
    </div>
  );
}

import { LANG_LABELS, LANGS, useT, type Lang, type LangPref } from '@/i18n';

/**
 * Language chooser, shaped like the theme switch so the two settings read as
 * one pair. `auto` shows what it currently resolves to, because unlike the
 * theme there is no visual cue for the language you are already reading.
 */
export function LanguageSwitch({
  value,
  resolved,
  onChange,
}: {
  value: LangPref;
  resolved: Lang;
  onChange: (value: LangPref) => void;
}) {
  const t = useT();

  return (
    <div className="seg" role="radiogroup" aria-label={t.settings.language}>
      <button
        type="button"
        role="radio"
        className="seg__btn"
        aria-checked={value === 'auto'}
        title={`${t.settings.languageAuto} (${LANG_LABELS[resolved]})`}
        onClick={() => onChange('auto')}
      >
        <span className="seg__label">{t.theme.autoShort}</span>
      </button>
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          role="radio"
          className="seg__btn"
          aria-checked={value === lang}
          title={LANG_LABELS[lang]}
          onClick={() => onChange(lang)}
        >
          <span className="seg__label">{lang.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}

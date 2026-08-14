import { useI18n } from '@/i18n';
import type { Palette } from '@/lib/palette';
import type { Estate } from '@/survey/mapping';
import { Dot } from './ui';

export function StatusBar({ palette, estate }: { palette: Palette; estate: Estate }) {
  const { t } = useI18n();
  const live = estate.source === 'survey';
  const unverified = estate.rules.filter((r) => r.state !== 'Felmért').length;
  const when = estate.surveyedAt?.slice(0, 16).replace('T', ' ') ?? t.common.none;

  return (
    <footer className="statusbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Dot color={palette.ok} size={5} />
        {t.status.readOnlySession}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Dot color={live ? palette.ok : palette.idle} size={5} />
        {live ? t.status.liveSurvey : t.status.demoData}
      </div>
      <div style={{ flex: 1 }} />
      <div>{live ? t.status.lastSurvey(when, estate.risks.length) : t.status.demoNote}</div>
      <div>{t.status.unverifiedRules(unverified)}</div>
      <div className="mono">{t.status.secrets}</div>
    </footer>
  );
}

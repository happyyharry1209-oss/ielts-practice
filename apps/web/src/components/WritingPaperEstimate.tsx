import { writingPaperBand } from '@ielts/shared';
import type { WritingFeedback } from '@ielts/shared';
import { useTranslation } from 'react-i18next';
import { bandColor } from '../lib/utils';

export function WritingPaperEstimate({ task1, task2 }: { task1?: WritingFeedback; task2?: WritingFeedback }) {
  const { t } = useTranslation();
  const band = writingPaperBand(task1, task2);
  if (band === null) return null;

  return (
    <div className="card border-t-2 border-t-brand-600 p-4" role="status">
      <p className="text-sm font-semibold text-ink">{t('writing.paperBand')}</p>
      <p className={`mt-1 font-serif text-4xl font-medium ${bandColor(band)}`}>Band {band.toFixed(1)}</p>
      <p className="mt-1 text-xs text-muted">{t('writing.paperBandWeight')}</p>
    </div>
  );
}

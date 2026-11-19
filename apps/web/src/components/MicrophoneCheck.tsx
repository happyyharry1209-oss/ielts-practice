import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecorder } from '../lib/useExam';

async function hasSignal(blob: Blob): Promise<boolean> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = audio.getChannelData(0);
    let power = 0;
    let peak = 0;
    for (const sample of samples) {
      power += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    return peak >= 0.01 && Math.sqrt(power / Math.max(1, samples.length)) >= 0.002;
  } finally {
    void context.close().catch(() => undefined);
  }
}

export function MicrophoneCheck({ onReady }: { onReady: () => void }) {
  const { t } = useTranslation();
  const recorder = useRecorder();
  const [signal, setSignal] = useState<'pending' | 'detected' | 'silent' | 'listen'>('pending');
  const { recording, stop, blob } = recorder;

  useEffect(() => {
    if (!recording) return;
    const timeout = window.setTimeout(stop, 3500);
    return () => window.clearTimeout(timeout);
  }, [recording, stop]);

  useEffect(() => {
    if (!blob) return;
    let current = true;
    void hasSignal(blob).then(
      (audible) => { if (current) setSignal(audible ? 'detected' : 'silent'); },
      () => { if (current) setSignal('listen'); },
    );
    return () => { current = false; };
  }, [blob]);

  return (
    <section className="card space-y-3 p-5" aria-label={t('speaking.micCheck')}>
      <h2 className="font-serif text-xl font-semibold text-ink">{t('speaking.micCheck')}</h2>
      <p className="text-sm text-muted">{t('speaking.micInstruction')}</p>
      <div aria-live="polite" className="space-y-2 text-sm">
        {recorder.error === 'denied' ? <p className="text-rose-600">{t('speaking.micDenied')}</p> : null}
        {!recorder.supported ? <p className="text-rose-600">{t('speaking.micUnsupported')}</p> : null}
        {recorder.recording ? <p>{t('speaking.micChecking')}</p> : null}
        {signal !== 'pending' && recorder.url ? <p className={signal === 'silent' ? 'text-rose-600' : 'text-muted'}>
          {t(`speaking.signal-${signal}`)}
        </p> : null}
      </div>
      {recorder.url ? <audio controls src={recorder.url} className="w-full" aria-label={t('speaking.micCheck')} /> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" disabled={recorder.busy || !recorder.supported} onClick={() => {
          setSignal('pending');
          void recorder.start();
        }}>{t('speaking.micTestButton')}</button>
        {recorder.url && (signal === 'detected' || signal === 'listen') ? (
          <button type="button" className="btn-primary" onClick={onReady}>{t('speaking.micConfirm')}</button>
        ) : null}
      </div>
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecorder } from '../lib/useExam';

type Signal = 'pending' | 'detected' | 'quiet' | 'silent' | 'listen';

async function measureClip(blob: Blob): Promise<Signal> {
  const context = new OfflineAudioContext(1, 1, 44100);
  const audio = await context.decodeAudioData(await blob.arrayBuffer());
  let strongest: Signal = 'silent';
  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
    const samples = audio.getChannelData(channel);
    let power = 0;
    let peak = 0;
    for (const sample of samples) {
      power += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    if (peak >= 0.01 && Math.sqrt(power / Math.max(1, samples.length)) >= 0.002) return 'detected';
    if (peak > 0.00001) strongest = 'quiet';
  }
  return strongest;
}

export function MicrophoneCheck({ onReady, initialDevice = '' }: {
  onReady: (deviceId: string) => void;
  initialDevice?: string;
}) {
  const { t } = useTranslation();
  const recorder = useRecorder();
  const [signal, setSignal] = useState<Signal>('pending');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState(initialDevice);
  const [level, setLevel] = useState<number | null>(null);
  const meterContext = useRef<AudioContext | null>(null);
  const { recording, stop, blob, stream } = recorder;

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return;
    let current = true;
    const refresh = () => {
      void media.enumerateDevices().then((list) => {
        if (current) setDevices(list.filter((device) => device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'default'));
      }).catch(() => undefined);
    };
    refresh();
    media.addEventListener?.('devicechange', refresh);
    return () => {
      current = false;
      media.removeEventListener?.('devicechange', refresh);
    };
  }, [stream]);

  useEffect(() => {
    const context = meterContext.current;
    if (!stream || !context) return;
    let source: MediaStreamAudioSourceNode;
    try {
      source = context.createMediaStreamSource(stream);
    } catch {
      return;
    }
    const analyser = context.createAnalyser();
    const samples = new Float32Array(analyser.fftSize);
    source.connect(analyser);
    const timer = window.setInterval(() => {
      if (context.state !== 'running') return;
      analyser.getFloatTimeDomainData(samples);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      setLevel(Math.round(Math.min(1, Math.sqrt(peak) * 1.8) * 100));
    }, 80);
    return () => {
      window.clearInterval(timer);
      source.disconnect();
    };
  }, [stream]);

  function releaseMeter() {
    const context = meterContext.current;
    meterContext.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }

  useEffect(() => () => releaseMeter(), []);
  useEffect(() => {
    if (!recorder.busy) releaseMeter();
  }, [recorder.busy]);

  useEffect(() => {
    if (!recording) return;
    const timeout = window.setTimeout(stop, 6000);
    return () => window.clearTimeout(timeout);
  }, [recording, stop]);

  useEffect(() => {
    if (!blob) return;
    let current = true;
    releaseMeter();
    void measureClip(blob).then(
      (result) => { if (current) setSignal(result); },
      () => { if (current) setSignal('listen'); },
    );
    return () => { current = false; };
  }, [blob]);

  function testSelectedInput() {
    setSignal('pending');
    setLevel(null);
    releaseMeter();
    try {
      meterContext.current = new AudioContext();
      void meterContext.current.resume().catch(() => undefined);
    } catch {
      // Clip playback is still available if the browser has no live meter.
    }
    void recorder.start(deviceId).then((started) => {
      if (!started) releaseMeter();
    });
  }

  const confirmable = recorder.url && (signal === 'detected' || signal === 'quiet' || signal === 'listen');
  return (
    <section className="card space-y-3 p-5" aria-label={t('speaking.micCheck')}>
      <h2 className="font-serif text-xl font-semibold text-ink">{t('speaking.micCheck')}</h2>
      <p className="text-sm text-muted">{t('speaking.micInstruction')}</p>
      <label className="block text-sm font-semibold text-ink">
        {t('speaking.micInput')}
        <select className="input mt-1" value={deviceId} disabled={recorder.busy} onChange={(event) => {
          setDeviceId(event.target.value);
          setSignal('pending');
          recorder.clear();
        }}>
          <option value="">{t('speaking.micDefault')}</option>
          {deviceId && !devices.some((device) => device.deviceId === deviceId) ? (
            <option value={deviceId}>{t('speaking.micPrevious')}</option>
          ) : null}
          {devices.map((device, index) => <option value={device.deviceId} key={device.deviceId}>
            {device.label || t('speaking.micNumber', { number: index + 1 })}
          </option>)}
        </select>
      </label>
      <div aria-live="polite" className="space-y-2 text-sm">
        {recorder.error || !recorder.supported ? <p className="text-rose-600">{t(`speaking.${recorder.error ?? 'micUnsupported'}`)}</p> : null}
        {recorder.input?.label ? <p className="text-muted">{t('speaking.micUsing', { name: recorder.input.label })}</p> : null}
        {recorder.recording ? <p>{t('speaking.micChecking')}</p> : null}
        {signal !== 'pending' && recorder.url ? <p className={signal === 'silent' ? 'text-rose-600' : 'text-muted'}>
          {t(`speaking.signal-${signal}`)}
        </p> : null}
      </div>
      {recording && level !== null ? <label className="block text-sm text-muted">
        {t('speaking.micLevel')}
        <meter className="mt-1 block w-full" min={0} max={100} value={level} />
      </label> : null}
      {recorder.url ? <audio controls src={recorder.url} className="w-full" aria-label={t('speaking.micCheck')} /> : null}
      <div className="flex flex-wrap gap-2">
        {recording ? (
          <button type="button" className="btn-secondary" onClick={stop}>{t('speaking.stopRecording')}</button>
        ) : (
          <button type="button" className="btn-secondary" disabled={recorder.busy || !recorder.supported}
            onClick={testSelectedInput}>{t('speaking.micTestButton')}</button>
        )}
        {confirmable ? (
          <button type="button" className="btn-primary"
            onClick={() => onReady(recorder.input?.id || deviceId)}>{t('speaking.micConfirm')}</button>
        ) : null}
      </div>
    </section>
  );
}

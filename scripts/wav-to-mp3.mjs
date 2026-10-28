// Convert 16-bit mono WAV files to MP3 with lamejs (pure JS, no ffmpeg).
// Usage: node scripts/wav-to-mp3.mjs <inputDir> <outputDir> [bitrateKbps]

import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { Mp3Encoder } from '@breezystack/lamejs';

const [inputDir, outputDir, bitrateArg] = process.argv.slice(2);
if (!inputDir || !outputDir) {
  console.error('Usage: node scripts/wav-to-mp3.mjs <inputDir> <outputDir> [bitrateKbps]');
  process.exit(1);
}
const bitrate = Number(bitrateArg ?? 48);

function parseWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }
  let offset = 12;
  let format = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buffer.subarray(body, Math.min(body + size, buffer.length));
    }
    offset = body + size + (size % 2);
  }
  if (!format || !data) throw new Error('Missing fmt or data chunk');
  if (format.bitsPerSample !== 16) throw new Error('Only 16-bit PCM is supported');
  return { format, data };
}

mkdirSync(outputDir, { recursive: true });

const files = readdirSync(inputDir).filter((file) => file.toLowerCase().endsWith('.wav'));
if (files.length === 0) {
  console.error(`No .wav files found in ${inputDir}`);
  process.exit(1);
}

for (const file of files) {
  const input = path.join(inputDir, file);
  const output = path.join(outputDir, file.replace(/\.wav$/i, '.mp3'));
  const { format, data } = parseWav(readFileSync(input));

  // Copy into an aligned buffer: Int16Array requires even byte offsets.
  const aligned = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const samples = new Int16Array(aligned);

  const encoder = new Mp3Encoder(format.channels, format.sampleRate, bitrate);
  const blockSize = 1152;
  const chunks = [];
  for (let i = 0; i < samples.length; i += blockSize) {
    const block = samples.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(block);
    if (encoded.length > 0) chunks.push(Buffer.from(encoded));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(Buffer.from(tail));

  const mp3 = Buffer.concat(chunks);
  writeFileSync(output, mp3);
  const seconds = (samples.length / format.channels / format.sampleRate).toFixed(1);
  console.log(
    `${path.basename(input)} → ${path.basename(output)}  ${seconds}s  ${(mp3.length / 1024).toFixed(0)} KB`,
  );
}

const total = readdirSync(outputDir)
  .filter((file) => file.endsWith('.mp3'))
  .reduce((sum, file) => sum + statSync(path.join(outputDir, file)).size, 0);
console.log(`Total MP3 size: ${(total / 1024 / 1024).toFixed(2)} MB`);

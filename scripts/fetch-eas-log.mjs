import { spawnSync } from 'child_process';
import https from 'https';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import os from 'os';

const buildId = process.argv[2];
if (!buildId) {
  console.error('Usage: node fetch-eas-log.mjs <buildId>');
  process.exit(1);
}

const r = spawnSync(
  'npx',
  ['eas-cli', 'build:view', buildId, '--json'],
  { encoding: 'buffer', env: { ...process.env, EAS_NO_VCS: '1' }, shell: true },
);

const stdout = r.stdout?.toString('utf8') || '';
const stderr = r.stderr?.toString('utf8') || '';
const combined = stdout + '\n' + stderr;
const start = combined.indexOf('{');
if (start < 0) {
  console.error('No JSON in eas output');
  console.error(combined.slice(0, 500));
  process.exit(1);
}

function extractObject(str, i) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let k = i; k < str.length; k++) {
    const c = str[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return str.slice(i, k + 1);
    }
  }
  return null;
}

const jsonText = extractObject(combined, start);
const build = JSON.parse(jsonText);
const url = build.logFiles?.[0];
if (!url) {
  console.error('No logFiles on build', build.status, build.error);
  process.exit(1);
}

const buf = await new Promise((resolve, reject) => {
  https
    .get(url, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    })
    .on('error', reject);
});

const outBin = path.join(os.tmpdir(), 'eas-raw.bin');
fs.writeFileSync(outBin, buf);
console.log('magic', buf.slice(0, 8).toString('hex'), 'bytes', buf.length);

const decoders = [
  ['gunzip', () => zlib.gunzipSync(buf)],
  ['brotli', () => zlib.brotliDecompressSync(buf)],
  ['inflate', () => zlib.inflateSync(buf)],
  ['inflateRaw', () => zlib.inflateRawSync(buf)],
  ['utf8', () => buf],
];

let text = null;
for (const [name, fn] of decoders) {
  try {
    text = fn().toString('utf8');
    console.log('decoded with', name);
    break;
  } catch (e) {
    console.log('fail', name, e.message);
  }
}

if (!text) process.exit(1);
const outTxt = path.join(os.tmpdir(), 'eas-decoded.txt');
fs.writeFileSync(outTxt, text, 'utf8');

const keys =
  /FAILURE:|What went wrong|BUILD FAILED|Execution failed|FAILED|error:|Error:|Could not|Caused by|A problem occurred|expo-live|Duplicate|Manifest|Unresolved|e: file|Gradle/i;
const hits = text.split(/\r?\n/).filter((l) => keys.test(l));
console.log('---HITS---');
console.log(hits.slice(-150).join('\n') || 'NO_HITS');
if (!hits.length) {
  console.log('---TAIL---');
  console.log(text.slice(-4000));
}

/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const srcPath = path.join(__dirname, '..', 'assets', 'images', 'guitar-ref-source.png');
const outDir = path.join(__dirname, '..', 'assets', 'images');

const raw = fs.readFileSync(srcPath);
const isJpeg = raw[0] === 0xff && raw[1] === 0xd8;
const src = isJpeg ? jpeg.decode(raw, { useTArray: true }) : PNG.sync.read(raw);
const { width, height } = src;
const data = src.data;

function lumAt(i) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3] ?? 255;
  if (a < 20) return 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Dark = body. Soundhole is light (background showing through).
const body = new Uint8Array(width * height);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const i = (width * y + x) << 2;
    body[y * width + x] = lumAt(i) < 140 ? 1 : 0;
  }
}

// Keep only the largest connected component (removes watermark bits)
const visited = new Uint8Array(width * height);
let best = [];
let bestSize = 0;

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const start = y * width + x;
    if (!body[start] || visited[start]) continue;
    const stack = [start];
    const comp = [];
    visited[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      comp.push(p);
      const px = p % width;
      const py = (p / width) | 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (!body[ni] || visited[ni]) continue;
          visited[ni] = 1;
          stack.push(ni);
        }
      }
    }
    if (comp.length > bestSize) {
      bestSize = comp.length;
      best = comp;
    }
  }
}

body.fill(0);
for (const p of best) body[p] = 1;

let minX = width;
let minY = height;
let maxX = 0;
let maxY = 0;
for (const p of best) {
  const x = p % width;
  const y = (p / width) | 0;
  if (x < minX) minX = x;
  if (y < minY) minY = y;
  if (x > maxX) maxX = x;
  if (y > maxY) maxY = y;
}

const pad = Math.round(Math.max(width, height) * 0.04);
minX = Math.max(0, minX - pad);
minY = Math.max(0, minY - pad);
maxX = Math.min(width - 1, maxX + pad);
maxY = Math.min(height - 1, maxY + pad);

const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;
const outW = 500;
const outH = Math.round(outW * (cropH / cropW));

function sampleBody(ox, oy) {
  const sx = minX + (ox / outW) * cropW;
  const sy = minY + (oy / outH) * cropH;
  const x = Math.min(width - 1, Math.max(0, Math.floor(sx)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(sy)));
  return body[y * width + x] === 1;
}

const mask = new PNG({ width: outW, height: outH, colorType: 6 });
const outline = new PNG({ width: outW, height: outH, colorType: 6 });
const filled = new Uint8Array(outW * outH);

for (let y = 0; y < outH; y += 1) {
  for (let x = 0; x < outW; x += 1) {
    filled[y * outW + x] = sampleBody(x + 0.5, y + 0.5) ? 1 : 0;
  }
}

// Fill small interior holes (watermarks), keep only exterior empty
const outside = new Uint8Array(outW * outH);
const q = [0];
outside[0] = 1;
for (let qi = 0; qi < q.length; qi += 1) {
  const p = q[qi];
  const x = p % outW;
  const y = (p / outW) | 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= outW || ny >= outH) continue;
    const ni = ny * outW + nx;
    if (outside[ni] || filled[ni]) continue;
    outside[ni] = 1;
    q.push(ni);
  }
}
for (let i = 0; i < filled.length; i += 1) {
  if (!filled[i] && !outside[i]) filled[i] = 1; // fill enclosed holes
}

// Soundhole cutout — upper bout center (matches reference)
const holeCx = outW * 0.5;
const holeCy = outH * 0.38;
const holeR = outW * 0.095;
for (let y = 0; y < outH; y += 1) {
  for (let x = 0; x < outW; x += 1) {
    if (Math.hypot(x + 0.5 - holeCx, y + 0.5 - holeCy) < holeR) {
      filled[y * outW + x] = 0;
    }
    const on = filled[y * outW + x] === 1;
    const idx = (outW * y + x) << 2;
    mask.data[idx] = 255;
    mask.data[idx + 1] = 255;
    mask.data[idx + 2] = 255;
    mask.data[idx + 3] = on ? 255 : 0;
  }
}

function neighborOff(x, y) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= outW || ny >= outH) return true;
      if (!filled[ny * outW + nx]) return true;
    }
  }
  return false;
}

const edgeDist = new Float32Array(outW * outH);
edgeDist.fill(1e9);
const queue = [];
for (let y = 0; y < outH; y += 1) {
  for (let x = 0; x < outW; x += 1) {
    if (!filled[y * outW + x]) continue;
    if (!neighborOff(x, y)) continue;
    edgeDist[y * outW + x] = 0;
    queue.push(x, y);
  }
}

for (let i = 0; i < queue.length; i += 2) {
  const x = queue[i];
  const y = queue[i + 1];
  const d = edgeDist[y * outW + x];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= outW || ny >= outH) continue;
      const step = !dx || !dy ? 1 : 1.414;
      const nd = d + step;
      const ni = ny * outW + nx;
      if (nd < edgeDist[ni] && nd <= 12) {
        edgeDist[ni] = nd;
        queue.push(nx, ny);
      }
    }
  }
}

const stroke1 = 2.4;
const gap = 2.2;
const stroke2 = 2.2;

for (let y = 0; y < outH; y += 1) {
  for (let x = 0; x < outW; x += 1) {
    const idx = (outW * y + x) << 2;
    const d = edgeDist[y * outW + x];
    const on = d <= stroke1 || (d >= stroke1 + gap && d <= stroke1 + gap + stroke2);
    outline.data[idx] = 255;
    outline.data[idx + 1] = 255;
    outline.data[idx + 2] = 255;
    outline.data[idx + 3] = on ? 255 : 0;
  }
}

const maskPath = path.join(outDir, 'guitar-mask-card.png');
const outlinePath = path.join(outDir, 'guitar-outline-card.png');
fs.writeFileSync(maskPath, PNG.sync.write(mask));
fs.writeFileSync(outlinePath, PNG.sync.write(outline));

// Quick stats
let holePixels = 0;
let bodyPixels = 0;
for (let i = 0; i < filled.length; i += 1) {
  if (filled[i]) bodyPixels += 1;
}
// Count empty inside bounding box roughly center
for (let y = Math.floor(outH * 0.25); y < Math.floor(outH * 0.45); y += 1) {
  for (let x = Math.floor(outW * 0.35); x < Math.floor(outW * 0.65); x += 1) {
    if (!filled[y * outW + x]) holePixels += 1;
  }
}
console.log('wrote', maskPath, outW + 'x' + outH, 'body=', bodyPixels, 'centerEmpty~', holePixels);
console.log('wrote', outlinePath);

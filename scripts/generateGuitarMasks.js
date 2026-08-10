/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function sampleCubic(x0, y0, x1, y1, x2, y2, x3, y3, steps = 28) {
  const pts = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    pts.push([cubic(x0, x1, x2, x3, t), cubic(y0, y1, y2, y3, t)]);
  }
  return pts;
}

function parsePath(d) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) || [];
  const points = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  while (i < tokens.length) {
    const cmd = tokens[i];
    i += 1;
    if (cmd === 'M') {
      cx = +tokens[i++];
      cy = +tokens[i++];
      startX = cx;
      startY = cy;
      points.push([cx, cy]);
    } else if (cmd === 'L') {
      cx = +tokens[i++];
      cy = +tokens[i++];
      points.push([cx, cy]);
    } else if (cmd === 'C') {
      const x1 = +tokens[i++];
      const y1 = +tokens[i++];
      const x2 = +tokens[i++];
      const y2 = +tokens[i++];
      const x3 = +tokens[i++];
      const y3 = +tokens[i++];
      points.push(...sampleCubic(cx, cy, x1, y1, x2, y2, x3, y3));
      cx = x3;
      cy = y3;
    } else if (cmd === 'Z' || cmd === 'z') {
      points.push([startX, startY]);
    } else {
      i -= 1;
      i += 1;
    }
  }
  return points;
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distToPolyline(px, py, poly) {
  let min = Infinity;
  for (let i = 0; i < poly.length - 1; i += 1) {
    min = Math.min(min, distToSegment(px, py, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1]));
  }
  return min;
}

function writePng(filePath, width, height, paint) {
  const png = new PNG({ width, height, colorType: 6 });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) << 2;
      const [r, g, b, a] = paint(x, y);
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
  console.log('wrote', filePath);
}

/** Classic acoustic card silhouette — short neck, figure-8 body. viewBox 0 0 200 270 */
const CARD_GUITAR = [
  'M 100 6',
  'L 90 6',
  'L 90 28',
  'C 90 36 80 44 60 54',
  'C 32 70 16 100 18 132',
  'C 20 154 36 170 54 178',
  'C 34 192 18 222 22 248',
  'C 28 268 60 278 100 280',
  'C 140 278 172 268 178 248',
  'C 182 222 166 192 146 178',
  'C 164 170 180 154 182 132',
  'C 184 100 168 70 140 54',
  'C 120 44 110 36 110 28',
  'L 110 6',
  'Z',
].join(' ');

const FEATURED_V = [
  'M 84 4',
  'L 68 4',
  'L 66 14',
  'L 74 18',
  'L 74 72',
  'C 74 82 66 90 48 98',
  'C 22 112 10 140 12 172',
  'C 14 196 30 212 48 220',
  'C 32 232 14 258 16 298',
  'C 18 342 44 372 84 378',
  'C 124 372 150 342 152 298',
  'C 154 258 136 232 120 220',
  'C 138 212 154 196 156 172',
  'C 158 140 146 112 120 98',
  'C 102 90 94 82 94 72',
  'L 94 18',
  'L 102 14',
  'L 100 4',
  'Z',
].join(' ');

const FEATURED_H = [
  'M 20 84',
  'C 20 48 42 22 78 16',
  'C 108 11 132 20 148 42',
  'C 158 28 174 16 196 14',
  'C 236 10 278 16 312 32',
  'C 342 46 358 64 364 78',
  'L 396 78',
  'L 396 90',
  'L 364 90',
  'C 358 104 342 122 312 136',
  'C 278 152 236 158 196 154',
  'C 174 152 158 140 148 126',
  'C 132 148 108 157 78 152',
  'C 42 146 20 120 20 84',
  'Z',
].join(' ');

function generateBody(name, d, vbW, vbH, outW, outH, opts = {}) {
  const { holeCx, holeCy, holeR, doubleStroke = false } = opts;
  const poly = parsePath(d).map(([x, y]) => [(x / vbW) * outW, (y / vbH) * outH]);
  const hx = holeCx != null ? (holeCx / vbW) * outW : null;
  const hy = holeCy != null ? (holeCy / vbH) * outH : null;
  const hr = holeR != null ? (holeR / vbW) * outW : null;

  const outDir = path.join(__dirname, '..', 'assets', 'images');
  fs.mkdirSync(outDir, { recursive: true });

  const strokeOuter = Math.max(3.2, outW * 0.014);
  const strokeInnerGap = strokeOuter * 0.55;
  const strokeInner = strokeOuter * 0.55;

  writePng(path.join(outDir, `guitar-mask-${name}.png`), outW, outH, (x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    const inBody = pointInPoly(px, py, poly);
    const inHole = hx != null && Math.hypot(px - hx, py - hy) < hr;
    if (inBody && !inHole) return [255, 255, 255, 255];
    return [0, 0, 0, 0];
  });

  writePng(path.join(outDir, `guitar-outline-${name}.png`), outW, outH, (x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    const distBody = distToPolyline(px, py, poly);
    const distHole = hx != null ? Math.abs(Math.hypot(px - hx, py - hy) - hr) : Infinity;

    if (doubleStroke) {
      // Outer double ring around body
      const onOuter1 = distBody <= strokeOuter * 0.42;
      const onOuter2 =
        distBody >= strokeOuter * 0.42 + strokeInnerGap
        && distBody <= strokeOuter * 0.42 + strokeInnerGap + strokeInner;
      // Soundhole double ring
      const onHole1 = distHole <= strokeOuter * 0.38;
      const onHole2 =
        distHole >= strokeOuter * 0.38 + strokeInnerGap * 0.85
        && distHole <= strokeOuter * 0.38 + strokeInnerGap * 0.85 + strokeInner;
      if (onOuter1 || onOuter2 || onHole1 || onHole2) return [255, 255, 255, 255];
      return [0, 0, 0, 0];
    }

    if (distBody <= strokeOuter * 0.7 || distHole <= strokeOuter * 0.65) {
      return [255, 255, 255, 255];
    }
    return [0, 0, 0, 0];
  });
}

// Card silhouette matching reference (short neck + soundhole)
generateBody('card', CARD_GUITAR, 200, 280, 500, 700, {
  holeCx: 100,
  holeCy: 118,
  holeR: 28,
  doubleStroke: true,
});

// Featured / legacy
generateBody('v', FEATURED_V, 168, 400, 420, 1000, {
  holeCx: 84,
  holeCy: 250,
  holeR: 22,
  doubleStroke: false,
});
generateBody('h', FEATURED_H, 400, 168, 1000, 420, {
  holeCx: 268,
  holeCy: 84,
  holeR: 26,
  doubleStroke: false,
});

console.log('done');

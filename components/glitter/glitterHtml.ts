/**
 * Glitter Wrap — Originkit
 * Self-contained canvas HTML for Android WebView (checkout success).
 */

export type GlitterConfig = {
  particleCount: number;
  color1: string;
  color2: string;
  color3: string;
  speed: number;
  density: number;
  starSize: number;
  focalDepth: number;
  turbulence: number;
  brightness: number;
  glitterIntensity: number;
  trailAmount: number;
  reverse: boolean;
  background: string;
};

export const GLITTER_DEFAULTS: GlitterConfig = {
  particleCount: 500,
  color1: '#ffffff',
  color2: '#FF0000',
  color3: '#FFE500',
  speed: 5,
  density: 100,
  starSize: 20,
  focalDepth: 13,
  turbulence: 0,
  brightness: 100,
  glitterIntensity: 3,
  trailAmount: 100,
  reverse: false,
  background: '#000000',
};

export function buildGlitterHtml(config: GlitterConfig = GLITTER_DEFAULTS): string {
  const cfg = { ...GLITTER_DEFAULTS, ...config };
  // Inject as JSON so the script never breaks on quotes / special chars.
  const cfgJson = JSON.stringify(cfg);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: ${cfg.background};
  }
  #c {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
(function () {
  var props = ${cfgJson};
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  function parseColor(input) {
    if (!input) return [255, 255, 255, 1];
    var s = String(input).trim();
    if (s.charAt(0) === '#') {
      var hex = s.slice(1);
      if (hex.length === 3) {
        hex = hex.split('').map(function (c) { return c + c; }).join('');
      }
      var num = parseInt(hex, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 1];
    }
    var m = s.match(/rgba?\\(([^)]+)\\)/i);
    if (m) {
      var parts = m[1].split(',').map(function (p) { return parseFloat(p.trim()); });
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts[3] == null ? 1 : parts[3]];
    }
    return [255, 255, 255, 1];
  }

  var size = { w: 0, h: 0, dpr: 1 };
  var stars = [];
  var elapsed = 0;
  var lastT = performance.now();
  var rafId = null;

  var colorCache = {
    color1: '', color2: '', color3: '',
    parsed1: [255, 255, 255, 1],
    parsed2: [177, 158, 239, 1],
    parsed3: [205, 217, 255, 1],
  };

  function getCachedColors() {
    if (props.color1 !== colorCache.color1) {
      colorCache.color1 = props.color1;
      colorCache.parsed1 = parseColor(props.color1);
    }
    if (props.color2 !== colorCache.color2) {
      colorCache.color2 = props.color2;
      colorCache.parsed2 = parseColor(props.color2);
    }
    if (props.color3 !== colorCache.color3) {
      colorCache.color3 = props.color3;
      colorCache.parsed3 = parseColor(props.color3);
    }
    return colorCache;
  }

  function cfg() {
    return {
      reverse: !!props.reverse,
      density: props.density,
      stepZ: props.speed * 0.0008,
      focalDepth: props.focalDepth / 100,
      starScale: props.starSize * 0.15,
      turbulence: props.turbulence * 0.2,
      glitter: props.glitterIntensity * 0.1,
      brightness: Math.min(1, props.brightness / 100),
      trail: props.trailAmount / 100,
    };
  }

  function makeStar() {
    return {
      x: 0, y: 0, z: 0, px: NaN, py: NaN,
      seed: 0, vmul: 1, colorIdx: 0, flashUntil: 0, nextFlash: 0,
    };
  }

  function resetStar(s, initial) {
    var c = cfg();
    var angle = Math.random() * Math.PI * 2;
    var radius = (0.2 + Math.random() * 0.8) * (c.density / 15);
    s.x = Math.cos(angle) * radius;
    s.y = Math.sin(angle) * radius;
    if (c.reverse) {
      s.z = initial ? c.focalDepth + Math.random() * (1 - c.focalDepth) : c.focalDepth;
    } else {
      s.z = initial ? Math.random() : 1.0;
    }
    s.px = NaN;
    s.py = NaN;
    s.seed = Math.random() * 1000;
    s.vmul = 0.6 + Math.random() * 0.8;
    s.colorIdx = Math.floor(Math.random() * 3);
    s.flashUntil = 0;
    s.nextFlash = elapsed + 1 + Math.random() * 4 * (1 / Math.max(0.0001, c.glitter));
  }

  function syncCount() {
    var count = Math.max(1, Math.floor(props.particleCount));
    if (stars.length === count) return;
    if (stars.length > count) {
      stars.length = count;
    } else {
      while (stars.length < count) {
        var s = makeStar();
        resetStar(s, true);
        stars.push(s);
      }
    }
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.floor(window.innerWidth) || 600);
    var h = Math.max(1, Math.floor(window.innerHeight) || 400);
    if (size.w === w && size.h === h && size.dpr === dpr) return;
    size = { w: w, h: h, dpr: dpr };
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
  }

  function drawFrame(deltaSec) {
    var c = cfg();
    syncCount();
    var colors = getCachedColors();
    var palette = [colors.parsed1, colors.parsed2, colors.parsed3];
    var rgbStrs = [
      'rgb(' + palette[0][0] + ', ' + palette[0][1] + ', ' + palette[0][2] + ')',
      'rgb(' + palette[1][0] + ', ' + palette[1][1] + ', ' + palette[1][2] + ')',
      'rgb(' + palette[2][0] + ', ' + palette[2][1] + ', ' + palette[2][2] + ')',
    ];

    var w = size.w;
    var h = size.h;
    var cx = w / 2;
    var cy = h / 2;
    var projScale = Math.min(w, h) * 0.9;
    var dt = Math.max(0.001, Math.min(0.1, deltaSec)) * 60;

    var keep = Math.pow(Math.min(0.98, Math.max(0, c.trail)), dt);
    var trailAlpha = Math.max(0.02, 1 - keep);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, ' + trailAlpha + ')';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var vz = c.stepZ * s.vmul * dt;
      if (c.reverse) {
        s.z += vz;
        if (s.z >= 1.0) { resetStar(s, false); continue; }
      } else {
        s.z -= vz;
        if (s.z <= c.focalDepth) { resetStar(s, false); continue; }
      }

      var tx = s.x;
      var ty = s.y;
      if (c.turbulence > 0) {
        var t = elapsed * 1.2 + s.seed;
        var amp = c.turbulence * (1 - s.z) * 0.25;
        tx += Math.sin(t + s.seed) * amp;
        ty += Math.cos(t * 1.13 + s.seed * 0.7) * amp;
      }

      var persp = c.focalDepth / Math.max(s.z, 0.0001);
      var sx = cx + tx * persp * projScale;
      var sy = cy + ty * persp * projScale;

      if (!c.reverse && (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20)) {
        resetStar(s, false);
        continue;
      }

      var flashMult = 1;
      if (c.glitter > 0) {
        if (elapsed >= s.nextFlash && s.flashUntil < elapsed) {
          s.flashUntil = elapsed + 0.04 + Math.random() * 0.07;
          s.nextFlash = elapsed + 1 + Math.random() * 4 * (1 / Math.max(0.0001, c.glitter));
        }
        if (elapsed <= s.flashUntil) flashMult = 1 + 2.5 * c.glitter;
      }

      var sizePersp = Math.min(2.5, (c.focalDepth / Math.max(s.z, 0.0001)) * 0.6);
      var baseR = Math.max(0.25, c.starScale * (0.4 + sizePersp));
      var maxR = 1 + c.starScale * 2.5;
      var r = Math.min(baseR * flashMult, maxR);

      var lifeT = c.reverse ? s.z : 1 - s.z;
      var fadeIn = c.reverse
        ? Math.min(1, (s.z - c.focalDepth) / (1 - c.focalDepth) / 0.12)
        : 1;
      var a =
        Math.min(1, c.reverse ? 0.85 - lifeT * 0.6 : lifeT * 0.9 + 0.05) *
        fadeIn *
        c.brightness *
        (flashMult > 1 ? 1 : 0.85);

      var colStr = rgbStrs[s.colorIdx];

      if (!Number.isNaN(s.px) && !Number.isNaN(s.py)) {
        ctx.globalAlpha = a * 0.5;
        ctx.strokeStyle = colStr;
        ctx.lineWidth = Math.max(0.4, r * 0.4);
        ctx.beginPath();
        ctx.moveTo(s.px, s.py);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }

      ctx.globalAlpha = a;
      ctx.fillStyle = colStr;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);

      if (flashMult > 1) {
        var rf = Math.min(r * 1.4, maxR * 1.4);
        ctx.globalAlpha = a * 0.5;
        ctx.fillRect(sx - rf, sy - rf, rf * 2, rf * 2);
      }

      s.px = sx;
      s.py = sy;
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    elapsed += Math.min(0.1, Math.max(0, deltaSec));
  }

  function loop(t) {
    var deltaSec = (t - lastT) / 1000;
    lastT = t;
    drawFrame(deltaSec);
    rafId = requestAnimationFrame(loop);
  }

  syncCount();
  resize();
  window.addEventListener('resize', resize);
  rafId = requestAnimationFrame(loop);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = null;
    } else {
      lastT = performance.now();
      if (rafId == null) rafId = requestAnimationFrame(loop);
    }
  });
})();
</script>
</body>
</html>`;
}

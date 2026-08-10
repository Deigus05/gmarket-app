'use dom';

import * as React from 'react';
import type { CSSProperties } from 'react';
import type { DOMProps } from 'expo/dom';

import {
  createVortex,
  PX_PER_WORLD_UNITS,
  LINE_GLOW_SCALE,
  DOT_GLOW_SCALE,
  COMET_SPEED_SCALE,
  COMET_GLOW_SCALE,
  DOT_SIZE_DIVISOR,
  type VortexConfig,
} from './vortexEngine';

/**
 * Originkit Tornado (variant-2) — Expo DOM wrapper around createVortex.
 */

const DEFAULTS = {
  background: '#000000',
  topRadius: 380,
  waistRadius: 53,
  waistPosition: 50,
  bottomRadius: 1150,
  twist: 3,
  zoom: 75,
  speed: 10,
  direction: 'right' as 'right' | 'left',
  lineOptions: {
    count: 240,
    color: '#ffffff',
    glow: 10,
  },
  dots: true,
  dotOptions: {
    count: 8000,
    size: 20,
    color: '#ffffff',
    glow: 10,
    flicker: 10,
  },
  comets: true,
  cometOptions: {
    count: 10,
    speed: 6,
    color: '#F9731A',
    glow: 6,
    tail: 19,
    delay: 8,
    collide: 6,
  },
  repel: false,
  repelOptions: {
    radius: 60,
    strength: 10,
  },
};

/** Preset baked by Originkit `variant-2`. */
const PRESET = {
  background: '#000000',
  topRadius: 230,
  waistRadius: 25,
  waistPosition: 48,
  bottomRadius: 700,
  twist: 2,
  zoom: 75,
  speed: 10,
  direction: 'right' as const,
  comets: true,
};

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

type VortexProps = {
  background?: string;
  topRadius?: number;
  waistRadius?: number;
  waistPosition?: number;
  bottomRadius?: number;
  twist?: number;
  zoom?: number;
  speed?: number;
  direction?: 'right' | 'left';
  lineOptions?: Partial<typeof DEFAULTS.lineOptions>;
  dots?: boolean;
  dotOptions?: Partial<typeof DEFAULTS.dotOptions>;
  comets?: boolean;
  cometOptions?: Partial<typeof DEFAULTS.cometOptions>;
  repel?: boolean;
  repelOptions?: Partial<typeof DEFAULTS.repelOptions>;
  /** Animate orange heat rising from bottom → top (magic suck). */
  heatShift?: boolean;
  heatDurationMs?: number;
  heatColor?: string;
  heatCoreColor?: string;
  style?: CSSProperties;
  dom?: DOMProps;
};

/** Fiery orange from the reference — outer filaments + hot core. */
const HEAT_COLOR = '#FF3B10';
const HEAT_CORE = '#FFC14D';

function buildConfig(props: Required<
  Pick<
    VortexProps,
    | 'topRadius'
    | 'waistRadius'
    | 'waistPosition'
    | 'bottomRadius'
    | 'twist'
    | 'zoom'
    | 'speed'
    | 'direction'
    | 'dots'
    | 'comets'
    | 'repel'
  >
> & {
  lineOptions: typeof DEFAULTS.lineOptions;
  dotOptions: typeof DEFAULTS.dotOptions;
  cometOptions: typeof DEFAULTS.cometOptions;
  repelOptions: typeof DEFAULTS.repelOptions;
  running: boolean;
  heatProgress: number;
  heatColor: string;
  heatCoreColor: string;
}): VortexConfig {
  const line = props.lineOptions;
  const dot = props.dotOptions;
  const comet = props.cometOptions;
  const shove = props.repelOptions;

  return {
    floorRadius: props.bottomRadius / PX_PER_WORLD_UNITS,
    waistRadius: props.waistRadius / PX_PER_WORLD_UNITS,
    crownRadius: props.topRadius / PX_PER_WORLD_UNITS,
    waistAt: 1 - props.waistPosition / 100,
    twist: props.twist,
    zoom: props.zoom,
    flowDir: props.direction === 'left' ? -1 : 1,
    flowSpeed: (props.speed / 100) * (props.direction === 'left' ? -1 : 1),
    lineCount: line.count,
    lineColor: line.color,
    lineGlow: (line.glow / 10) * LINE_GLOW_SCALE,
    showDots: props.dots,
    dotCount: dot.count,
    dotSize: dot.size / DOT_SIZE_DIVISOR,
    dotColor: dot.color,
    dotGlow: (dot.glow / 10) * DOT_GLOW_SCALE,
    dotFlicker: dot.flicker / 10,
    showComets: props.comets,
    cometCount: comet.count,
    cometSpeed: (comet.speed / 10) * COMET_SPEED_SCALE,
    cometColor: comet.color,
    cometGlow: (comet.glow / 10) * COMET_GLOW_SCALE,
    cometTail: comet.tail,
    cometDelay: comet.delay,
    collideForce: comet.collide / 10,
    hoverRepel: props.repel,
    repelRadius: shove.radius,
    repelStrength: shove.strength,
    running: props.running,
    heatProgress: props.heatProgress,
    heatColor: props.heatColor,
    heatCoreColor: props.heatCoreColor,
  };
}

function VortexScene(props: VortexProps) {
  const merged = { ...DEFAULTS, ...PRESET, ...props };
  const {
    background = DEFAULTS.background,
    topRadius = DEFAULTS.topRadius,
    waistRadius = DEFAULTS.waistRadius,
    waistPosition = DEFAULTS.waistPosition,
    bottomRadius = DEFAULTS.bottomRadius,
    twist = DEFAULTS.twist,
    zoom = DEFAULTS.zoom,
    speed = DEFAULTS.speed,
    direction = DEFAULTS.direction,
    lineOptions,
    dots = DEFAULTS.dots,
    dotOptions,
    comets = DEFAULTS.comets,
    cometOptions,
    repel = DEFAULTS.repel,
    repelOptions,
    heatShift = false,
    heatDurationMs = 10_000,
    heatColor = HEAT_COLOR,
    heatCoreColor = HEAT_CORE,
    style,
  } = merged;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const heatProgressRef = React.useRef(0);
  const reducedMotion = useReducedMotion();
  const running = !reducedMotion;

  const line = { ...DEFAULTS.lineOptions, ...lineOptions };
  const dot = { ...DEFAULTS.dotOptions, ...dotOptions };
  const comet = { ...DEFAULTS.cometOptions, ...cometOptions };
  const shove = { ...DEFAULTS.repelOptions, ...repelOptions };

  const config = buildConfig({
    topRadius,
    waistRadius,
    waistPosition,
    bottomRadius,
    twist,
    zoom,
    speed,
    direction,
    dots,
    comets,
    repel,
    lineOptions: line,
    dotOptions: dot,
    cometOptions: comet,
    repelOptions: shove,
    running,
    heatProgress: heatProgressRef.current,
    heatColor,
    heatCoreColor,
  });

  const buildKey = JSON.stringify([
    config.floorRadius,
    config.waistRadius,
    config.crownRadius,
    config.waistAt,
    config.twist,
    config.lineCount,
    config.showDots,
    config.dotCount,
    config.showComets,
    config.cometCount,
    config.cometTail,
  ]);

  const configRef = React.useRef(config);
  configRef.current = {
    ...config,
    heatProgress: heatProgressRef.current,
    heatColor,
    heatCoreColor,
  };
  const apiRef = React.useRef<ReturnType<typeof createVortex> | null>(null);

  React.useEffect(() => {
    if (!heatShift) {
      heatProgressRef.current = 0;
      if (configRef.current) configRef.current.heatProgress = 0;
      return;
    }
    // Rise past 1 so the crown fully turns orange.
    const target = 1.2;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / Math.max(heatDurationMs, 1));
      // Ease-in so the base ignites first, then climbs.
      const eased = t * t * (3 - 2 * t);
      heatProgressRef.current = eased * target;
      configRef.current.heatProgress = heatProgressRef.current;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [heatShift, heatDurationMs]);

  React.useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const prev = {
      htmlH: html.style.height,
      htmlM: html.style.margin,
      bodyH: body.style.height,
      bodyM: body.style.margin,
      bodyO: body.style.overflow,
      bodyB: body.style.background,
      rootH: root?.style.height,
      rootW: root?.style.width,
      rootM: root?.style.margin,
      rootB: root?.style.background,
    };
    html.style.height = '100%';
    html.style.margin = '0';
    body.style.height = '100%';
    body.style.margin = '0';
    body.style.overflow = 'hidden';
    body.style.background = background;
    if (root) {
      root.style.height = '100%';
      root.style.width = '100%';
      root.style.margin = '0';
      root.style.background = background;
    }
    return () => {
      html.style.height = prev.htmlH;
      html.style.margin = prev.htmlM;
      body.style.height = prev.bodyH;
      body.style.margin = prev.bodyM;
      body.style.overflow = prev.bodyO;
      body.style.background = prev.bodyB;
      if (root) {
        root.style.height = prev.rootH ?? '';
        root.style.width = prev.rootW ?? '';
        root.style.margin = prev.rootM ?? '';
        root.style.background = prev.rootB ?? '';
      }
    };
  }, [background]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    try {
      apiRef.current = createVortex(canvas, container, configRef);
    } catch (err) {
      console.warn('[TornadoVortex] init failed:', err);
      return;
    }
    return () => {
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, []);

  const built = React.useRef(false);
  React.useEffect(() => {
    if (!built.current) {
      built.current = true;
      return;
    }
    apiRef.current?.rebuild();
  }, [buildKey]);

  return (
    <div
      ref={containerRef}
      style={{
        ...style,
        position: 'relative',
        width: '100%',
        height: '100%',
        background,
        overflow: 'hidden',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}

export default function TornadoVortex(props: VortexProps) {
  return <VortexScene {...PRESET} {...props} />;
}

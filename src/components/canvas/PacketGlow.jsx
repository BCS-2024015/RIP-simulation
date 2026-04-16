/**
 * PacketGlow.jsx
 *
 * RIPv2 Ping Simulation — animated packet that follows the exact Bellman-Ford
 * computed path between two routers.
 *
 * Architecture
 * ──────────────
 *  • Floating glassmorphism control panel anchored to the bottom-centre of the
 *    canvas. Allows selecting a source and destination node and firing a ping.
 *  • On trigger:
 *      1. Calls getPathBetween() to obtain the full hop list, e.g. ['R1','R2','R3'].
 *      2. Converts each hop to canvas-absolute centre coordinates.
 *      3. Runs a requestAnimationFrame loop that advances a progress value across
 *         each segment using cubic ease-in-out interpolation.
 *      4. Renders the main glowing orb + a fading comet-trail at prior positions.
 *  • All packet divs are position:absolute (relative to the canvas container,
 *    which has position:relative and covers the full viewport).
 *
 * Props:
 *  @prop {React.RefObject} canvasRef - ref to the NetworkCanvas div, used to
 *        convert node-relative positions to canvas-absolute coordinates.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useTopologyState } from '../../context/TopologyContext';
import { useRouting, getPathBetween } from '../../hooks/useRouting';
import { useTheme } from '../../context/ThemeContext';
import { ROUTER_NODE_SIZE } from './RouterNode';

// Half-size offset so packets travel between node visual centres
const HALF = ROUTER_NODE_SIZE / 2;

// ms per hop segment — tune for feel
const SEGMENT_MS = 680;

// Max trail length
const TRAIL_MAX = 8;

// ── Easing ───────────────────────────────────────────────────────────────────

/** Cubic ease-in-out */
function easeInOut(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Packet visual ─────────────────────────────────────────────────────────────

/**
 * GlowOrb — the animated packet.
 * Accepts `pos`  : { x, y } absolute canvas coords (node centre).
 * Accepts `trail`: [{ x, y, op }] fading trail behind the orb.
 */
function GlowOrb({ pos, trail }) {
  if (!pos) return null;

  return (
    <>
      {/* ── Comet trail ─────────────────────────────────────── */}
      {trail.slice(1).map((pt, i) => {
        const size = Math.max(4, 10 - i * 1.2);
        return (
          <div
            key={i}
            aria-hidden="true"
            style={{
              position:      'absolute',
              left:           pt.x,
              top:            pt.y,
              width:          size,
              height:         size,
              transform:     'translate(-50%, -50%)',
              borderRadius:  '50%',
              background:    `rgba(6,182,212,${pt.op * 0.50})`,
              boxShadow:     `0 0 ${6 * pt.op}px rgba(6,182,212,${pt.op * 0.80})`,
              pointerEvents: 'none',
              zIndex:         48,
            }}
          />
        );
      })}

      {/* ── Outer aura ──────────────────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position:      'absolute',
          left:           pos.x,
          top:            pos.y,
          width:          36,
          height:         36,
          transform:     'translate(-50%, -50%)',
          borderRadius:  '50%',
          background:    'rgba(6,182,212,0.10)',
          boxShadow:     '0 0 20px 8px rgba(6,182,212,0.18)',
          filter:        'blur(3px)',
          pointerEvents: 'none',
          zIndex:         49,
        }}
      />

      {/* ── Middle ring ─────────────────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position:      'absolute',
          left:           pos.x,
          top:            pos.y,
          width:          18,
          height:         18,
          transform:     'translate(-50%, -50%)',
          borderRadius:  '50%',
          border:        '1.5px solid rgba(6,182,212,0.75)',
          boxShadow:     '0 0 8px rgba(6,182,212,0.55)',
          pointerEvents: 'none',
          zIndex:         49,
        }}
      />

      {/* ── Core orb ────────────────────────────────────────── */}
      <div
        className="packet-orb"
        aria-hidden="true"
        style={{
          position:      'absolute',
          left:           pos.x,
          top:            pos.y,
          width:          11,
          height:         11,
          transform:     'translate(-50%, -50%)',
          borderRadius:  '50%',
          background:    '#06b6d4',
          pointerEvents: 'none',
          zIndex:         50,
        }}
      />
    </>
  );
}

// ── Path badge (route preview) ────────────────────────────────────────────────

function PathBadge({ path, status }) {
  if (status === 'no-route') {
    return (
      <span className="flex items-center gap-1.5 text-red-400 font-mono-jet text-[11px] font-bold">
        <span aria-hidden="true">✗</span>
        No route to host
      </span>
    );
  }

  if (status === 'success') {
    return (
      <span className="flex items-center gap-1.5 text-emerald-400 font-mono-jet text-[11px] font-bold">
        <span aria-hidden="true">✓</span>
        Delivered · {path.length - 1} hop{path.length !== 2 ? 's' : ''}
      </span>
    );
  }

  if (path.length < 2) {
    return (
      <span className="text-slate-600 font-mono-jet text-[11px]">
        Select nodes to preview path
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 font-mono-jet text-[11px] text-slate-400 flex-wrap">
      {path.map((hop, i) => (
        <React.Fragment key={hop}>
          <span className={i === 0 || i === path.length - 1 ? 'text-cyan-300 font-bold' : 'text-slate-300'}>
            {hop}
          </span>
          {i < path.length - 1 && (
            <span className="text-cyan-700" aria-hidden="true">→</span>
          )}
        </React.Fragment>
      ))}
      <span className="ml-1 text-slate-600">({path.length - 1} hop{path.length !== 2 ? 's' : ''})</span>
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * PacketGlow
 * Rendered inside NetworkCanvas so absolute positions align with the canvas.
 */
function PacketGlow({ canvasRef }) {
  const { nodes }          = useTopologyState();
  const { routingTables }  = useRouting();
  const { isDarkMode }     = useTheme();
  const dark               = isDarkMode;

  const [fromId, setFromId] = useState('');
  const [toId,   setToId]   = useState('');

  // 'idle' | 'animating' | 'success' | 'no-route'
  const [status, setStatus] = useState('idle');

  // Packet rendering state: { pos: {x,y}, trail: [{x,y,op}] } | null
  const [packet, setPacket] = useState(null);

  const rafRef   = useRef(null);
  const animRef  = useRef(null); // { waypoints, startTime, totalDuration }
  const trailRef = useRef([]);

  // ── Live path preview ──────────────────────────────────────────────────

  const previewPath = useMemo(() => {
    if (!fromId || !toId || fromId === toId) return [];
    return getPathBetween(routingTables, fromId, toId);
  }, [fromId, toId, routingTables]);

  // ── Convert node ID → canvas-centre { x, y } ──────────────────────────

  const getCentre = useCallback(
    (nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return null;

      // All positions are already canvas-relative since nodes have absolute
      // placement inside the canvas div. We just add the half-size offset.
      return { x: node.x + HALF, y: node.y + HALF };
    },
    [nodes]
  );

  // ── Stop / cleanup ─────────────────────────────────────────────────────

  const stopAnim = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current  = null;
    animRef.current = null;
    trailRef.current = [];
    setPacket(null);
  }, []);

  useEffect(() => () => stopAnim(), [stopAnim]);

  // ── Trigger ping ────────────────────────────────────────────────────────

  const handlePing = useCallback(() => {
    if (status === 'animating') {
      stopAnim();
      setStatus('idle');
      return;
    }

    if (!fromId || !toId || fromId === toId) return;

    const path = getPathBetween(routingTables, fromId, toId);

    if (path.length < 2) {
      setStatus('no-route');
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }

    const waypoints = path.map(getCentre).filter(Boolean);
    if (waypoints.length < 2) return;

    const totalDuration = SEGMENT_MS * (waypoints.length - 1);
    const startTime     = performance.now();

    animRef.current  = { waypoints, startTime, totalDuration };
    trailRef.current = [];
    setStatus('animating');

    function tick(now) {
      const data = animRef.current;
      if (!data) return;

      const elapsed     = now - data.startTime;
      const totalSegs   = data.waypoints.length - 1;

      // Animation complete
      if (elapsed >= data.totalDuration) {
        const last = data.waypoints[data.waypoints.length - 1];
        setPacket({ pos: last, trail: [] });
        setTimeout(() => {
          setPacket(null);
          trailRef.current = [];
          setStatus('success');
          setTimeout(() => setStatus('idle'), 3000);
        }, 150);
        animRef.current = null;
        return;
      }

      const overallT  = elapsed / data.totalDuration;
      const segFloat  = overallT * totalSegs;
      const segIdx    = Math.min(Math.floor(segFloat), totalSegs - 1);
      const segT      = segFloat - segIdx;
      const t         = easeInOut(segT);

      const p0 = data.waypoints[segIdx];
      const p1 = data.waypoints[segIdx + 1];

      const x = p0.x + (p1.x - p0.x) * t;
      const y = p0.y + (p1.y - p0.y) * t;

      // Build trail — newest first, fade each existing entry
      trailRef.current = [
        { x, y, op: 1 },
        ...trailRef.current
          .slice(0, TRAIL_MAX - 1)
          .map((pt) => ({ ...pt, op: pt.op * 0.62 })),
      ].filter((pt) => pt.op > 0.02);

      setPacket({ pos: { x, y }, trail: trailRef.current.slice() });
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [fromId, toId, status, routingTables, getCentre, stopAnim]);

  // ── Derived UI state ───────────────────────────────────────────────────

  const canPing = fromId && toId && fromId !== toId && nodes.length >= 2;
  const isAnimating = status === 'animating';

  const pingBtnLabel = isAnimating ? 'Cancel' : '⚡ Ping';
  const pingBtnClass = isAnimating
    ? dark ? 'bg-red-950/60 border-red-700/50 text-red-400 hover:bg-red-900/50 hover:border-red-600/70' : 'bg-red-50 border-red-300 text-red-600 hover:bg-red-100'
    : canPing
    ? dark
      ? 'bg-cyan-950/60 border-cyan-600/50 text-cyan-300 hover:bg-cyan-900/40 hover:border-cyan-400/80 hover:shadow-[0_0_12px_rgba(6,182,212,0.35)]'
      : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-400 hover:shadow-md hover:shadow-indigo-500/20'
    : dark
      ? 'bg-slate-900/40 border-slate-700/30 text-slate-600 cursor-not-allowed'
      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed';

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Animated packet ────────────────────────────────────── */}
      <GlowOrb pos={packet?.pos} trail={packet?.trail ?? []} />

      {/* ── Ping control panel ─────────────────────────────────── */}
      <div
        id="ping-panel"
        style={{
          position:  'absolute',
          bottom:     24,
          left:      '50%',
          transform: 'translateX(-50%)',
          zIndex:     40,
        }}
        aria-label="Ping simulation panel"
      >
        <div
          className={`
            ping-panel-shimmer relative overflow-hidden
            flex flex-col gap-2
            px-5 py-3.5 rounded-2xl border
            transition-all duration-300
            ${dark ? 'shadow-2xl shadow-black/60' : 'shadow-xl shadow-slate-200/60'}
          `}
          style={{
            minWidth: 420,
            background: dark ? 'rgba(2,6,23,0.85)' : 'rgba(255,255,255,0.88)',
            borderColor: dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
            backdropFilter: 'blur(24px)',
          }}
        >
          {/* ── Header ──────────────────────────────────────────── */}
          <div className="flex items-center gap-2 mb-0.5">
            <span aria-hidden="true" className="text-cyan-500 text-base">📡</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Ping Simulation
            </span>
            {isAnimating && (
              <span className="ml-auto flex items-center gap-1.5 text-[9px] font-bold text-cyan-400 uppercase tracking-widest" aria-live="polite">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                In Transit
              </span>
            )}
          </div>

          {/* ── Row: selectors + ping button ────────────────────── */}
          <div className="flex items-center gap-3">
            {/* From */}
            <div className="flex flex-col gap-1 flex-1">
              <label htmlFor="ping-from" className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
                Source
              </label>
              <select
                id="ping-from"
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className={`${dark ? 'dark-select' : 'light-select'} w-full`}
                disabled={isAnimating}
                aria-label="Ping source router"
              >
                <option value="">— node —</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id} disabled={n.id === toId}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center mt-4 gap-0.5">
              <svg width="28" height="12" viewBox="0 0 28 12" fill="none" aria-hidden="true">
                <line x1="2" y1="6" x2="24" y2="6"
                  stroke={isAnimating ? '#06b6d4' : '#334155'} strokeWidth="1.5"
                  strokeDasharray={isAnimating ? '4 2' : undefined}
                  style={{ transition: 'stroke 0.3s' }}
                />
                <polyline points="18,2 24,6 18,10"
                  stroke={isAnimating ? '#06b6d4' : '#334155'} strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ transition: 'stroke 0.3s' }}
                />
              </svg>
            </div>

            {/* To */}
            <div className="flex flex-col gap-1 flex-1">
              <label htmlFor="ping-to" className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
                Destination
              </label>
              <select
                id="ping-to"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className={`${dark ? 'dark-select' : 'light-select'} w-full`}
                disabled={isAnimating}
                aria-label="Ping destination router"
              >
                <option value="">— node —</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id} disabled={n.id === fromId}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Ping button */}
            <div className="flex flex-col mt-4">
              <button
                id="btn-ping"
                onClick={handlePing}
                disabled={!isAnimating && !canPing}
                aria-label={pingBtnLabel}
                className={`
                  px-5 py-1.5 rounded-xl border text-[11px] font-bold tracking-wide
                  transition-all duration-200 focus:outline-none focus-visible:ring-2
                  focus-visible:ring-cyan-400 whitespace-nowrap
                  ${pingBtnClass}
                `}
              >
                {pingBtnLabel}
              </button>
            </div>
          </div>

          {/* ── Path preview / status ────────────────────────────── */}
          <div
            className="mt-0.5 min-h-[20px] flex items-center"
            aria-live="polite"
            aria-atomic="true"
          >
            <PathBadge path={previewPath} status={status} />
          </div>
        </div>
      </div>
    </>
  );
}

export default PacketGlow;

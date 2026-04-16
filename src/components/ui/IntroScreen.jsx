/**
 * IntroScreen.jsx
 *
 * Boot-up intro overlay for AetherNet Simulator.
 *
 * Phase 1 — "idle":
 *   An HTML5 canvas renders a slowly rotating 3-D sphere made of ~380 particles,
 *   distributed evenly via the Fibonacci golden-spiral method.
 *   Each dot is sized and alpha-tinted by its Z depth (painter's algorithm).
 *
 * Phase 2 — "dispersing" (on click):
 *   Snapshot the current 2-D position of every particle.
 *   Assign an outward velocity proportional to cubic ease-in.
 *   Dots fly toward the edges and fade out.
 *   Simultaneously: background fades white → black.
 *   After DUR ms + small buffer → call onInitialize() to reveal the app.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

// ── Config ────────────────────────────────────────────────────────────────────

const N   = 380;   // particle count
const ROT = 0.004; // rotation speed (radians / frame)
const DUR = 900;   // dispersion duration in ms
const DSC = 130;   // dispersion scale — max px displacement

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fibonacci / golden-angle sphere distribution.
 * Produces near-uniform coverage without clustering.
 */
function buildSphere(n, r) {
  const φ = (1 + Math.sqrt(5)) / 2; // golden ratio
  return Array.from({ length: n }, (_, i) => {
    const θ  = (2 * Math.PI * i) / φ;
    const φi = Math.acos(1 - (2 * (i + 0.5)) / n);
    return {
      ox: r * Math.sin(φi) * Math.cos(θ),
      oy: r * Math.cos(φi),
      oz: r * Math.sin(φi) * Math.sin(θ),
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IntroScreen({ onInitialize }) {
  const canvasRef = useRef(null);

  // Live animation state — NOT React state (no re-renders in loop)
  const anim = useRef({
    phase:     'idle',  // 'idle' | 'dispersing'
    angle:     0,
    particles: null,    // [{ ox, oy, oz }]
    disp:      null,    // [{ sx, sy, vx, vy }] — set on click
    dispStart: 0,       // rAF timestamp when dispersion began
  });
  const rafRef = useRef(null);

  // Only used to trigger CSS transitions on the React tree
  const [uiPhase, setUiPhase] = useState('idle');

  // ── Canvas loop ────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const A   = anim.current;

    const fit = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    fit();
    window.addEventListener('resize', fit);

    // Build sphere sized to 24% of smaller viewport dimension
    const R = Math.min(canvas.width, canvas.height) * 0.24;
    A.particles = buildSphere(N, R);

    function frame(ts) {
      const { width: W, height: H } = canvas;
      const cx = W / 2;
      const cy = H / 2;

      ctx.clearRect(0, 0, W, H);

      // ── Phase: idle — rotating sphere ──────────────────────────────────
      if (A.phase === 'idle') {
        A.angle += ROT;
        const ca = Math.cos(A.angle);
        const sa = Math.sin(A.angle);

        // Project 3-D → 2-D (orthographic + Y-axis rotation)
        const pts = A.particles
          .map(p => ({
            x: cx + (p.ox * ca - p.oz * sa),
            y: cy + p.oy,
            z:    p.ox * sa + p.oz * ca,  // rotated depth
          }))
          .sort((a, b) => a.z - b.z); // back-to-front

        pts.forEach(({ x, y, z }) => {
          const depth = (z + R) / (2 * R); // 0 = behind, 1 = front
          const size  = 0.5 + 2.0 * depth;
          const alpha = 0.06 + 0.94 * depth;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(2)})`;
          ctx.fill();
        });

      // ── Phase: dispersing — particles fly outward ──────────────────────
      } else {
        if (!A.dispStart) A.dispStart = ts;
        const t     = Math.min((ts - A.dispStart) / DUR, 1);
        const eased = t * t * t; // cubic ease-in — slow start, fast finish

        A.disp.forEach(d => {
          const x     = d.sx + d.vx * eased * DSC;
          const y     = d.sy + d.vy * eased * DSC;
          const alpha = Math.max(0, 1 - t * 1.35);
          const size  = Math.max(0.3, 2.2 * (1 - eased * 0.8));
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(2)})`;
          ctx.fill();
        });

        if (t >= 1) return; // stop the rAF loop — animation complete
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('resize', fit);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Click handler ──────────────────────────────────────────────────────────

  const handleClick = useCallback(() => {
    const A = anim.current;
    if (A.phase !== 'idle') return;

    const canvas = canvasRef.current;
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    const ca = Math.cos(A.angle);
    const sa = Math.sin(A.angle);

    // Freeze each particle's current screen position → outward velocity
    A.disp = A.particles.map(p => {
      const sx  = cx + (p.ox * ca - p.oz * sa);
      const sy  = cy + p.oy;
      const dx  = sx - cx;
      const dy  = sy - cy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const spd = 1.8 + Math.random() * 5.8; // variation in speed
      return { sx, sy, vx: (dx / len) * spd, vy: (dy / len) * spd };
    });

    A.phase     = 'dispersing';
    A.dispStart = 0; // will be captured as `ts` on the next rAF frame

    setUiPhase('dispersing'); // trigger React CSS transitions

    setTimeout(onInitialize, DUR + 80); // 80 ms buffer past animation end
  }, [onInitialize]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const dispersing = uiPhase === 'dispersing';

  return (
    <div
      id="intro-screen"
      onClick={handleClick}
      style={{
        position:       'fixed',
        inset:           0,
        zIndex:          100,
        cursor:         'pointer',
        overflow:       'hidden',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        backgroundColor: dispersing ? '#000' : '#fff',
        transition:     `background-color ${DUR}ms cubic-bezier(0.55,0,1,1)`,
      }}
    >
      {/* ── Particle canvas (sits behind text) ─────────────────────────── */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      />

      {/* ── Text: RIP SIMULATION ──────────────────────────────────────── */}
      <div
        style={{
          position:       'relative',
          zIndex:          2,
          textAlign:      'center',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          gap:             24,
          userSelect:     'none',
          pointerEvents:  'none',
          opacity:         dispersing ? 0 : 1,
          transition:     `opacity ${DUR * 0.28}ms ease-in`,
        }}
      >
        {/* Main title */}
        <h1
          style={{
            fontFamily:    "'Inter', 'Helvetica Neue', Arial, sans-serif",
            fontSize:      'clamp(20px, 3.8vw, 52px)',
            fontWeight:     900,
            color:         '#000',
            letterSpacing: '0.52em',
            textTransform: 'uppercase',
            margin:         0,
            lineHeight:     1,
            // Compensate trailing whitespace from letter-spacing
            paddingRight:  '0.52em',
          }}
        >
          RIP SIMULATION
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontFamily:    "'JetBrains Mono', 'Roboto Mono', 'Courier New', monospace",
            fontSize:      'clamp(7px, 0.85vw, 11px)',
            fontWeight:     400,
            color:         'rgba(0,0,0,0.36)',
            letterSpacing: '0.30em',
            textTransform: 'uppercase',
            margin:         0,
            paddingRight:  '0.30em',
          }}
        >
          CLICK ANYWHERE TO INITIALIZE
        </p>
      </div>
    </div>
  );
}

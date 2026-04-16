/**
 * BroadcastAnimation.jsx
 *
 * Renders animated yellow "table-exchange" dots on the canvas during the
 * RIP convergence simulation.
 *
 * How it hooks in (zero new contexts needed):
 *  - The Simulate tab fires a global CustomEvent 'rip-broadcast' whenever
 *    the visible round number advances.
 *  - This component listens for that event, snapshots all active link
 *    endpoints at that instant, and launches a requestAnimationFrame loop
 *    that moves one yellow dot per link-direction from source → target.
 *  - Starting a new broadcast automatically cancels any in-flight animation.
 *
 * Visual design:
 *  - Bright yellow (#facc15) circle, 11 px diameter.
 *  - Double-ring glow (close + far) in amber/yellow.
 *  - Fade-in for first 15 % of travel, fade-out for last 15 %.
 *  - Both ends of every link animate simultaneously (bidirectional broadcast).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTopologyState } from '../../context/TopologyContext';
import { ROUTER_NODE_SIZE } from './RouterNode';

const HALF     = ROUTER_NODE_SIZE / 2;
const DURATION = 720; // ms — one dot traverses the full link in this time

/** Quadratic ease-in-out */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BroadcastAnimation() {
  const { nodes, links } = useTopologyState();

  // Rendered dot state: [{ id, x, y, alpha }]
  const [dots, setDots] = useState([]);

  const rafRef   = useRef(null);
  const animData = useRef([]); // current animation descriptors

  // ── Build waypoints from current topology state ──────────────────────────

  const buildSegments = useCallback(() => {
    const nodeMap = new Map(
      nodes.map((n) => [n.id, { x: n.x + HALF, y: n.y + HALF }])
    );

    const segments = [];
    for (const link of links) {
      if (link.status !== 'active') continue; // skip failed links

      const src = nodeMap.get(link.sourceNodeId);
      const tgt = nodeMap.get(link.targetNodeId);
      if (!src || !tgt) continue;

      // Both directions — each router broadcasts to the other
      segments.push({ id: `${link.id}-fwd`, from: src, to: tgt });
      segments.push({ id: `${link.id}-rev`, from: tgt, to: src });
    }
    return segments;
  }, [nodes, links]);

  // ── Start broadcast animation ────────────────────────────────────────────

  const startBroadcast = useCallback(() => {
    const segments = buildSegments();
    if (segments.length === 0) return;

    // Cancel any in-flight animation
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const startTime = performance.now();

    animData.current = segments.map((seg) => ({
      id:        seg.id + `-${startTime}`,
      from:      seg.from,
      to:        seg.to,
      startTime,
    }));

    function tick(now) {
      const still = animData.current.filter((d) => now - d.startTime < DURATION);

      if (still.length === 0) {
        setDots([]);
        animData.current = [];
        return;
      }

      setDots(
        still.map((d) => {
          const elapsed = now - d.startTime;
          const t       = Math.min(elapsed / DURATION, 1);
          const ease    = easeInOut(t);

          // Fade in during first 15 %, fade out during last 15 %
          const alpha =
            t < 0.15 ? t / 0.15 :
            t > 0.85 ? (1 - t) / 0.15 : 1;

          return {
            id:    d.id,
            x:     d.from.x + (d.to.x - d.from.x) * ease,
            y:     d.from.y + (d.to.y - d.from.y) * ease,
            alpha,
          };
        })
      );

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [buildSegments]);

  // ── Listen for broadcast trigger ─────────────────────────────────────────

  useEffect(() => {
    const handler = () => startBroadcast();
    window.addEventListener('rip-broadcast', handler);
    return () => {
      window.removeEventListener('rip-broadcast', handler);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startBroadcast]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (dots.length === 0) return null;

  return (
    <>
      {dots.map((dot) => (
        <div
          key={dot.id}
          aria-hidden="true"
          style={{
            position:      'absolute',
            left:           dot.x,
            top:            dot.y,
            transform:     'translate(-50%, -50%)',
            width:          11,
            height:         11,
            borderRadius:  '50%',
            background:    '#facc15',
            boxShadow: [
              `0 0  5px 2px rgba(250,204,21,${(dot.alpha * 0.9).toFixed(2)})`,
              `0 0 14px 5px rgba(251,146,60,${(dot.alpha * 0.50).toFixed(2)})`,
              `0 0 24px 8px rgba(250,204,21,${(dot.alpha * 0.20).toFixed(2)})`,
            ].join(', '),
            opacity:        dot.alpha,
            pointerEvents: 'none',
            zIndex:         45,
            willChange:    'transform, opacity',
          }}
        />
      ))}
    </>
  );
}

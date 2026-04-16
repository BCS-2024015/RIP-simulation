/**
 * RouterNode.jsx  (visual redesign — sci-fi glowing hardware)
 *
 * Drag logic is unchanged from the original implementation.
 * All visual styling has been replaced with Tailwind utility classes
 * and the CSS animations defined in index.css.
 *
 * Visual anatomy:
 *  ┌─ corner ─────────────────── corner ─┐
 *  │                                      │
 *  │         [router SVG icon]            │  ← bg-slate-800 / border-cyan-500
 *  │                                      │
 *  └─ corner ─────────────────── corner ─┘
 *       LABEL (below, monospace, cyan)
 */

import React, { useRef, useCallback } from 'react';
import { useTopologyActions, useTopologyState } from '../../context/TopologyContext';
import { useTheme } from '../../context/ThemeContext';

// ── Visual constants (exported — LinkLine uses ROUTER_NODE_SIZE for centres) ──
export const ROUTER_NODE_SIZE = 56;
const HALF = ROUTER_NODE_SIZE / 2;

// ── Router SVG Icon ───────────────────────────────────────────────────────────

function RouterIcon({ selected }) {
  const color = selected ? '#67e8f9' : '#22d3ee';
  const dim   = selected ? '#a5f3fc' : '#67e8f9';
  return (
    <svg
      width="30" height="26"
      viewBox="0 0 30 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block', transition: 'all 0.3s ease' }}
    >
      {/* Router body */}
      <rect
        x="2" y="10" width="18" height="10" rx="2"
        fill={selected ? 'rgba(6,182,212,0.14)' : 'rgba(6,182,212,0.06)'}
        stroke={color}
        strokeWidth="1.4"
      />

      {/* Port LEDs */}
      <circle cx="6"  cy="15" r="1.5" fill={dim} />
      <circle cx="11" cy="15" r="1.5" fill={dim} />
      <circle cx="16" cy="15" r="1.5" fill={dim} />

      {/* Antennas */}
      <line x1="5"  y1="10" x2="4"  y2="5.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="11" y1="10" x2="11" y2="5"   stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="17" y1="10" x2="18" y2="5.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />

      {/* WiFi / signal arcs */}
      <path
        d="M23 11.5a5 5 0 010 7"
        stroke={selected ? dim : 'rgba(6,182,212,0.45)'}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M26 9a9 9 0 010 13"
        stroke={selected ? dim : 'rgba(6,182,212,0.25)'}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Corner accent marks ───────────────────────────────────────────────────────

function CornerAccents({ selected }) {
  const cls = [
    'absolute w-2.5 h-2.5 border-cyan-500/50',
    selected ? 'border-cyan-400/80' : 'border-cyan-600/40 group-hover:border-cyan-500/60',
    'transition-colors duration-300',
  ].join(' ');

  return (
    <>
      <span className={`${cls} top-1    left-1    border-t border-l`} aria-hidden="true" />
      <span className={`${cls} top-1    right-1   border-t border-r`} aria-hidden="true" />
      <span className={`${cls} bottom-1 left-1    border-b border-l`} aria-hidden="true" />
      <span className={`${cls} bottom-1 right-1   border-b border-r`} aria-hidden="true" />
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const RouterNode = React.memo(function RouterNode({
  node,
  isSelected   = false,
  isLinkSource = false,
  onSelect,
  canvasRef,
  isFlashing = false,
}) {
  const { updateNodePosition } = useTopologyActions();
  const { isDarkMode } = useTheme();
  const dark = isDarkMode;
  const dragState = useRef(null);

  // ── Pointer event handlers (drag logic — unchanged) ─────────────────────

  const handlePointerDown = useCallback(
    (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);

      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      dragState.current = {
        offsetX: e.clientX - canvasRect.left - node.x,
        offsetY: e.clientY - canvasRect.top  - node.y,
      };
    },
    [node.x, node.y, canvasRef]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!dragState.current) return;
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      const newX = e.clientX - canvasRect.left - dragState.current.offsetX;
      const newY = e.clientY - canvasRect.top  - dragState.current.offsetY;

      updateNodePosition(node.id, newX, newY);
    },
    [node.id, canvasRef, updateNodePosition]
  );

  const handlePointerUp = useCallback(
    (e) => {
      if (!dragState.current) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragState.current = null;
      onSelect?.(node.id);
    },
    [node.id, onSelect]
  );

  const handlePointerCancel = useCallback(() => {
    dragState.current = null;
  }, []);

  const handleClick = useCallback(
    (e) => {
      e.stopPropagation();
      onSelect?.(node.id);
    },
    [node.id, onSelect]
  );

  // ── Box classes (light mode base) + runtime inline dark override ─────────
  const boxClasses = [
    'group relative w-full h-full',
    'flex items-center justify-center',
    'rounded-xl border-2',
    // Light mode base
    isLinkSource || isSelected ? 'bg-white' : 'bg-white/90 hover:bg-white',
    isLinkSource
      ? 'border-emerald-500 shadow-[0_0_16px_rgba(52,211,153,0.55)] router-node-selected'
      : isSelected
      ? 'border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.45)] router-node-selected'
      : 'border-slate-300 shadow-sm hover:border-cyan-400 hover:shadow-[0_0_10px_rgba(6,182,212,0.30)]',
    isFlashing ? 'router-node-flash' : '',
    'transition-all duration-300',
  ].filter(Boolean).join(' ');

  // Inline style — overrides the light base when dark mode is active
  const boxStyle = dark
    ? {
        background:  isLinkSource || isSelected ? '#1e293b' : 'rgba(15,23,42,0.85)',
        borderColor: isLinkSource
          ? '#34d399'
          : isSelected
          ? '#22d3ee'
          : 'rgba(6,182,212,0.35)',
        boxShadow:   isLinkSource
          ? '0 0 20px rgba(52,211,153,0.70)'
          : isSelected
          ? '0 0 18px rgba(6,182,212,0.65)'
          : '0 0 8px rgba(6,182,212,0.15)',
      }
    : {};

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      id={`router-node-${node.id}`}
      role="button"
      aria-label={`Router ${node.label}`}
      aria-pressed={isSelected}
      className="group"
      style={{
        position:    'absolute',
        left:         node.x,
        top:          node.y,
        width:        ROUTER_NODE_SIZE,
        height:       ROUTER_NODE_SIZE,
        cursor:       dragState.current ? 'grabbing' : 'grab',
        userSelect:  'none',
        touchAction: 'none',
        zIndex:       isSelected ? 20 : 10,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
    >
      {/* ── Visual box ───────────────────────────────────────────────── */}
      <div className={boxClasses} style={boxStyle}>
        <CornerAccents selected={isSelected} />
        <RouterIcon    selected={isSelected} />
      </div>

      {/* ── Label (sits below the box, outside overflow) ─────────────── */}
      <div
        aria-hidden="true"
        style={{
          position:   'absolute',
          top:        '100%',
          left:       '50%',
          transform:  'translateX(-50%)',
          marginTop:   6,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          color: dark
            ? (isLinkSource ? '#6ee7b7' : isSelected ? '#67e8f9' : '#64748b')
            : (isLinkSource ? '#059669' : isSelected ? '#0891b2' : '#64748b'),
        }}
        className="font-mono-jet text-[10px] font-bold uppercase tracking-[0.18em] transition-colors duration-300"
      >
        {node.label}
      </div>
    </div>
  );
});

export default RouterNode;

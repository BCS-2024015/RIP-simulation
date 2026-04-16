/**
 * LinkLine.jsx
 *
 * SVG overlay layer that renders all topology links as lines between routers.
 *
 * Architecture:
 *  - A single <svg> element fills the full canvas (position: absolute, inset: 0)
 *    and sits BEHIND all RouterNode divs via z-index.
 *  - For each link in the topology state a <LinkSegment> is drawn.
 *  - Start/end points are computed from node {x, y} + ROUTER_NODE_SIZE/2 so lines
 *    originate from the visual centre of each router icon.
 *  - Failed links are rendered as dashed red lines to signal a broken route.
 *  - Each link shows a small cost badge at the midpoint.
 *
 * Props:
 *  @prop {number} width   - Canvas pixel width (passed from NetworkCanvas)
 *  @prop {number} height  - Canvas pixel height
 */

import React, { useMemo } from 'react';
import { useTopologyState } from '../../context/TopologyContext';
import { ROUTER_NODE_SIZE } from './RouterNode';

// Half the node icon width — offset so lines connect to icon centres
const HALF = ROUTER_NODE_SIZE / 2;

// ── Sub-component: one link segment ─────────────────────────────────────────

const LinkSegment = React.memo(function LinkSegment({ link, sourceNode, targetNode, onLinkClick }) {
  if (!sourceNode || !targetNode) return null;

  const x1 = sourceNode.x + HALF;
  const y1 = sourceNode.y + HALF;
  const x2 = targetNode.x + HALF;
  const y2 = targetNode.y + HALF;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  const isFailed = link.status === 'failed';

  // Perpendicular offset for the cost badge so it doesn't overlap the line
  const dx  = x2 - x1;
  const dy  = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = (-dy / len) * 14;
  const perpY = ( dx / len) * 14;

  return (
    <g
      id={`link-${link.id}`}
      style={{ cursor: 'pointer' }}
      onClick={(e) => { e.stopPropagation(); onLinkClick?.(link.id); }}
      role="button"
      aria-label={`Link ${link.id} cost ${link.cost}${isFailed ? ' (failed)' : ''}`}
    >
      {/* ── Hit-area (wider invisible stroke for easier clicking) ── */}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="transparent"
        strokeWidth={16}
      />

      {/* ── Visible link stroke ─────────────────────────────────── */}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={isFailed ? '#ef4444' : '#4f46e5'}
        strokeWidth={isFailed ? 1.5 : 2}
        strokeDasharray={isFailed ? '6 4' : undefined}
        strokeLinecap="round"
        style={{ transition: 'stroke 0.25s ease, stroke-dasharray 0.25s ease' }}
      />

      {/* ── Animated pulse on active links ─────────────────────── */}
      {!isFailed && (
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#818cf8"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.35}
          style={{
            animation: 'linkPulse 2.5s ease-in-out infinite',
          }}
        />
      )}

      {/* ── Cost badge ─────────────────────────────────────────── */}
      <g transform={`translate(${midX + perpX}, ${midY + perpY})`}>
        <rect
          x={-13} y={-9}
          width={26} height={18}
          rx={9}
          fill={isFailed ? '#450a0a' : '#1e1b4b'}
          stroke={isFailed ? '#ef4444' : '#4f46e5'}
          strokeWidth={1.2}
          style={{ transition: 'fill 0.25s ease, stroke 0.25s ease' }}
        />
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={9}
          fontWeight="700"
          fontFamily="'Inter', 'Roboto Mono', monospace"
          fill={isFailed ? '#fca5a5' : '#a5b4fc'}
          letterSpacing="0.04em"
        >
          {isFailed ? '∞' : link.cost}
        </text>
      </g>

      {/* ── End-point terminal dots ─────────────────────────────── */}
      <circle cx={x1} cy={y1} r={3.5}
        fill={isFailed ? '#7f1d1d' : '#312e81'}
        stroke={isFailed ? '#ef4444' : '#6366f1'}
        strokeWidth={1.5}
      />
      <circle cx={x2} cy={y2} r={3.5}
        fill={isFailed ? '#7f1d1d' : '#312e81'}
        stroke={isFailed ? '#ef4444' : '#6366f1'}
        strokeWidth={1.5}
      />
    </g>
  );
});

// ── Main component ───────────────────────────────────────────────────────────

/**
 * LinkLine
 *
 * Renders the full SVG layer for all topology links.
 */
function LinkLine({ width, height, onLinkClick }) {
  const { nodes, links } = useTopologyState();

  // Build a fast lookup map: nodeId → node object
  const nodeMap = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes]
  );

  return (
    <>
      {/* Global animation keyframes injected once */}
      <style>{`
        @keyframes linkPulse {
          0%, 100% { opacity: 0.15; }
          50%       { opacity: 0.50; }
        }
      `}</style>

      <svg
        id="link-line-layer"
        style={{
          position:      'absolute',
          inset:         0,
          width:         '100%',
          height:        '100%',
          pointerEvents: 'visiblePainted', // allow clicks on link elements
          zIndex:        5,               // behind router nodes (z-index: 10+)
          overflow:      'visible',
        }}
        aria-label="Network topology links"
      >
        <defs>
          {/* Subtle gradient for active link glow */}
          <filter id="link-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {links.map((link) => (
          <LinkSegment
            key={link.id}
            link={link}
            sourceNode={nodeMap.get(link.sourceNodeId)}
            targetNode={nodeMap.get(link.targetNodeId)}
            onLinkClick={onLinkClick}
          />
        ))}
      </svg>
    </>
  );
}

export default React.memo(LinkLine);

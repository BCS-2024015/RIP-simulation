/**
 * ToolsCard.jsx
 *
 * Left-side floating toolbar for the RIPv2 Network Simulator.
 *
 * Tool modes:
 *  - add-router : Immediately spawns a new router at a randomised canvas
 *                 position (or at the last-clicked canvas point via onAddRouter).
 *  - add-link   : Activates link-drawing mode; the parent/canvas must handle
 *                 sequential node selection and dispatch ADD_LINK.
 *  - delete     : Parent/canvas treats the next node or link click as a delete.
 *  - fail-link  : Parent/canvas treats the next link click as TOGGLE_LINK_FAIL.
 *
 * The active tool is stored locally and propagated upward via `onToolChange`.
 * "Add Router" is the only action wired directly to dispatch (fires immediately).
 * All other tools set a mode and rely on canvas interaction to complete the action.
 *
 * Props:
 *  @prop {Function} [onToolChange]  (toolName: string | null) => void
 *  @prop {Function} [onAddRouter]   (id, label, x, y) => void — called when
 *                                    Add Router is pressed; if omitted the hook
 *                                    dispatches directly with a random position.
 */

import React, { useState, useCallback, useRef } from 'react';
import { useTopologyActions } from '../../context/TopologyContext';
import { useTheme } from '../../context/ThemeContext';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Starts at 5 because R1–R5 are reserved for the default topology.
// Resets to 0 when the user hits Reset (which clears all nodes including defaults).
let routerCounter = 5;

/**
 * Generates a short, unique router ID such as "R1", "R2", …
 */
function generateRouterId() {
  routerCounter += 1;
  return `R${routerCounter}`;
}

/**
 * Produces a reasonable default drop position near the centre of a typical
 * viewport with slight jitter so newly added nodes don't stack.
 */
function randomPosition() {
  return {
    x: 180 + Math.random() * 520,
    y: 120 + Math.random() * 380,
  };
}

// ── Topology file parser ──────────────────────────────────────────────────────

/**
 * parseTopologyFile
 *
 * Parses a plain-text topology file where each non-empty, non-comment line
 * describes one link in the format:
 *
 *   RouterA,RouterB,Cost
 *
 * Example:
 *   R1,R2,1
 *   R2,R3,5
 *   R1,R3,10
 *
 * Rules:
 *  - Lines starting with # are treated as comments and ignored.
 *  - Whitespace around tokens is trimmed.
 *  - Cost must be a positive integer 1–15; if invalid or missing, defaults to 1.
 *  - Node IDs are extracted from both columns; duplicates are collapsed.
 *  - Nodes are arranged in a grid-spiral layout so they appear evenly spaced.
 *
 * @param {string} text  — raw file content
 * @param {number} [canvasW=900]  — canvas width in px
 * @param {number} [canvasH=600]  — canvas height in px
 * @returns {{ nodes: Object[], links: Object[] }}
 */
function parseTopologyFile(text, canvasW = 900, canvasH = 580) {
  const lines = text.split(/\r?\n/);

  const nodeSet = new Set();
  const rawLinks = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 2) continue;

    const [src, tgt, costStr] = parts;
    if (!src || !tgt || src === tgt) continue;

    const cost = Math.min(15, Math.max(1, parseInt(costStr, 10) || 1));
    nodeSet.add(src);
    nodeSet.add(tgt);
    rawLinks.push({ src, tgt, cost });
  }

  // ── Position nodes in a grid / circular layout ────────────────────────────
  const nodeIds  = Array.from(nodeSet);
  const n        = nodeIds.length;
  const NODE_SZ  = 56;   // ROUTER_NODE_SIZE constant
  const PADDING  = 80;   // edge padding from canvas border

  const positions = {};

  if (n === 1) {
    positions[nodeIds[0]] = { x: canvasW / 2 - NODE_SZ / 2, y: canvasH / 2 - NODE_SZ / 2 };
  } else if (n <= 8) {
    // Circular layout
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const r  = Math.min(cx - PADDING, cy - PADDING) * 0.82;
    nodeIds.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      positions[id] = {
        x: Math.round(cx + r * Math.cos(angle) - NODE_SZ / 2),
        y: Math.round(cy + r * Math.sin(angle) - NODE_SZ / 2),
      };
    });
  } else {
    // Grid layout for larger topologies
    const cols    = Math.ceil(Math.sqrt(n));
    const rows    = Math.ceil(n / cols);
    const cellW   = (canvasW - PADDING * 2) / cols;
    const cellH   = (canvasH - PADDING * 2) / rows;
    nodeIds.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions[id] = {
        x: Math.round(PADDING + col * cellW + cellW / 2 - NODE_SZ / 2),
        y: Math.round(PADDING + row * cellH + cellH / 2 - NODE_SZ / 2),
      };
    });
  }

  // ── Build output objects ──────────────────────────────────────────────────
  const nodes = nodeIds.map((id) => ({
    id,
    label: id,
    x: positions[id].x,
    y: positions[id].y,
  }));

  // Deduplicate links (undirected: treat A→B and B→A as same link)
  const seen  = new Set();
  const links = [];
  for (const { src, tgt, cost } of rawLinks) {
    const key = [src, tgt].sort().join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      id:           `${src}-${tgt}`,
      sourceNodeId:  src,
      targetNodeId:  tgt,
      cost,
      status:       'active',
    });
  }

  return { nodes, links };
}

// ── Icons (inline SVG) ────────────────────────────────────────────────────────

function IconAddRouter() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="8" width="13" height="8" rx="1.5" />
      <circle cx="7"  cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="12" r="1" fill="currentColor" stroke="none" />
      <line x1="7"  y1="8" x2="6"  y2="4.5" />
      <line x1="10" y1="8" x2="10" y2="4"   />
      <line x1="13" y1="8" x2="14" y2="4.5" />
      {/* Plus badge */}
      <circle cx="19" cy="18" r="4" fill="#4f46e5" stroke="none" />
      <path d="M19 16v4M17 18h4" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconAddLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="5"  cy="12" r="2.8" />
      <circle cx="19" cy="12" r="2.8" />
      <line x1="7.8" y1="12" x2="16.2" y2="12" />
      <line x1="12" y1="8"  x2="12" y2="16" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  );
}

function IconFailLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="5"  cy="12" r="2.8" />
      <circle cx="19" cy="12" r="2.8" />
      <line x1="8" y1="9" x2="16" y2="15" strokeDasharray="2 2" />
      <line x1="9" y1="9" x2="15" y2="15" />
      {/* Warning X at centre */}
      <line x1="10.5" y1="10.5" x2="13.5" y2="13.5" stroke="#ef4444" />
      <line x1="13.5" y1="10.5" x2="10.5" y2="13.5" stroke="#ef4444" />
    </svg>
  );
}

function IconReset() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="18" height="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M3 12a9 9 0 109-9 9 9 0 00-9 9" />
      <polyline points="3 3 3 9 9 9" />
    </svg>
  );
}

function IconImport() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// ── ToolButton sub-component ──────────────────────────────────────────────────

function ToolButton({ id, label, icon, active, danger, onClick, tooltip }) {
  return (
    <div className="relative group">
      <button
        id={id}
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={[
          'flex flex-col items-center gap-1.5 w-full px-3 py-3 rounded-xl',
          'text-xs font-semibold tracking-wide transition-all duration-200',
          'border focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
          active && !danger
            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-900/40'
            : active && danger
            ? 'bg-red-600/80 border-red-400 text-white shadow-lg shadow-red-900/40'
            : danger
            ? 'bg-transparent border-red-200 text-red-500 hover:bg-red-50 hover:border-red-400 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/60 dark:hover:border-red-600/60 dark:hover:text-red-300'
            : 'bg-transparent border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 dark:border-white/8 dark:text-slate-400 dark:hover:bg-indigo-950/60 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300',
        ].join(' ')}
      >
        <span className={active ? 'text-white' : ''}>{icon}</span>
        <span className="leading-none">{label}</span>
      </button>

      {/* Tooltip */}
      {tooltip && (
        <div className="
          pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2
          whitespace-nowrap rounded-lg bg-slate-900 border border-white/10
          px-3 py-1.5 text-xs text-slate-300 shadow-xl
          opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50
        ">
          {tooltip}
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
        </div>
      )}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider() {
  return <div className="h-px bg-white/6 mx-1 my-0.5" aria-hidden="true" />;
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * ToolsCard
 */
function ToolsCard({ onToolChange, onAddRouter }) {
  const { addNode, resetTopology } = useTopologyActions();
  const { isDarkMode } = useTheme();
  const dark = isDarkMode;

  const cardStyle = {
    top:            'calc(56px + 16px)',
    maxHeight:      'calc(100vh - 56px - 32px)',
    background:      dark ? 'rgba(2,6,23,0.84)'   : undefined,
    borderColor:     dark ? 'rgba(6,182,212,0.22)' : undefined,
    boxShadow:       dark ? '0 4px 30px rgba(0,0,0,0.65), 0 0 0 1px rgba(6,182,212,0.10)' : undefined,
    backdropFilter:  dark ? 'blur(28px)' : undefined,
  };

  const [activeTool,   setActiveTool]   = useState(null);
  const [importError,  setImportError]  = useState(null);
  const [importOk,     setImportOk]     = useState(false);
  const fileInputRef = useRef(null);

  const setTool = useCallback(
    (tool) => {
      const next = activeTool === tool ? null : tool;
      setActiveTool(next);
      onToolChange?.(next);
    },
    [activeTool, onToolChange]
  );

  // "Add Router" fires immediately — no mode toggle needed
  const handleAddRouter = useCallback(() => {
    const id   = generateRouterId();
    const pos  = randomPosition();
    if (onAddRouter) {
      onAddRouter(id, id, pos.x, pos.y);
    } else {
      addNode(id, id, pos.x, pos.y);
    }
    // Deactivate any lingering tool mode
    setActiveTool(null);
    onToolChange?.(null);
  }, [addNode, onAddRouter, onToolChange]);

  const handleReset = useCallback(() => {
    if (window.confirm('Reset topology? All routers and links will be removed.')) {
      routerCounter = 0;
      resetTopology();
      setActiveTool(null);
      onToolChange?.(null);
    }
  }, [resetTopology, onToolChange]);

  // ── File import ──────────────────────────────────────────────────────────

  const handleImportClick = useCallback(() => {
    setImportError(null);
    setImportOk(false);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const text = evt.target.result;
          const { nodes, links } = parseTopologyFile(text);

          if (nodes.length === 0) {
            setImportError('No valid connections found. Format: RouterA,RouterB,Cost');
            return;
          }

          // Reset counter so new manual routers don't collide with imported IDs
          routerCounter = 0;

          // Bulk-replace topology with parsed data
          resetTopology(nodes, links);

          setImportOk(true);
          setTimeout(() => setImportOk(false), 3000);
        } catch (err) {
          setImportError('Parse error: ' + err.message);
        } finally {
          // Reset so the same file can be re-imported if needed
          e.target.value = '';
        }
      };
      reader.onerror = () => setImportError('Could not read file.');
      reader.readAsText(file);
    },
    [resetTopology]
  );

  return (
    <div
      id="tools-card"
      role="toolbar"
      aria-label="Network simulation tools"
      className="
        absolute left-4 z-40
        flex flex-col gap-1
        w-[88px]
        rounded-2xl border p-2
        border-slate-200 bg-white/85 backdrop-blur-xl shadow-lg shadow-slate-200/60
        transition-all duration-300
      "
      style={cardStyle}
    >
      {/* Header label */}
      <p className="text-center text-[9px] font-bold tracking-[0.18em] text-slate-600 uppercase py-1 select-none">
        Tools
      </p>

      <Divider />

      {/* ── Primary tools ───────────────────────────────────────── */}
      <ToolButton
        id="tool-add-router"
        label="Add Router"
        icon={<IconAddRouter />}
        active={false}
        onClick={handleAddRouter}
        tooltip="Spawn a new router node on the canvas"
      />

      <ToolButton
        id="tool-add-link"
        label="Add Link"
        icon={<IconAddLink />}
        active={activeTool === 'add-link'}
        onClick={() => setTool('add-link')}
        tooltip="Click two routers to connect them"
      />

      <Divider />

      {/* ── Destructive / simulation tools ──────────────────────── */}
      <ToolButton
        id="tool-delete"
        label="Delete"
        icon={<IconDelete />}
        active={activeTool === 'delete'}
        danger
        onClick={() => setTool('delete')}
        tooltip="Click a router or link to remove it"
      />

      <ToolButton
        id="tool-fail-link"
        label="Fail Link"
        icon={<IconFailLink />}
        active={activeTool === 'fail-link'}
        danger
        onClick={() => setTool('fail-link')}
        tooltip="Click a link to simulate a route failure"
      />

      <Divider />

      {/* ── Utility ─────────────────────────────────────────────── */}
      <button
        id="tool-reset"
        onClick={handleReset}
        aria-label="Reset topology"
        className="
          flex items-center justify-center gap-1.5 w-full px-2 py-2
          rounded-xl border border-white/6 text-slate-600
          hover:bg-slate-800/60 hover:text-slate-400 hover:border-white/10
          text-[10px] font-semibold tracking-wide
          transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500
        "
      >
        <IconReset />
        <span>Reset</span>
      </button>

      {/* ── Import Topology ──────────────────────────────────────── */}
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        id="import-file-input"
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        aria-label="Import topology file"
        onChange={handleFileChange}
      />

      <button
        id="tool-import"
        onClick={handleImportClick}
        aria-label="Import topology from .txt file"
        className="
          flex flex-col items-center gap-1.5 w-full px-3 py-3 rounded-xl
          border border-cyan-900/40 text-cyan-700
          hover:bg-cyan-950/40 hover:border-cyan-600/50 hover:text-cyan-400
          text-[10px] font-semibold tracking-wide
          transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400
        "
        title="Import topology from a .txt file (format: RouterA,RouterB,Cost per line)"
      >
        <IconImport />
        <span>Import</span>
      </button>

      {/* ── Import feedback ──────────────────────────────────────── */}
      {importOk && (
        <div className="rounded-lg bg-emerald-950/60 border border-emerald-800/40 px-2 py-1.5 text-center" aria-live="polite">
          <span className="text-[9px] font-bold text-emerald-400">✓ Imported!</span>
        </div>
      )}
      {importError && (
        <div
          className="rounded-lg bg-red-950/60 border border-red-800/40 px-2 py-1.5 text-center cursor-pointer"
          aria-live="assertive"
          onClick={() => setImportError(null)}
          title="Click to dismiss"
        >
          <span className="text-[9px] font-bold text-red-400 break-words leading-tight">{importError}</span>
        </div>
      )}

      {/* Active-mode indicator strip */}
      {activeTool && (
        <div className="mt-1 rounded-lg bg-indigo-950/60 border border-indigo-800/40 px-2 py-1.5 text-center" aria-live="polite">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse mr-1.5 align-middle" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-400">
            {activeTool === 'add-link'  && 'Linking…'}
            {activeTool === 'delete'    && 'Delete'}
            {activeTool === 'fail-link' && 'Fail…'}
          </span>
        </div>
      )}
    </div>
  );
}

export default ToolsCard;

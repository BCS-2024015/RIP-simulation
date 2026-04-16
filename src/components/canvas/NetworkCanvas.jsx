/**
 * NetworkCanvas.jsx
 *
 * The primary interactive workspace for the RIPv2 Network Simulator.
 *
 * Tool-mode behaviour (driven by `activeTool` prop from App):
 *  - add-link  : Two-click flow — first node sets source, second completes
 *                the link. Cost is entered via a small inline prompt banner.
 *  - delete    : Any click on a node or link permanently removes it.
 *  - fail-link : Clicking a link toggles its status between active/failed.
 *  - null      : Normal select / drag mode.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useTopologyState, useTopologyActions } from '../../context/TopologyContext';
import RouterNode          from './RouterNode';
import LinkLine            from './LinkLine';
import PacketGlow          from './PacketGlow';
import BroadcastAnimation  from './BroadcastAnimation';

// ── Component ─────────────────────────────────────────────────────────────────

function NetworkCanvas({ activeTool, isDarkMode = false, onNodeSelect, onLinkSelect, onCanvasDrop }) {
  const { nodes } = useTopologyState();
  const { addLink, deleteNode, deleteLink, toggleLinkFail } = useTopologyActions();

  const canvasRef = useRef(null);

  // Visual selection state (inspector panel)
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedLinkId, setSelectedLinkId] = useState(null);

  // Two-click link creation: holds the first node clicked in add-link mode
  const [linkSourceId, setLinkSourceId] = useState(null);
  // Pending link cost prompt value
  const [pendingCost, setPendingCost]   = useState('1');
  const [showCostPrompt, setShowCostPrompt] = useState(false);
  const [pendingLink, setPendingLink]   = useState(null); // { sourceId, targetId }

  // ── Reset link source when tool changes ────────────────────────────────
  useEffect(() => {
    setLinkSourceId(null);
    setShowCostPrompt(false);
    setPendingLink(null);
  }, [activeTool]);

  // ── Node click handler (tool-aware) ───────────────────────────────────

  const handleNodeSelect = useCallback(
    (nodeId) => {
      // ── add-link mode ──────────────────────────────────────────────
      if (activeTool === 'add-link') {
        if (!linkSourceId) {
          // First click → set source
          setLinkSourceId(nodeId);
        } else if (linkSourceId !== nodeId) {
          // Second click → open mini cost prompt
          setPendingLink({ sourceId: linkSourceId, targetId: nodeId });
          setPendingCost('1');
          setShowCostPrompt(true);
          setLinkSourceId(null);
        }
        return;
      }

      // ── delete mode ────────────────────────────────────────────────
      if (activeTool === 'delete') {
        deleteNode(nodeId);
        if (selectedNodeId === nodeId) {
          setSelectedNodeId(null);
          onNodeSelect?.(null);
        }
        return;
      }

      // ── normal select ──────────────────────────────────────────────
      setSelectedNodeId(nodeId);
      setSelectedLinkId(null);
      onNodeSelect?.(nodeId);
    },
    [activeTool, linkSourceId, deleteNode, selectedNodeId, onNodeSelect]
  );

  // ── Link click handler (tool-aware) ───────────────────────────────────

  const handleLinkSelect = useCallback(
    (linkId) => {
      if (activeTool === 'delete') {
        deleteLink(linkId);
        if (selectedLinkId === linkId) {
          setSelectedLinkId(null);
          onLinkSelect?.(null);
        }
        return;
      }
      if (activeTool === 'fail-link') {
        toggleLinkFail(linkId);
        return;
      }
      setSelectedLinkId(linkId);
      setSelectedNodeId(null);
      onLinkSelect?.(linkId);
    },
    [activeTool, deleteLink, toggleLinkFail, selectedLinkId, onLinkSelect]
  );

  // ── Canvas background click ────────────────────────────────────────────

  const handleCanvasClick = useCallback(() => {
    if (activeTool === 'add-link') {
      setLinkSourceId(null); // cancel partial link
      return;
    }
    setSelectedNodeId(null);
    setSelectedLinkId(null);
    onNodeSelect?.(null);
    onLinkSelect?.(null);
  }, [activeTool, onNodeSelect, onLinkSelect]);

  // ── Confirm link cost ──────────────────────────────────────────────────

  const confirmLink = useCallback(() => {
    if (!pendingLink) return;
    const cost = parseInt(pendingCost, 10);
    if (!isNaN(cost) && cost >= 1 && cost < 16) {
      const id = `${pendingLink.sourceId}-${pendingLink.targetId}-${Date.now()}`;
      addLink(id, pendingLink.sourceId, pendingLink.targetId, cost);
    }
    setShowCostPrompt(false);
    setPendingLink(null);
  }, [pendingLink, pendingCost, addLink]);

  const cancelLink = useCallback(() => {
    setShowCostPrompt(false);
    setPendingLink(null);
  }, []);

  // ── HTML5 drop zone ────────────────────────────────────────────────────

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      onCanvasDrop?.(e.clientX - rect.left, e.clientY - rect.top);
    },
    [onCanvasDrop]
  );

  // ── Canvas cursor ──────────────────────────────────────────────────────

  const canvasCursor =
    activeTool === 'delete'    ? 'crosshair' :
    activeTool === 'fail-link' ? 'crosshair' :
    activeTool === 'add-link'  ? 'cell'      : 'default';

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      id="network-canvas"
      ref={canvasRef}
      onClick={handleCanvasClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      role="region"
      aria-label="Network topology canvas"
      style={{
        position:   'relative',
        width:      '100%',
        height:     '100vh',
        overflow:   'hidden',
        cursor:     canvasCursor,
        background: isDarkMode ? '#0B0C10' : '#f1f5f9',
        transition: 'background 0.4s ease',
      }}
    >
      {/* ── Video background (fills this canvas only) ────────────────── */}
      {/* key forces a full remount when isDarkMode flips so the new src loads */}
      <video
        key={isDarkMode ? 'dark' : 'light'}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        style={{
          position:      'absolute',
          inset:          0,
          width:         '100%',
          height:        '100%',
          objectFit:    'cover',
          opacity:        isDarkMode ? 0.20 : 0.60,
          pointerEvents: 'none',
          zIndex:         0,
        }}
      >
        <source src={isDarkMode ? '/background_dark.mp4' : '/background_light.mp4'} type="video/mp4" />
      </video>

      {/* ── Dot-grid overlay ─────────────────────────────────────────── */}
      <CanvasGrid />

      {/* ── SVG link layer ───────────────────────────────────────────── */}
      <LinkLine onLinkClick={handleLinkSelect} />

      {/* ── Router nodes ─────────────────────────────────────────────── */}
      {nodes.map((node) => (
        <RouterNode
          key={node.id}
          node={node}
          isSelected={node.id === selectedNodeId}
          isLinkSource={node.id === linkSourceId}
          onSelect={handleNodeSelect}
          canvasRef={canvasRef}
        />
      ))}

      {/* ── Ping simulation layer ─────────────────────────────────────── */}
      <PacketGlow canvasRef={canvasRef} />

      {/* ── RIP broadcast dots (Simulate tab) ────────────────────────── */}
      <BroadcastAnimation />

      {/* ── Active tool mode banner ───────────────────────────────────── */}
      <ToolModeBanner
        activeTool={activeTool}
        linkSourceId={linkSourceId}
      />

      {/* ── Inline cost prompt (add-link second click) ───────────────── */}
      {showCostPrompt && pendingLink && (
        <LinkCostPrompt
          sourceId={pendingLink.sourceId}
          targetId={pendingLink.targetId}
          cost={pendingCost}
          onChange={setPendingCost}
          onConfirm={confirmLink}
          onCancel={cancelLink}
        />
      )}



      {/* ── Bottom-right HUD ─────────────────────────────────────────── */}
      <CanvasHUD nodeCount={nodes.length} />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CanvasGrid() {
  return (
    <svg
      aria-hidden="true"
      style={{
        position:      'absolute',
        inset:         0,
        width:         '100%',
        height:        '100%',
        pointerEvents: 'none',
        zIndex:        1,
      }}
    >
      <defs>
        <pattern id="canvas-dot-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="rgba(99,102,241,0.18)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#canvas-dot-grid)" />
    </svg>
  );
}

/** Top-centre banner describing the active tool mode */
function ToolModeBanner({ activeTool, linkSourceId }) {
  if (!activeTool) return null;

  const messages = {
    'add-link':  linkSourceId
      ? `Source: ${linkSourceId} — now click a second router to complete the link`
      : 'Add Link: click a router to set it as the source',
    'delete':    'Delete Mode — click any router or link to remove it',
    'fail-link': 'Fail Link — click a link to toggle its failure state',
  };

  const colors = {
    'add-link':  linkSourceId ? 'border-emerald-500/40 text-emerald-300' : 'border-indigo-500/40 text-indigo-300',
    'delete':    'border-red-500/40 text-red-300',
    'fail-link': 'border-amber-500/40 text-amber-300',
  };

  return (
    <div
      aria-live="polite"
      style={{
        position:  'absolute',
        top:        16,
        left:      '50%',
        transform: 'translateX(-50%)',
        zIndex:     35,
        pointerEvents: 'none',
      }}
    >
      <div className={`
        flex items-center gap-2 px-4 py-2 rounded-full
        border bg-slate-950/80 backdrop-blur-xl
        text-xs font-semibold whitespace-nowrap
        shadow-lg ${colors[activeTool] ?? 'border-white/10 text-slate-300'}
      `}>
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />
        {messages[activeTool]}
      </div>
    </div>
  );
}

/** Inline cost prompt shown after the second node click in add-link mode */
function LinkCostPrompt({ sourceId, targetId, cost, onChange, onConfirm, onCancel }) {
  return (
    <div
      style={{
        position:  'absolute',
        top:        '50%',
        left:      '50%',
        transform: 'translate(-50%, -50%)',
        zIndex:     60,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="
        flex flex-col gap-4 p-6 rounded-2xl
        border border-white/10 bg-slate-950/90 backdrop-blur-2xl
        shadow-2xl shadow-black/70
        min-w-[280px]
      ">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">New Link</p>
          <p className="text-sm font-semibold text-slate-200">
            <span className="text-cyan-300 font-mono">{sourceId}</span>
            <span className="text-slate-500 mx-2">→</span>
            <span className="text-cyan-300 font-mono">{targetId}</span>
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="link-cost-input" className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Link Cost / Metric (1–15)
          </label>
          <input
            id="link-cost-input"
            type="number"
            min="1"
            max="15"
            value={cost}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel(); }}
            autoFocus
            className="
              w-full px-3 py-2 rounded-xl
              border border-cyan-500/30 bg-slate-900/80
              text-cyan-200 font-mono font-bold text-lg text-center
              focus:outline-none focus:border-cyan-400/60
              transition-colors duration-200
            "
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl border border-slate-700/50 text-slate-500 text-xs font-bold hover:border-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-xl bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 text-xs font-bold hover:bg-cyan-600/30 hover:border-cyan-400/60 transition-colors"
          >
            Create Link
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      aria-live="polite"
      style={{
        position:      'absolute',
        inset:         0,
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        justifyContent:'center',
        pointerEvents: 'none',
        zIndex:        2,
      }}
    >
      <div style={{
        border:       '2px dashed rgba(6,182,212,0.20)',
        borderRadius:  24,
        padding:      '40px 64px',
        display:      'flex',
        flexDirection:'column',
        alignItems:   'center',
        gap:           12,
        background:   'rgba(6,182,212,0.03)',
      }}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <circle cx="24" cy="24" r="23" stroke="rgba(6,182,212,0.35)" strokeWidth="1.5" />
          <path d="M24 14v20M14 24h20" stroke="rgba(6,182,212,0.55)" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <p style={{ margin:0, fontSize:14, fontWeight:600, color:'rgba(148,163,184,0.75)', fontFamily:"'Inter',system-ui,sans-serif", textAlign:'center' }}>
          Use 'Add Router' in the toolbar to spawn routers
        </p>
        <p style={{ margin:0, fontSize:11, color:'rgba(100,116,139,0.6)', fontFamily:"'Inter',system-ui,sans-serif", textAlign:'center' }}>
          Then use 'Add Link' to connect them · Click to select · Drag to reposition
        </p>
      </div>
    </div>
  );
}

function CanvasHUD({ nodeCount }) {
  return (
    <div
      style={{
        position:'absolute', bottom:16, right:20, zIndex:30,
        display:'flex', gap:8, alignItems:'center',
        fontFamily:"'Inter','Roboto Mono',monospace", fontSize:11,
        color:'rgba(100,116,139,0.7)', userSelect:'none', pointerEvents:'none',
      }}
    >
      {[`${nodeCount} router${nodeCount !== 1 ? 's' : ''}`, 'RIPv2'].map((label) => (
        <span key={label} style={{
          background:'rgba(15,23,42,0.8)',
          border:'1px solid rgba(6,182,212,0.15)',
          borderRadius:6, padding:'3px 8px',
        }}>{label}</span>
      ))}
    </div>
  );
}

export default NetworkCanvas;

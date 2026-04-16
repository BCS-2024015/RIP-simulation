/**
 * ControlPanel.jsx
 *
 * Right-side glassmorphism inspector panel for the RIPv2 Network Simulator.
 *
 * Tabs:
 *  - "Routing Table"  — live RIPv2 routing table for the selected router.
 *  - "Link Info"      — details of the selected link (cost, status).
 *  - "Topology"       — summary metrics for the whole network.
 *
 * Props:
 *  @prop {string|null}  selectedNodeId  — Currently selected router ID.
 *  @prop {string|null}  selectedLinkId  — Currently selected link ID.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTopologyState, useTopologyActions } from '../../context/TopologyContext';
import { useRouting, getTableForNode } from '../../hooks/useRouting';
import { simulateRIPConvergence } from '../../core/algorithms';
import { INFINITY } from '../../core/constants';
import { useTheme } from '../../context/ThemeContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function costDisplay(cost) {
  if (cost === 0) return '—';
  if (cost >= INFINITY) return '∞';
  return cost;
}

function costBadgeClass(cost) {
  if (cost >= INFINITY) return 'text-red-400 bg-red-950/60 border-red-900/50';
  if (cost >= 10)       return 'text-amber-400 bg-amber-950/60 border-amber-900/50';
  return 'text-emerald-400 bg-emerald-950/60 border-emerald-900/50';
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconTable() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="15" height="15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <rect x="2" y="4" width="16" height="13" rx="1.5" />
      <line x1="2" y1="8"  x2="18" y2="8"  />
      <line x1="8" y1="8"  x2="8"  y2="17" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="15" height="15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="4.5"  cy="10" r="2.5" />
      <circle cx="15.5" cy="10" r="2.5" />
      <line   x1="7"    y1="10" x2="13" y2="10" />
    </svg>
  );
}

function IconTopology() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="15" height="15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="10" cy="5"  r="2" />
      <circle cx="3"  cy="15" r="2" />
      <circle cx="17" cy="15" r="2" />
      <line x1="10" y1="7"  x2="4"  y2="13" />
      <line x1="10" y1="7"  x2="16" y2="13" />
      <line x1="5"  y1="15" x2="15" y2="15" />
    </svg>
  );
}

function IconSimulate() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="15" height="15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <polygon points="4,3 16,10 4,17" />
      <line x1="17" y1="4" x2="17" y2="16" />
    </svg>
  );
}

function IconRouter() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="14" height="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="2" y="7" width="13" height="7" rx="1.2" />
      <circle cx="5.5"  cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="8.5"  cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <line x1="5.5"  y1="7" x2="4.5" y2="4" />
      <line x1="8.5"  y1="7" x2="8.5" y2="3.5" />
      <line x1="11.5" y1="7" x2="12.5" y2="4" />
      <circle cx="17" cy="6" r="2" stroke="#4f46e5" />
      <line x1="15" y1="14" x2="17" y2="8" stroke="#4f46e5" />
    </svg>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'routing',  label: 'Routing',  icon: <IconTable />    },
  { id: 'link',     label: 'Link',     icon: <IconLink />     },
  { id: 'topology', label: 'Network',  icon: <IconTopology /> },
  { id: 'simulate', label: 'Simulate', icon: <IconSimulate /> },
];

function TabBar({ activeTab, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Inspector tabs"
      className="flex border-b border-slate-200 dark:border-white/8"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className={[
            'flex-1 flex items-center justify-center gap-1.5 py-2.5',
            'text-[11px] font-semibold tracking-wide',
            'border-b-2 transition-all duration-200 focus:outline-none',
            activeTab === tab.id
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300'
              : 'border-transparent text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600',
          ].join(' ')}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Routing Table tab ─────────────────────────────────────────────────────────

function RoutingTableTab({ selectedNodeId }) {
  const { routingTables, isComputing } = useRouting();
  const table = useMemo(
    () => getTableForNode(routingTables, selectedNodeId ?? ''),
    [routingTables, selectedNodeId]
  );

  // ── No node selected ─────────────────────────────────────────────────────
  if (!selectedNodeId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center" aria-live="polite">
        <div className="w-10 h-10 rounded-full border border-slate-700/60 flex items-center justify-center text-slate-600">
          <IconRouter />
        </div>
        <p className="text-xs text-slate-500 leading-relaxed max-w-[160px]">
          Click a router on the canvas to inspect its routing table
        </p>
      </div>
    );
  }

  // ── Computing ──────────────────────────────────────────────────────────
  if (isComputing) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-indigo-400" aria-live="polite" aria-busy="true">
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
          <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
        </svg>
        <span className="text-xs font-medium">Recalculating…</span>
      </div>
    );
  }

  // ── Table ──────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Selected-node header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-950/30 border-b border-white/6">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-300">
          <IconRouter />
        </span>
        <span className="text-xs font-bold text-indigo-200 tracking-wide">{selectedNodeId}</span>
        <span className="ml-auto text-[10px] text-slate-600 font-mono">RIPv2</span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 px-4 py-1.5 bg-slate-900/40 border-b border-white/4" role="rowgroup" aria-label="Routing table column headers">
        {['Destination', 'Next Hop', 'Cost'].map((col) => (
          <span key={col} className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">
            {col}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div
        id={`tabpanel-routing`}
        role="tabpanel"
        aria-labelledby="tab-routing"
        className="divide-y divide-white/4 overflow-y-auto max-h-[calc(100vh-280px)]"
      >
        {table.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-6">No routes</p>
        ) : (
          table.map((entry) => {
            const isSelf        = entry.cost === 0;
            const isUnreachable = entry.cost >= INFINITY;

            return (
              <div
                key={entry.destination}
                className={[
                  'grid grid-cols-3 items-center px-4 py-2 transition-colors duration-100',
                  isSelf        ? 'bg-indigo-950/20'  :
                  isUnreachable ? 'bg-red-950/10 opacity-60' : 'hover:bg-white/3',
                ].join(' ')}
                role="row"
                aria-label={`Route to ${entry.destination}: next hop ${entry.nextHop ?? 'self'}, cost ${entry.cost}`}
              >
                {/* Destination */}
                <span className={[
                  'text-xs font-mono font-semibold',
                  isSelf        ? 'text-indigo-300' :
                  isUnreachable ? 'text-red-500'    : 'text-slate-200',
                ].join(' ')}>
                  {entry.destination}
                  {isSelf && (
                    <span className="ml-1.5 text-[8px] font-bold uppercase tracking-widest text-indigo-600 align-middle">(self)</span>
                  )}
                </span>

                {/* Next hop */}
                <span className={[
                  'text-xs font-mono',
                  isUnreachable ? 'text-red-600 line-through decoration-red-800' : 'text-slate-400',
                ].join(' ')}>
                  {isSelf ? '—' : (entry.nextHop ?? '—')}
                </span>

                {/* Cost badge */}
                <span>
                  <span className={`
                    inline-flex items-center justify-center
                    min-w-[28px] px-1.5 py-0.5 rounded-md
                    text-[10px] font-bold font-mono
                    border ${costBadgeClass(entry.cost)}
                  `}>
                    {costDisplay(entry.cost)}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Link Info tab ─────────────────────────────────────────────────────────────

function LinkInfoTab({ selectedLinkId }) {
  const { links, nodes } = useTopologyState();
  const { toggleLinkFail, deleteLink } = useTopologyActions();

  const link = useMemo(
    () => links.find((l) => l.id === selectedLinkId) ?? null,
    [links, selectedLinkId]
  );

  const srcNode = useMemo(() => nodes.find((n) => n.id === link?.sourceNodeId), [nodes, link]);
  const tgtNode = useMemo(() => nodes.find((n) => n.id === link?.targetNodeId), [nodes, link]);

  if (!selectedLinkId || !link) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center" aria-live="polite">
        <div className="w-10 h-10 rounded-full border border-slate-700/60 flex items-center justify-center text-slate-600">
          <IconLink />
        </div>
        <p className="text-xs text-slate-500 leading-relaxed max-w-[160px]">
          Click a link line on the canvas to inspect it
        </p>
      </div>
    );
  }

  const isFailed = link.status === 'failed';

  return (
    <div
      id="tabpanel-link"
      role="tabpanel"
      aria-labelledby="tab-link"
      className="p-4 flex flex-col gap-4"
    >
      {/* Status pill */}
      <div className="flex items-center gap-2">
        <span className={`
          inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border
          ${isFailed ? 'bg-red-950/50 text-red-400 border-red-800/50' : 'bg-emerald-950/50 text-emerald-400 border-emerald-800/50'}
        `}>
          <span className={`w-1.5 h-1.5 rounded-full ${isFailed ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
          {isFailed ? 'Failed' : 'Active'}
        </span>
        <span className="ml-auto text-[10px] text-slate-600 font-mono">{link.id}</span>
      </div>

      {/* Endpoint info */}
      <div className="rounded-xl border border-white/8 overflow-hidden">
        <div className="px-3 py-2 bg-slate-900/40 border-b border-white/5 text-[9px] font-bold uppercase tracking-widest text-slate-600">
          Endpoints
        </div>
        <div className="grid grid-cols-3 items-center px-4 py-3 gap-2">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Source</span>
            <span className="font-mono font-bold text-sm text-indigo-300">{link.sourceNodeId}</span>
          </div>
          {/* Arrow */}
          <div className="flex items-center justify-center text-slate-600">
            <svg width="32" height="14" viewBox="0 0 32 14" fill="none" aria-hidden="true">
              <line x1="2" y1="7" x2="28" y2="7" stroke="currentColor" strokeWidth="1.5" strokeDasharray={isFailed ? '3 2' : undefined} />
              <polyline points="22,3 28,7 22,11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Target</span>
            <span className="font-mono font-bold text-sm text-indigo-300">{link.targetNodeId}</span>
          </div>
        </div>
      </div>

      {/* Cost */}
      <div className="flex items-center justify-between rounded-xl border border-white/8 bg-slate-900/30 px-4 py-3">
        <span className="text-xs text-slate-500 font-medium">Metric / Cost</span>
        <span className={`text-xl font-bold font-mono ${isFailed ? 'text-red-400' : 'text-emerald-400'}`}>
          {isFailed ? '∞' : link.cost}
        </span>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-auto">
        <button
          id={`link-toggle-fail-${link.id}`}
          onClick={() => toggleLinkFail(link.id)}
          className={`
            w-full py-2 px-4 rounded-xl text-xs font-bold tracking-wide border transition-all duration-200
            ${isFailed
              ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-400 hover:bg-emerald-900/40 hover:border-emerald-600/50'
              : 'bg-red-950/40   border-red-800/40   text-red-400   hover:bg-red-900/40   hover:border-red-600/50'}
          `}
        >
          {isFailed ? 'Restore Link' : 'Simulate Failure'}
        </button>

        <button
          id={`link-delete-${link.id}`}
          onClick={() => deleteLink(link.id)}
          className="w-full py-2 px-4 rounded-xl text-xs font-bold tracking-wide border border-slate-800/60 text-slate-600 hover:bg-red-950/30 hover:border-red-900/50 hover:text-red-500 transition-all duration-200"
        >
          Remove Link
        </button>
      </div>
    </div>
  );
}

// ── Network / Topology summary tab ────────────────────────────────────────────

function TopologyTab() {
  const { nodes, links } = useTopologyState();
  const { routingTables }  = useRouting();

  const activeLinks  = links.filter((l) => l.status === 'active').length;
  const failedLinks  = links.filter((l) => l.status === 'failed').length;

  // Count total reachable pairs
  const reachablePairs = useMemo(() => {
    let count = 0;
    for (const nodeId of Object.keys(routingTables)) {
      const table = routingTables[nodeId] ?? [];
      count += table.filter((e) => e.cost > 0 && e.cost < INFINITY).length;
    }
    return count;
  }, [routingTables]);

  const totalPairs = nodes.length * Math.max(nodes.length - 1, 0);

  const stats = [
    { label: 'Routers',         value: nodes.length,    color: 'text-indigo-400' },
    { label: 'Active Links',    value: activeLinks,     color: 'text-emerald-400' },
    { label: 'Failed Links',    value: failedLinks,     color: 'text-red-400' },
    { label: 'Reachable Pairs', value: `${reachablePairs} / ${totalPairs}`, color: 'text-amber-400' },
  ];

  return (
    <div
      id="tabpanel-topology"
      role="tabpanel"
      aria-labelledby="tab-topology"
      className="p-4 flex flex-col gap-3"
    >
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-1 rounded-xl border border-white/8 bg-slate-900/30 px-3 py-3"
          >
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{s.label}</span>
            <span className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Per-node reachability summary */}
      {nodes.length > 0 && (
        <div className="rounded-xl border border-white/8 overflow-hidden">
          <div className="px-3 py-2 bg-slate-900/40 border-b border-white/5 text-[9px] font-bold uppercase tracking-widest text-slate-600">
            Per-Router Reachability
          </div>
          <div className="divide-y divide-white/4 max-h-48 overflow-y-auto">
            {nodes.map((node) => {
              const table       = routingTables[node.id] ?? [];
              const reachable   = table.filter((e) => e.cost > 0 && e.cost < INFINITY).length;
              const peers       = nodes.length - 1;
              const pct         = peers > 0 ? Math.round((reachable / peers) * 100) : 100;

              return (
                <div key={node.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="font-mono font-bold text-xs text-indigo-300 w-8">{node.id}</span>
                  {/* Bar */}
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: pct === 100 ? '#10b981' : pct > 50 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 w-10 text-right">
                    {reachable}/{peers}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Simulate / Convergence tab ────────────────────────────────────────────────

function SimulateTab() {
  const { nodes, links } = useTopologyState();

  const activeLinks = useMemo(
    () => links
      .filter((l) => l.status === 'active')
      .map((l) => ({ source: l.sourceNodeId, target: l.targetNodeId, cost: l.cost })),
    [links]
  );

  // Simulation result + round navigator
  const [simResult,    setSimResult]    = useState(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const playRef = useRef(null);

  // ── Run simulation ──────────────────────────────────────────────────
  const runSim = useCallback(() => {
    const result = simulateRIPConvergence(
      nodes.map((n) => ({ id: n.id })),
      activeLinks
    );
    setSimResult(result);
    setCurrentRound(0);
    setIsPlaying(false);
    if (playRef.current) clearInterval(playRef.current);
  }, [nodes, activeLinks]);

  // ── Auto-play ──────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (!simResult) return;
    if (isPlaying) {
      clearInterval(playRef.current);
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      playRef.current = setInterval(() => {
        setCurrentRound((r) => {
          if (r >= simResult.rounds.length - 1) {
            clearInterval(playRef.current);
            setIsPlaying(false);
            return r;
          }
          return r + 1;
        });
      }, 900);
    }
  }, [simResult, isPlaying]);

  // Cleanup interval on unmount
  useEffect(() => () => clearInterval(playRef.current), []);

  // Fire broadcast event whenever a non-zero round is displayed —
  // BroadcastAnimation listens for this and plays the yellow-dot animation.
  useEffect(() => {
    if (simResult && currentRound > 0) {
      window.dispatchEvent(new CustomEvent('rip-broadcast'));
    }
  }, [currentRound, simResult]);

  const round = simResult?.rounds[currentRound];
  const totalRounds = simResult ? simResult.rounds.length - 1 : 0;

  // ── Empty / no topology ────────────────────────────────────────────
  if (!simResult) {
    return (
      <div className="p-4 flex flex-col gap-4">
        <div className="rounded-xl border border-white/8 bg-slate-900/30 p-3 text-[11px] text-slate-500 leading-relaxed">
          <p className="font-bold text-slate-400 mb-1">How it works</p>
          <p>Each <span className="text-indigo-300 font-semibold">round</span> simulates one RIP broadcast cycle — every router sends its distance table to each directly connected neighbour.</p>
          <p className="mt-1.5">Routers learn progressively: <span className="text-cyan-300">Round 1</span> = direct neighbours, <span className="text-cyan-300">Round 2</span> = 2-hop peers, and so on until no table changes (≤ 15 rounds max).</p>
        </div>

        <button
          id="btn-run-simulation"
          onClick={runSim}
          disabled={nodes.length < 2}
          className="
            w-full py-2.5 rounded-xl border text-xs font-bold tracking-wide
            transition-all duration-200
            disabled:border-slate-800/40 disabled:text-slate-700 disabled:cursor-not-allowed
            border-indigo-500/40 text-indigo-300 bg-indigo-950/30
            hover:bg-indigo-900/30 hover:border-indigo-400/60 enabled:hover:shadow-[0_0_12px_rgba(99,102,241,0.3)]
          "
        >
          ▶ Run Convergence Simulation
        </button>

        {nodes.length < 2 && (
          <p className="text-[10px] text-slate-600 text-center">Add at least 2 routers and connect them first</p>
        )}
      </div>
    );
  }

  // ── Results ────────────────────────────────────────────────────────
  return (
    <div id="tabpanel-simulate" role="tabpanel" aria-labelledby="tab-simulate" className="flex flex-col h-full">

      {/* ── Convergence header ──────────────────────────────── */}
      <div className="px-4 py-2.5 bg-emerald-950/25 border-b border-white/6 flex items-center gap-2 shrink-0">
        <span className="text-emerald-400" aria-hidden="true">✓</span>
        <span className="text-xs font-bold text-emerald-300">
          Converged after {simResult.convergedAt} round{simResult.convergedAt !== 1 ? 's' : ''}
        </span>
        <span className="ml-auto text-[9px] text-slate-600 font-mono uppercase tracking-wide">
          {nodes.length} routers
        </span>
      </div>

      {/* ── Round stepper ───────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5 shrink-0">
        <button
          aria-label="Previous round"
          disabled={currentRound === 0}
          onClick={() => { setCurrentRound((r) => Math.max(0, r - 1)); setIsPlaying(false); clearInterval(playRef.current); }}
          className="w-7 h-7 rounded-lg border border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15 disabled:opacity-30 disabled:cursor-not-allowed text-base flex items-center justify-center transition-colors"
        >‹</button>

        {/* Progress bar */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-300"
              style={{ width: totalRounds > 0 ? `${(currentRound / totalRounds) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-[9px] font-mono text-center text-slate-600">
            Round {currentRound} / {totalRounds}
          </span>
        </div>

        <button
          aria-label="Next round"
          disabled={currentRound >= simResult.rounds.length - 1}
          onClick={() => { setCurrentRound((r) => Math.min(simResult.rounds.length - 1, r + 1)); setIsPlaying(false); clearInterval(playRef.current); }}
          className="w-7 h-7 rounded-lg border border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15 disabled:opacity-30 disabled:cursor-not-allowed text-base flex items-center justify-center transition-colors"
        >›</button>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Auto-play'}
          className="w-7 h-7 rounded-lg border border-indigo-500/35 text-indigo-400 hover:border-indigo-400/55 text-sm flex items-center justify-center transition-colors"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
      </div>

      {/* ── Round description ────────────────────────────────── */}
      <div
        aria-live="polite"
        className={`px-4 py-2 text-[11px] leading-relaxed shrink-0 border-b border-white/4 ${
          round?.changedCount === 0 ? 'text-emerald-400' : 'text-slate-400'
        }`}
      >
        {round?.description}
      </div>

      {/* ── Per-router tables for this round ─────────────────── */}
      <div className="overflow-y-auto flex-1">
        {nodes.map((node) => {
          const nodeTable   = round?.tables[node.id] ?? [];
          const nodeChanges = round?.changes[node.id] ?? [];
          const hasChanges  = nodeChanges.length > 0;

          return (
            <div key={node.id} className="border-b border-white/4">
              {/* Node header */}
              <div className={`flex items-center gap-2 px-3 py-1.5 ${
                hasChanges ? 'bg-amber-950/20' : 'bg-slate-900/30'
              }`}>
                <span className="font-mono-jet font-bold text-xs text-indigo-300 w-6">{node.id}</span>
                {hasChanges ? (
                  <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">
                    {nodeChanges.length} update{nodeChanges.length !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-700 uppercase tracking-widest">stable</span>
                )}
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-3 px-3 py-0.5 bg-slate-950/30">
                {['Dest', 'Via', 'Cost'].map((h) => (
                  <span key={h} className="text-[8px] font-bold uppercase tracking-widest text-slate-700">{h}</span>
                ))}
              </div>

              {/* Route rows */}
              {nodeTable.map((entry) => {
                const changed     = nodeChanges.includes(entry.destination);
                const isSelf      = entry.cost === 0;
                const unreachable = entry.cost >= INFINITY;

                return (
                  <div
                    key={entry.destination}
                    className={[
                      'grid grid-cols-3 px-3 py-0.5 text-[10px] font-mono',
                      changed     ? 'bg-amber-950/25 border-l-2 border-amber-500' : '',
                      isSelf      ? 'opacity-30' : '',
                      unreachable && !isSelf ? 'opacity-40' : '',
                    ].join(' ')}
                  >
                    <span className={changed ? 'text-amber-200 font-bold' : unreachable ? 'text-red-600' : 'text-slate-300'}>
                      {entry.destination}
                    </span>
                    <span className="text-slate-500">
                      {entry.nextHop ?? '—'}
                    </span>
                    <span className={changed ? 'text-amber-300 font-bold' : unreachable ? 'text-red-600' : 'text-slate-500'}>
                      {unreachable ? '∞' : isSelf ? '—' : entry.cost}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ── Reset / Re-run ──────────────────────────────────── */}
      <div className="shrink-0 flex gap-2 p-3 border-t border-white/6">
        <button
          onClick={() => { setSimResult(null); setIsPlaying(false); clearInterval(playRef.current); }}
          className="flex-1 py-1.5 rounded-xl border border-slate-800/60 text-slate-600 text-[10px] font-bold hover:border-slate-700 hover:text-slate-400 transition-colors"
        >
          Reset
        </button>
        <button
          id="btn-rerun-simulation"
          onClick={runSim}
          className="flex-1 py-1.5 rounded-xl border border-indigo-500/35 text-indigo-400 text-[10px] font-bold hover:border-indigo-400/55 hover:bg-indigo-950/20 transition-colors"
        >
          Re-run
        </button>
      </div>
    </div>
  );
}

// ── Main ControlPanel ─────────────────────────────────────────────────────────

/**
 * ControlPanel
 */
function ControlPanel({ selectedNodeId, selectedLinkId }) {
  const [activeTab, setActiveTab] = useState('routing');
  const { isDarkMode } = useTheme();
  const dark = isDarkMode;

  const panelStyle = {
    top:           'calc(56px + 16px)',
    maxHeight:     'calc(100vh - 56px - 32px)',
    background:     dark ? 'rgba(2,6,23,0.84)'   : undefined,
    borderColor:    dark ? 'rgba(6,182,212,0.22)' : undefined,
    boxShadow:      dark ? '0 4px 30px rgba(0,0,0,0.65), 0 0 0 1px rgba(6,182,212,0.10)' : undefined,
    backdropFilter: dark ? 'blur(28px)' : undefined,
  };

  return (
    <div
      id="control-panel"
      role="complementary"
      aria-label="Inspector panel"
      className="
        absolute right-4 z-40 w-[400px]
        rounded-2xl border overflow-hidden flex flex-col
        border-slate-200 bg-white/85 backdrop-blur-2xl
        shadow-xl shadow-slate-200/60 transition-all duration-300
      "
      style={panelStyle}
    >
      {/* ── Panel header ──────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-4 py-3 shrink-0"
        style={{ borderBottom: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0' }}
      >
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70"    aria-hidden="true" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70"  aria-hidden="true" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" aria-hidden="true" />
        </div>
        <span className="text-xs font-bold tracking-[0.12em] uppercase ml-1"
          style={{ color: dark ? '#94a3b8' : '#475569' }}>Inspector</span>
        <span className="ml-auto flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest"
          style={{ color: dark ? '#10b981' : '#059669' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
          Live
        </span>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────── */}
      <TabBar activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Tab panels ────────────────────────────────────────────── */}
      <div className="overflow-y-auto flex-1">
        {activeTab === 'routing'  && <RoutingTableTab  selectedNodeId={selectedNodeId} />}
        {activeTab === 'link'     && <LinkInfoTab       selectedLinkId={selectedLinkId} />}
        {activeTab === 'topology' && <TopologyTab />}
        {activeTab === 'simulate' && <SimulateTab />}
      </div>

      {/* ── Footer ───────────────────────────────────── */}
      <div
        className="shrink-0 px-4 py-2 flex items-center gap-2"
        style={{ borderTop: dark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #e2e8f0' }}
      >
        <span className="text-[9px] font-mono" style={{ color: dark ? '#334155' : '#94a3b8' }}>
          Bellman–Ford · max 15 hops
        </span>
        <span className="ml-auto text-[9px] font-mono" style={{ color: dark ? '#334155' : '#94a3b8' }}>RIPv2</span>
      </div>
    </div>
  );
}

export default ControlPanel;


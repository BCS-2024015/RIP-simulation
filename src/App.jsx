/**
 * App.jsx
 *
 * Root application for AetherNet RIPv2 Network Simulator.
 *
 * Boot sequence:
 *   isInitialized = false  →  <IntroScreen> (full-screen white overlay)
 *   isInitialized = true   →  main simulator (canvas + panels)
 *
 * Theme:
 *   ThemeProvider wraps everything and manages isDarkMode + `dark` class
 *   on <html>. Header receives toggleTheme via useTheme().
 *   NetworkCanvas receives isDarkMode to swap its background colour and video.
 */

import React, { useState, useCallback } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { TopologyProvider }         from './context/TopologyContext';
import NetworkCanvas                 from './components/canvas/NetworkCanvas';
import ToolsCard                     from './components/panels/ToolsCard';
import ControlPanel                  from './components/panels/ControlPanel';
import Header                        from './components/ui/Header';
import IntroScreen                   from './components/ui/IntroScreen';

// ── Inner app (needs access to ThemeContext) ──────────────────────────────────

function SimulatorApp() {
  const { isDarkMode } = useTheme();

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedLinkId, setSelectedLinkId] = useState(null);
  const [activeTool,     setActiveTool]     = useState(null);

  const handleNodeSelect = useCallback((id) => setSelectedNodeId(id), []);
  const handleLinkSelect = useCallback((id) => setSelectedLinkId(id), []);
  const handleToolChange = useCallback((tool) => setActiveTool(tool), []);

  return (
    <TopologyProvider>
      <Header />

      <div style={{ paddingTop: '56px', height: '100vh', boxSizing: 'border-box' }}>
        <NetworkCanvas
          activeTool={activeTool}
          isDarkMode={isDarkMode}
          onNodeSelect={handleNodeSelect}
          onLinkSelect={handleLinkSelect}
        />
      </div>

      <ToolsCard onToolChange={handleToolChange} />
      <ControlPanel selectedNodeId={selectedNodeId} selectedLinkId={selectedLinkId} />
    </TopologyProvider>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const handleInitialize = useCallback(() => setIsInitialized(true), []);

  return (
    <ThemeProvider>
      {!isInitialized && <IntroScreen onInitialize={handleInitialize} />}
      <SimulatorApp />
    </ThemeProvider>
  );
}

/**
 * Header.jsx
 *
 * Fixed glassmorphism top-bar — AetherNet Simulator
 * Includes Light / Dark mode toggle (Sun / Moon icon button).
 *
 * Light mode: white/slate background, dark text.
 * Dark mode:  slate-950/60 background, cyan-tinted text.
 */

import React from 'react';
import { useTheme } from '../../context/ThemeContext';

// ── Hex logo ──────────────────────────────────────────────────────────────────

function HexLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <polygon points="14,2 25,8 25,20 14,26 3,20 3,8"
        stroke="#06b6d4" strokeWidth="1.5" fill="rgba(6,182,212,0.08)" />
      <polygon points="14,7 21,11 21,17 14,21 7,17 7,11"
        stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.4" fill="rgba(6,182,212,0.04)" />
      <circle cx="14" cy="14" r="2.5" fill="#06b6d4" />
      {[[-90,2],[18,25],[126,25],[198,3],[270,14]].map(([a,,],i)=>null)}
      <line x1="14" y1="2"  x2="14" y2="7"  stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="25" y1="8"  x2="21" y2="11" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="25" y1="20" x2="21" y2="17" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="14" y1="26" x2="14" y2="21" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="3"  y1="20" x2="7"  y2="17" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="3"  y1="8"  x2="7"  y2="11" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.5" />
    </svg>
  );
}

// ── Sun icon (light mode active) ──────────────────────────────────────────────

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1"  x2="12" y2="3"  />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"  />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1"  y1="12" x2="3"  y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"  />
    </svg>
  );
}

// ── Moon icon (dark mode active) ─────────────────────────────────────────────

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

// ── Theme toggle button ───────────────────────────────────────────────────────

function ThemeToggle() {
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <button
      id="btn-theme-toggle"
      onClick={toggleTheme}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDarkMode ? 'Light mode' : 'Dark mode'}
      className="relative flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
      style={{
        backgroundColor: isDarkMode ? 'rgba(30,41,59,0.6)' : '#f1f5f9',
        borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#cbd5e1',
        color: isDarkMode ? '#cbd5e1' : '#475569',
      }}
    >
      {/* Track */}
      <span className={[
        'relative inline-block w-8 h-4 rounded-full transition-colors duration-300',
        isDarkMode
          ? 'bg-indigo-600'
          : 'bg-amber-400',
      ].join(' ')}>
        {/* Thumb */}
        <span className={[
          'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-300',
          isDarkMode ? 'left-[18px]' : 'left-0.5',
        ].join(' ')} />
      </span>

      {/* Icon */}
      <span className="transition-all duration-200">
        {isDarkMode ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Header() {
  const { isDarkMode } = useTheme();
  const dark = isDarkMode;

  const headerStyle = dark
    ? {
        background:     'rgba(2,6,23,0.75)',
        borderBottom:   '1px solid rgba(6,182,212,0.18)',
        boxShadow:      '0 1px 0 rgba(6,182,212,0.08), 0 4px 24px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(16px)',
      }
    : {};

  return (
    <header
      id="app-header"
      className="
        fixed top-0 left-0 right-0 z-50
        h-14 flex items-center px-5 gap-4
        backdrop-blur-md
        bg-white/80 border-b border-slate-200/80
        shadow-[0_1px_0_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.08)]
        transition-all duration-300
      "
      style={headerStyle}
      role="banner"
    >
      {/* ── Logo + Title ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 select-none">
        <HexLogo />
        <div className="flex flex-col leading-tight">
          <span
            className="text-base font-black tracking-[0.08em] uppercase"
            style={{
              background: 'linear-gradient(90deg, #0891b2 0%, #6366f1 55%, #06b6d4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip:      'text',
              filter:              'drop-shadow(0 0 6px rgba(6,182,212,0.35))',
            }}
          >
            AetherNet
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.20em] text-slate-400 dark:text-slate-600">
            Network Simulator
          </span>
        </div>
      </div>

      {/* ── Divider ────────────────────────────────────────────────────── */}
      <div className="h-6 w-px mx-1 hidden sm:block" style={{ backgroundColor: dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0' }} aria-hidden="true" />

      {/* ── Right side ─────────────────────────────────────────────────── */}
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden md:flex items-center gap-1.5 text-[10px] font-mono" style={{ color: dark ? '#475569' : '#94a3b8' }}>
          <span style={{ color: dark ? '#4f46e5' : '#6366f1' }}>Bellman-Ford</span>
          <span style={{ color: dark ? '#334155' : '#cbd5e1' }}>·</span>
          max 15 hops
        </span>

        {/* Theme toggle */}
        <ThemeToggle />

        <span className="px-2.5 py-1 rounded-lg border text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{
            backgroundColor: dark ? 'rgba(8,145,178,0.2)' : '#f1f5f9',
            borderColor: dark ? 'rgba(21,94,117,0.3)' : '#cbd5e1',
            color: dark ? '#0891b2' : '#64748b',
          }}
        >
          v1.0
        </span>
      </div>
    </header>
  );
}

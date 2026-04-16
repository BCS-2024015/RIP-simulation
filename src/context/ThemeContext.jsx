/**
 * ThemeContext.jsx
 *
 * Provides isDarkMode + toggleTheme to the entire component tree.
 * Default = Light mode (isDarkMode = false).
 *
 * The context also owns the side-effect of toggling the `dark` class
 * on <html> so Tailwind's `dark:` variants activate automatically.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Sync Tailwind `dark` class with state
  useEffect(() => {
    const root = document.documentElement; // <html>
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode((d) => !d);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

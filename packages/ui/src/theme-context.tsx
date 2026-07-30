import { createContext, useContext, type ReactNode } from 'react';
import { orbiTheme, type OrbiTheme } from './index';

const OrbiThemeContext = createContext<OrbiTheme>(orbiTheme);

export function OrbiThemeProvider({ children }: { children: ReactNode }) {
  return <OrbiThemeContext.Provider value={orbiTheme}>{children}</OrbiThemeContext.Provider>;
}

export function useOrbiTheme(): OrbiTheme {
  return useContext(OrbiThemeContext);
}

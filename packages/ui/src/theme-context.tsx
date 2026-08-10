import { createContext, useContext, type ReactNode } from 'react';
import { orbiTheme, type OrbiTheme } from './index';

const OrbiThemeContext = createContext<OrbiTheme>(orbiTheme);

export function OrbiThemeProvider({
  children,
  theme = orbiTheme,
}: {
  children: ReactNode;
  theme?: OrbiTheme;
}) {
  return <OrbiThemeContext.Provider value={theme}>{children}</OrbiThemeContext.Provider>;
}

export function useOrbiTheme(): OrbiTheme {
  return useContext(OrbiThemeContext);
}

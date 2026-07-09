import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { orbiTheme, resolveTheme, type OrbiTheme } from './index';

const OrbiThemeContext = createContext<OrbiTheme>(orbiTheme);

export function OrbiThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const theme = useMemo<OrbiTheme>(() => resolveTheme(scheme), [scheme]);

  return (
    <OrbiThemeContext.Provider value={theme}>{children}</OrbiThemeContext.Provider>
  );
}

export function useOrbiTheme(): OrbiTheme {
  return useContext(OrbiThemeContext);
}

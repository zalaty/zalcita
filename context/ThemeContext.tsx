import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme as staticTheme, type Theme } from '@/theme';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_PREF_STORAGE_KEY = '@zalcita/theme_pref';

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

// Mecanismo REACTIVO de theming — para quien lo consuma (const theme =
// useTheme()), sustituye al import estático `import { theme } from
// '@/theme'`. theme/index.ts NO se toca: sigue exportando exactamente lo
// mismo, así que los 26 archivos que aún importan `theme` directamente
// compilan y se ven igual, sin migrar en este subpaso.
//
// HOY solo existe `lightColors` (la paleta oscura es el paso 3 de modo
// oscuro) — así que este Provider, sea cual sea la preferencia o el
// esquema del sistema, sirve SIEMPRE el theme claro (ver `colors` más
// abajo). Lo que SÍ queda montado ya es la lógica de selección completa
// (preferencia guardada + esquema del sistema vía useColorScheme): cuando
// exista `darkColors`, solo hay que sustituir esa línea, nada de lo demás.
const ThemeContext = createContext<ThemeContextValue>({
  theme: staticTheme,
  preference: 'system',
  setPreference: () => {},
});

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null | undefined
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // Carga la preferencia guardada una vez al montar — mismo patrón que
  // VIEW_STORAGE_KEY en calendario.tsx: si falla o no hay nada guardado,
  // se queda en 'system' (valor inicial del estado).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_PREF_STORAGE_KEY);
        if (!cancelled && isThemePreference(stored)) setPreferenceState(stored);
      } catch {
        // Almacenamiento no disponible (p.ej. navegador con storage
        // bloqueado) — no es crítico, se queda en 'system'.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    AsyncStorage.setItem(THEME_PREF_STORAGE_KEY, next).catch(() => {});
  }

  // 'system' resuelve contra el esquema real del dispositivo; si el
  // sistema no informa esquema (web sin media query resuelta aún, o null
  // durante la carga inicial), se trata como claro.
  const resolvedScheme: 'light' | 'dark' =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  // TODO (paso 3 modo oscuro): cuando exista `darkColors` en
  // theme/colors.ts, cambiar la rama 'dark' de `staticTheme.colors` a
  // `darkColors`. Hoy no hay paleta oscura, así que las dos ramas sirven
  // la misma paleta clara a propósito.
  const colors = resolvedScheme === 'dark' ? staticTheme.colors : staticTheme.colors;

  // Memoizado por `colors`: mientras solo exista una paleta, `colors` es
  // siempre la misma referencia, así que esto no crea un objeto nuevo (ni
  // dispara re-renders) en cada render del Provider.
  const resolvedTheme = useMemo<Theme>(() => ({ ...staticTheme, colors }), [colors]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: resolvedTheme, preference, setPreference }),
    [resolvedTheme, preference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Devuelve el theme ACTUAL con la MISMA forma que el import estático
// (theme.colors.x, theme.spacing.x...) — migrar una pantalla es cambiar
// `import { theme } from '@/theme'` por `const theme = useTheme();`
// dentro del componente, nada más.
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

// Lectura/escritura de la preferencia de tema — para el futuro toggle
// Sistema/Claro/Oscuro de Ajustes (paso 3 de modo oscuro). Sin UI todavía
// que lo consuma.
export function useThemePreference(): { preference: ThemePreference; setPreference: (next: ThemePreference) => void } {
  const { preference, setPreference } = useContext(ThemeContext);
  return { preference, setPreference };
}

// Dominio público de la app (para construir enlaces a mostrar/compartir,
// p. ej. "Tu enlace de reservas" en ajustes/datos.tsx) — mismo patrón que
// EXPO_PUBLIC_SUPABASE_URL en lib/supabase.ts. Con fallback a producción
// (https://zalcita.com) para que no haga falta tener la env var definida en
// local: a diferencia de Supabase, sin esta no hay nada que no pueda
// arrancar, solo un enlace construido con el dominio real por defecto.
export const PUBLIC_APP_URL = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://zalcita.com';

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copia .env.example a .env y rellena los valores de tu proyecto de Supabase.'
  );
}

// Cliente tipado contra el esquema de la base de datos (types/database.ts).
// AsyncStorage guarda la sesión entre reinicios de la app; en web usa el
// almacenamiento por defecto del navegador.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // true: por si algún flujo futuro usa un enlace de confirmación por
    // email (magic link, invitación...) en vez de un código. Hoy
    // registro-negocio.tsx confirma con un código (verifyOtp), no depende
    // de esto. Inocuo en el resto de casos: si la URL no trae parámetros de
    // auth (el caso normal), no hace nada; en nativo no aplica (no hay
    // window.location), así que no afecta al flujo OTP de clientes.
    detectSessionInUrl: true,
  },
});

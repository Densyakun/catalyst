import { createClient } from '@supabase/supabase-js';

// Server-side only Supabase Client with Service Role Key
// This client bypasses RLS and should NEVER be exposed to or imported in the client-side/browser code.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
}

if (!supabaseServiceKey) {
  // We don't throw immediately on import in build environments, but we should log or handle it at runtime
  console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY is not defined. Server-side admin operations will fail.');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

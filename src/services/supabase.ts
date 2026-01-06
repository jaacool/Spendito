import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = supabaseUrl !== '' && supabaseAnonKey !== '';

// Only create client if configured, otherwise export null or a dummy client
export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as unknown as SupabaseClient;

export const SUPABASE_TABLES = {
  TRANSACTIONS: 'transactions',
  CATEGORY_RULES: 'category_rules',
};

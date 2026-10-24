
const SUPABASE_URL = "https://frjgshadefafodahushp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_c_b_diSXFr8qTnD51WCxZw_VNaW0OJS";

if (!window.supabase) {
  throw new Error("Supabase JS library has not loaded.");
}

if (!SUPABASE_URL.startsWith("https://")) {
  throw new Error("Please enter a valid Supabase Project URL.");
}

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

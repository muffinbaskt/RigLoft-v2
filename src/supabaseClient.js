import { createClient } from "@supabase/supabase-js";

// This is your project's public URL and "publishable" key. It's safe for
// this to be visible in the app's code — it's designed to be public and is
// protected by the database's row-level security policy, not secrecy.
const SUPABASE_URL = "https://vwvppivdpxjvmaazcmmg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fiRpkzR_UGEzQT69Vp96qA_TsK_0cyg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

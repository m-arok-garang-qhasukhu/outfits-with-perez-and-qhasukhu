(function () {
  const cfg = window.OPQ_SUPABASE_CONFIG || {};
  const ready = cfg.url && cfg.anonKey && !cfg.url.includes('YOUR_') && !cfg.anonKey.includes('YOUR_');
  window.OPQ_CLOUD = { ready: !!ready };
  if (!ready || !window.supabase) return;
  window.OPQ_SUPABASE = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
})();

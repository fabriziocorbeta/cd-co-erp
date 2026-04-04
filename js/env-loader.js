// ══════════════════════════════════════════
// 🔐 ENV LOADER - Carga variables de entorno
// ══════════════════════════════════════════

(function() {
  if (!window.__ENV__) {
    window.__ENV__ = {};
  }

  if (window.__ENV__.SUPABASE_URL && window.__ENV__.SUPABASE_ANON_KEY) {
    return;
  }

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const sb_url = localStorage.getItem('sb_url');
    const sb_key = localStorage.getItem('sb_key');
    if (sb_url && sb_key) {
      window.__ENV__.SUPABASE_URL = sb_url;
      window.__ENV__.SUPABASE_ANON_KEY = sb_key;
    }
  }
})();

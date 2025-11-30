// Supabase configuration for main store
// These values should be set in the server environment or injected at build time
// For now, we'll try to get them from a config endpoint or use defaults

let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';

// Load Supabase config from server
async function loadSupabaseConfig() {
  try {
    const response = await fetch('/api/config/supabase');
    if (response.ok) {
      const config = await response.json();
      SUPABASE_URL = config.url || '';
      SUPABASE_ANON_KEY = config.anonKey || '';
      console.log('Supabase config loaded from server');
      return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
    }
  } catch (error) {
    console.warn('Could not load Supabase config from server:', error);
  }
  
  // Fallback: try to get from window (if injected by server)
  if (window.SUPABASE_CONFIG) {
    SUPABASE_URL = window.SUPABASE_CONFIG.url || '';
    SUPABASE_ANON_KEY = window.SUPABASE_CONFIG.anonKey || '';
    console.log('Supabase config loaded from window');
    return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
  }
  
  console.error('Supabase configuration not found');
  return { url: '', anonKey: '' };
}

// Initialize Supabase client
let supabaseClient = null;

async function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }
  
  const config = await loadSupabaseConfig();
  
  if (!config.url || !config.anonKey) {
    throw new Error('Supabase configuration is missing. Please configure SUPABASE_URL and SUPABASE_ANON_KEY.');
  }
  
  // Load Supabase JS client from CDN
  if (typeof supabase === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  
  supabaseClient = supabase.createClient(config.url, config.anonKey);
  return supabaseClient;
}





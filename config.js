// ============================================================
// Vibehouse Config — fill these to connect Supabase + optional Firebase
// ============================================================
// 1. Create a free project at https://supabase.com
// 2. Copy Project URL + anon public key from Settings → API
// 3. Paste below. Leave empty to run fully offline (localStorage).

window.VIBEHOUSE_CONFIG = {
  // --- Supabase (primary backend) ---
  SUPABASE_URL: "https://dkconielvzhsvpsenmeg.supabase.co",          // e.g. "https://xxxxxxxx.supabase.co"
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrY29uaWVsdnpoc3Zwc2VubWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NDM4MDMsImV4cCI6MjEwNjUxOTgwM30.q_FUiAipcpjBDcg0aNQDkrBB64Nt6ATomrmaWVL1_4k",     // e.g. "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

  // --- Optional Firebase (if you prefer Auth/Firestore instead) ---
  FIREBASE: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },

  // Feature flags
  USE_SUPABASE: true,        // set false to force localStorage only
  USE_FIREBASE: false,

  // Optional server-side AI endpoints. Keep provider secrets on your server, never in this file.
  IMAGE_API_URL: "",
  VIDEO_API_URL: "",
  CHARACTER_API_URL: ""
};

// Auto-detect if keys are present
window.VIBEHOUSE_CONFIG.SUPABASE_READY =
  !!(window.VIBEHOUSE_CONFIG.SUPABASE_URL && window.VIBEHOUSE_CONFIG.SUPABASE_ANON_KEY);

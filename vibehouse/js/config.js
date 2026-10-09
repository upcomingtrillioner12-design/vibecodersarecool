// ============================================================
// Vibehouse Config
// ============================================================
window.VIBEHOUSE_CONFIG = {
  SUPABASE_URL: "https://dkconielvzhsvpsenmeg.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrY29uaWVsdnpoc3Zwc2VubWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NDM4MDMsImV4cCI6MjEwNjUxOTgwM30.q_FUiAipcpjBDcg0aNQDkrBB64Nt6ATomrmaWVL1_4k",

  FIREBASE: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },

  USE_SUPABASE: true,
  USE_FIREBASE: false,

  // Keep AI endpoints empty (secrets stay on your server)
  IMAGE_API_URL: "",
  VIDEO_API_URL: "",
  CHARACTER_API_URL: ""
};

window.VIBEHOUSE_CONFIG.SUPABASE_READY =
  !!(window.VIBEHOUSE_CONFIG.SUPABASE_URL && window.VIBEHOUSE_CONFIG.SUPABASE_ANON_KEY);

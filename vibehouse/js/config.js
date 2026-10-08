// ============================================================
// Vibehouse Config — Supabase + optional integrations
// ============================================================

window.VIBEHOUSE_CONFIG = {
  // --- Supabase ---
  SUPABASE_URL: "https://dkconielvzhsvpsenmeg.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrY29uaWVsdnpoc3Zwc2VubWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NDM4MDMsImV4cCI6MjEwNjUxOTgwM30.q_FUiAipcpjBDcg0aNQDkrBB64Nt6ATomrmaWVL1_4k",

  // --- Optional Firebase (not used) ---
  FIREBASE: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },

  // Feature flags
  USE_SUPABASE: true,
  USE_FIREBASE: false,

  // Optional server-side AI endpoints (leave blank to use local fallback)
  IMAGE_API_URL: "",
  VIDEO_API_URL: "",
  CHARACTER_API_URL: "",

  // Optional contact + branding
  CONTACT_EMAIL: "upcomingtrillioner12@gmail.com",
  BRAND_NAME: "vibecodersarecool"
};

// Auto-detect if keys are present — recomputed every read so it can't go stale
Object.defineProperty(window.VIBEHOUSE_CONFIG, "SUPABASE_READY", {
  get: function () {
    return !!(this.SUPABASE_URL && this.SUPABASE_ANON_KEY && this.USE_SUPABASE);
  }
});

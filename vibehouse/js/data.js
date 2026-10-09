// ============================================================
// Vibehouse – reference data only
// Live products, profiles, tasks and stats come from Supabase.
// ============================================================

const STATS = {
  tools: 0,
  devices: 0,
  robots: 0,
  news: 0,
  videos: 0,
  models: 0,
  companies: 0,
  countries: 0,
  tasks: 0
};

// Empty – never used as source of truth
const TASKS_DEFAULT = [];
const NEWS = [];
const PRODUCTS = []; // populated at runtime from Supabase

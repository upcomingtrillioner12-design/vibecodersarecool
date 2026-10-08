// ============================================================
// Vibehouse Store — products cache. Single source of truth.
// Cloud (Supabase) → seed (data.js) → empty.
// ============================================================

window.Store = {
  products: [],
  news: [],
  _ready: false,
  _client: null,
  _lastSig: "",

  async init() {
    if (this._ready) return true;
    this._client = (window.VibeBackend && window.VibeBackend.client) ? window.VibeBackend.client() : null;

    if (!this._client) {
      // No backend. Seed only. This is a fallback, not the intended mode.
      this.products = [...(window.PRODUCTS || [])];
      this.news = [...(window.NEWS || [])];
      this._ready = true;
      return false;
    }

    try {
      await Promise.race([
        this.reload(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), 3000))
      ]);
    } catch (e) {
      console.warn("[Store] init timeout:", e.message);
      if (!this.products.length) this.products = [...(window.PRODUCTS || [])];
      if (!this.news.length) this.news = [...(window.NEWS || [])];
    }
    this._ready = true;
    return true;
  },

  async reload() {
    if (!this._client) return false;
    const { data, error } = await this._client
      .from("products").select("*").order("created_at", { ascending: false });
    if (error) {
      console.warn("[Store] reload failed:", error.message);
      if (!this.products.length) this.products = [...(window.PRODUCTS || [])];
      return false;
    }
    // Cloud wins. If cloud has rows, they replace seed.
    this.products = (Array.isArray(data) && data.length)
      ? data.map(r => this.normalize(r))
      : [...(window.PRODUCTS || [])];
    this.news = [...(window.NEWS || [])];
    return true;
  },

  normalize(row) {
    return {
      id: row.id,
      slug: row.slug || row.id,
      name: row.name,
      type: row.type || "Web App",
      category: row.category || "Other",
      price: row.price || "Free",
      priceValue: Number(row.price_value) || 0,
      desc: row.desc_short || "",
      longDesc: row.long_desc || row.desc_short || "",
      owner: row.owner_name || "Maker",
      ownerId: row.owner_id || null,
      ownerRole: row.owner_role || "",
      ownerBio: row.owner_bio || "",
      tags: row.tags || [],
      features: row.features || [],
      intro: row.intro || "",
      status: row.status || "live",
      users: row.users_count || 0,
      rating: row.rating || 0,
      launched: row.launched || "",
      logoUrl: row.logo_url || null,
      logoColor: row.logo_color || null,
      ownerAvatarUrl: row.owner_avatar_url || null,
      ownerColor: row.owner_color || null,
      video: row.video_url || null,
      pdf: row.pdf_url || null,
      screenshots: row.screenshots || [],
      _fromCloud: true
    };
  },

  findProduct(id) {
    if (!id) return null;
    const decoded = decodeURIComponent(id);
    return this.products.find(p =>
      p.id === decoded ||
      p.slug === decoded ||
      String(p.id).toLowerCase() === String(decoded).toLowerCase()
    );
  },

  // Match by UUID only. Never by name. Names change; IDs don't.
  productsByOwner(ownerId) {
    if (!ownerId) return [];
    const target = String(decodeURIComponent(ownerId)).toLowerCase();
    return this.products.filter(p => String(p.ownerId || "").toLowerCase() === target);
  },

  async updateProduct(id, patch) {
    if (!this._client) return { ok: false, error: "Backend not connected" };
    const dbPatch = {};
    if (patch.logoUrl !== undefined)     dbPatch.logo_url = patch.logoUrl;
    if (patch.ownerAvatarUrl !== undefined) dbPatch.owner_avatar_url = patch.ownerAvatarUrl;
    if (patch.name !== undefined)        dbPatch.name = patch.name;
    if (patch.desc !== undefined)        dbPatch.desc_short = patch.desc;
    if (patch.longDesc !== undefined)    dbPatch.long_desc = patch.longDesc;

    const { error } = await this._client.from("products").update(dbPatch).eq("id", id);
    if (error) return { ok: false, error: error.message };
    const p = this.findProduct(id);
    if (p) Object.assign(p, patch);
    return { ok: true };
  },

  async createProduct(payload, userId) {
    if (!this._client) return { ok: false, error: "Backend not connected" };
    const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const id = `${slug}-${Date.now().toString(36)}`;

    const row = {
      id, slug,
      name: payload.name,
      type: payload.cat || "Web App",
      category: payload.cat || "Other",
      price: payload.price || "Free",
      price_value: 0,
      desc_short: payload.desc,
      long_desc: payload.long || payload.desc,
      owner_name: payload.maker,
      owner_id: userId || null,
      owner_role: "Maker",
      owner_bio: "",
      tags: [], features: [],
      intro: payload.long || payload.desc,
      status: "live",
      launched: new Date().toISOString().slice(0, 10),
      logo_color: window.IconEngine.colorFrom(id),
      owner_color: window.IconEngine.colorFrom((userId || payload.maker) + "o")
    };

    const { error } = await this._client.from("products").insert(row);
    if (error) return { ok: false, error: error.message };
    const norm = this.normalize(row);
    this.products.unshift(norm);
    return { ok: true, product: norm };
  },

  async getProfile(userId) {
    return window.VibeBackend.getProfile(userId);
  },

  async getProfileByUsername(username) {
    if (!this._client || !username) return null;
    const { data } = await this._client.from("profiles").select("*").eq("username", username).maybeSingle();
    return data || null;
  }
};

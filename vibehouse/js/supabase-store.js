// ============================================================
// Vibehouse Store — Supabase is the source of truth
// Falls back to data.js PRODUCTS only if Supabase is unreachable
// ============================================================

const Store = {
  products: [],
  news: [],
  _ready: false,
  _client: null,

  async init() {
    if (this._ready) return true;
    this._client = window.VibeBackend?.client?.();
    if (!this._client) {
      this.products = [...(window.PRODUCTS || [])];
      this.news = [...(window.NEWS || [])];
      this._ready = true;
      return false;
    }
    await this.reload();
    this._ready = true;
    return true;
  },

  async reload() {
    if (!this._client) return;
    try {
      const { data, error } = await this._client
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data && data.length) {
        this.products = data.map(this.normalize);
      } else {
        this.products = [...(window.PRODUCTS || [])];
      }
    } catch (e) {
      console.warn("[Store] reload failed, using seed:", e.message);
      this.products = [...(window.PRODUCTS || [])];
    }
    this.news = [...(window.NEWS || [])];
  },

  normalize(row) {
    return {
      id: row.id,
      slug: row.slug || row.id,
      name: row.name,
      type: row.type || "Web App",
      category: row.category || "Productivity",
      price: row.price || "Free",
      priceValue: Number(row.price_value) || 0,
      desc: row.desc_short || "",
      longDesc: row.long_desc || row.desc_short || "",
      owner: row.owner_name || "Unknown",
      ownerId: row.owner_id || row.slug || row.id,
      ownerRole: row.owner_role || "Maker",
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

  productsByOwner(ownerKey) {
    if (!ownerKey) return [];
    const target = String(decodeURIComponent(ownerKey)).toLowerCase();
    return this.products.filter(p => {
      const pid = String(p.ownerId || "").toLowerCase();
      const pslug = String(p.slug || "").toLowerCase();
      const pname = String(p.owner || "").toLowerCase();
      const pnameSlug = pname.replace(/\s+/g, "-");
      return pid === target || pslug === target || pname === target || pnameSlug === target;
    });
  },

  async updateProduct(id, patch) {
    if (!this._client) {
      const p = this.findProduct(id);
      if (p) Object.assign(p, patch);
      return { ok: true, offline: true };
    }
    const dbPatch = {};
    if (patch.logoUrl !== undefined)        dbPatch.logo_url = patch.logoUrl;
    if (patch.ownerAvatarUrl !== undefined) dbPatch.owner_avatar_url = patch.ownerAvatarUrl;
    if (patch.name !== undefined)           dbPatch.name = patch.name;
    if (patch.desc !== undefined)           dbPatch.desc_short = patch.desc;
    if (patch.longDesc !== undefined)       dbPatch.long_desc = patch.longDesc;

    const { error } = await this._client.from("products").update(dbPatch).eq("id", id);
    if (error) return { ok: false, error: error.message };

    const p = this.findProduct(id);
    if (p) Object.assign(p, patch);
    return { ok: true };
  },

  async uploadProductIcon(productId, dataUrl) {
    if (!this._client) return { ok: false, error: "No backend" };
    try {
      const blob = await fetch(dataUrl).then(r => r.blob());
      const ext = (blob.type.split("/")[1] || "png").split("+")[0];
      const path = `${productId}-${Date.now()}.${ext}`;

      const { error: upErr } = await this._client.storage
        .from("product-icons")
        .upload(path, blob, { upsert: true, contentType: blob.type });
      if (upErr) return { ok: false, error: upErr.message };

      const { data: pub } = this._client.storage
        .from("product-icons")
        .getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) return { ok: false, error: "No public URL" };

      const upd = await this.updateProduct(productId, { logoUrl: url });
      if (!upd.ok) return upd;
      return { ok: true, url };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async uploadAvatar(userId, dataUrl) {
    if (!this._client) return { ok: false, error: "No backend" };
    try {
      const blob = await fetch(dataUrl).then(r => r.blob());
      const ext = (blob.type.split("/")[1] || "png").split("+")[0];
      const path = `${userId}-${Date.now()}.${ext}`;

      const { error: upErr } = await this._client.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: blob.type });
      if (upErr) return { ok: false, error: upErr.message };

      const { data: pub } = this._client.storage
        .from("avatars")
        .getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) return { ok: false, error: "No public URL" };

      await this._client.from("profiles").update({ avatar_url: url }).eq("id", userId);
      return { ok: true, url };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async createProduct(payload, userId) {
    if (!this._client) return { ok: false, error: "No backend", offline: true };
    const slug = payload.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const id = `${slug}-${Date.now().toString(36)}`;

    const row = {
      id,
      slug,
      name: payload.name,
      type: payload.cat || "Web App",
      category: payload.cat || "Productivity",
      price: payload.price || "Free",
      price_value: 0,
      desc_short: payload.desc,
      long_desc: payload.long || payload.desc,
      owner_name: payload.maker,
      owner_id: userId || null,
      owner_role: "Maker",
      owner_bio: "",
      tags: [],
      features: [],
      intro: payload.long || payload.desc,
      status: "live",
      launched: new Date().toISOString().slice(0, 10),
      logo_color: IconEngine.colorFrom(id),
      owner_color: IconEngine.colorFrom((userId || payload.maker) + "o")
    };

    const { error } = await this._client.from("products").insert(row);
    if (error) return { ok: false, error: error.message };

    this.products.unshift(this.normalize(row));
    return { ok: true, product: this.normalize(row) };
  },

  async getProfile(userId) {
    if (!this._client || !userId) return null;
    const { data } = await this._client
      .from("profiles").select("*").eq("id", userId).maybeSingle();
    return data || null;
  },

  async getProfileByUsername(username) {
    if (!this._client || !username) return null;
    const { data } = await this._client
      .from("profiles").select("*").eq("username", username).maybeSingle();
    return data || null;
  }
};

window.Store = Store;

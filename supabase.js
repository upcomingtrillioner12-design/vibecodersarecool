// ============================================================
// Vibehouse Backend Layer
// Supabase when configured · localStorage offline fallback
// Covers: auth, profiles, avatars, product logos, waitlist,
//         tasks, submissions, products
// ============================================================

(function () {
  const cfg = window.VIBEHOUSE_CONFIG || {};
  let supabase = null;
  let ready = false;

  async function init() {
    if (!cfg.USE_SUPABASE || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      console.info("[Vibehouse] Offline mode (localStorage). Add keys in js/config.js for Supabase.");
      return false;
    }
    try {
      if (!window.supabase) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const { createClient } = window.supabase;
      supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      ready = true;
      console.info("[Vibehouse] Supabase connected.");
      return true;
    } catch (e) {
      console.warn("[Vibehouse] Supabase init failed:", e);
      return false;
    }
  }

  async function signUp(email, password, name) {
    if (!ready) return { error: "Supabase not configured" };
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name } }
    });
    if (error) return { error: error.message };
    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email,
        full_name: name,
        avatar_letter: (name || email)[0].toUpperCase(),
        tools_count: 0,
        karma: 0
      });
    }
    return { data, user: data.user };
  }

  async function signIn(email, password) {
    if (!ready) return { error: "Supabase not configured" };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { data, user: data.user };
  }

  async function signInWithProvider(provider) {
    if (!ready) return { error: "Social login is not available right now." };
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin }
    });
    if (error) return { error: error.message };
    return { ok: true };
  }

  async function signOut() {
    if (!ready) return;
    await supabase.auth.signOut();
  }

  async function getSession() {
    if (!ready) return null;
    const { data } = await supabase.auth.getSession();
    return data.session;
  }

  async function getProfile(userId) {
    if (!ready) return null;
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    return data;
  }

  async function updateProfile(userId, fields) {
    try {
      const u = JSON.parse(localStorage.getItem("vh_user") || "null");
      if (u && (u.id === userId || !u.id)) {
        Object.assign(u, fields);
        localStorage.setItem("vh_user", JSON.stringify(u));
      }
    } catch (e) {}
    if (!ready) return { ok: true, offline: true };
    const { error } = await supabase.from("profiles").update(fields).eq("id", userId);
    return { ok: !error, error: error && error.message };
  }

  async function uploadAvatar(userId, fileOrDataUrl) {
    if (typeof fileOrDataUrl === "string" && fileOrDataUrl.startsWith("data:")) {
      localStorage.setItem("vh_user_photo", fileOrDataUrl);
      if (!ready) return { ok: true, url: fileOrDataUrl, offline: true };
    }
    if (!ready) return { ok: true, url: fileOrDataUrl, offline: true };
    try {
      let blob = fileOrDataUrl;
      if (typeof fileOrDataUrl === "string") {
        const res = await fetch(fileOrDataUrl);
        blob = await res.blob();
      }
      const path = "avatars/" + userId + ".jpg";
      const { error } = await supabase.storage.from("avatars").upload(path, blob, {
        upsert: true, contentType: "image/jpeg"
      });
      if (error) {
        if (typeof fileOrDataUrl === "string") localStorage.setItem("vh_user_photo", fileOrDataUrl);
        return { ok: false, error: error.message, url: fileOrDataUrl };
      }
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = (pub && pub.publicUrl) || fileOrDataUrl;
      await updateProfile(userId, { avatar_url: url });
      localStorage.setItem("vh_user_photo", url);
      return { ok: true, url };
    } catch (e) {
      if (typeof fileOrDataUrl === "string") localStorage.setItem("vh_user_photo", fileOrDataUrl);
      return { ok: true, url: fileOrDataUrl, offline: true };
    }
  }

  async function uploadProductLogo(productId, dataUrl) {
    localStorage.setItem("vh_logo_" + productId, dataUrl);
    if (!ready) return { ok: true, url: dataUrl, offline: true };
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const path = "logos/" + productId + ".jpg";
      const { error } = await supabase.storage.from("logos").upload(path, blob, {
        upsert: true, contentType: "image/jpeg"
      });
      if (error) return { ok: false, error: error.message, url: dataUrl };
      const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
      const url = (pub && pub.publicUrl) || dataUrl;
      await supabase.from("products").update({ logo_url: url }).eq("id", productId);
      return { ok: true, url };
    } catch (e) {
      return { ok: true, url: dataUrl, offline: true };
    }
  }

  async function uploadOwnerAvatar(ownerId, dataUrl) {
    localStorage.setItem("vh_avatar_" + ownerId, dataUrl);
    if (!ready) return { ok: true, url: dataUrl, offline: true };
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const path = "makers/" + ownerId + ".jpg";
      const { error } = await supabase.storage.from("avatars").upload(path, blob, {
        upsert: true, contentType: "image/jpeg"
      });
      if (error) return { ok: false, error: error.message, url: dataUrl };
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      return { ok: true, url: (pub && pub.publicUrl) || dataUrl };
    } catch (e) {
      return { ok: true, url: dataUrl, offline: true };
    }
  }

  async function uploadMedia(file, ownerId) {
    if (!ready) return { ok: false, error: "Cloud storage is not connected" };
    const ext = ((file.name || "").split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = ownerId + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    const { error } = await supabase.storage.from("listing-media").upload(path, file, { contentType: file.type || undefined, upsert: false, cacheControl: "31536000" });
    if (error) return { ok: false, error: error.message };
    const { data: pub } = supabase.storage.from("listing-media").getPublicUrl(path);
    return { ok: true, url: pub.publicUrl, path };
  }

  async function fetchProducts() {
    if (!ready) return null;
    const { data, error } = await supabase.from("products").select("*").order("launched", { ascending: false });
    if (error) return null;
    return data;
  }

  async function toggleWaitlist(productId, userId, join) {
    try {
      const w = JSON.parse(localStorage.getItem("vh_waitlist") || "{}");
      if (join) w[productId] = true; else delete w[productId];
      localStorage.setItem("vh_waitlist", JSON.stringify(w));
    } catch (e) {}
    if (!ready) return { ok: true, offline: true };
    if (join) {
      const { error } = await supabase.from("waitlist").upsert({
        product_id: productId, user_id: userId, created_at: new Date().toISOString()
      });
      return { ok: !error, error: error && error.message };
    }
    const { error } = await supabase.from("waitlist").delete()
      .eq("product_id", productId).eq("user_id", userId);
    return { ok: !error, error: error && error.message };
  }

  async function getUserWaitlist(userId) {
    try {
      const local = JSON.parse(localStorage.getItem("vh_waitlist") || "{}");
      if (!ready) return local;
      const { data } = await supabase.from("waitlist").select("product_id").eq("user_id", userId);
      const map = Object.assign({}, local);
      (data || []).forEach(function (r) { map[r.product_id] = true; });
      return map;
    } catch (e) { return {}; }
  }

  async function submitProduct(payload) {
    try {
      const list = JSON.parse(localStorage.getItem("vh_submissions") || "[]");
      list.push(Object.assign({}, payload, { at: new Date().toISOString() }));
      localStorage.setItem("vh_submissions", JSON.stringify(list));
    } catch (e) {}
    if (!ready) return { ok: true, offline: true };
    const { data, error } = await supabase.from("submissions").insert([{
      name: payload.name,
      description: payload.desc,
      category: payload.cat,
      url: payload.url,
      email: payload.email,
      logo_url: payload.logo || null,
      status: "pending",
      created_at: new Date().toISOString()
    }]).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data };
  }

  async function fetchTasks(userId) {
    try {
      const local = JSON.parse(localStorage.getItem("vh_tasks") || "null");
      if (!ready) return local;
      const { data } = await supabase.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false });
      return (data && data.length) ? data : local;
    } catch (e) { return null; }
  }

  async function saveTask(task) {
    try {
      const list = JSON.parse(localStorage.getItem("vh_tasks") || "[]");
      const i = list.findIndex(function (t) { return t.id === task.id; });
      if (i >= 0) list[i] = task; else list.unshift(task);
      localStorage.setItem("vh_tasks", JSON.stringify(list));
    } catch (e) {}
    if (!ready) return { ok: true, offline: true };
    const { error } = await supabase.from("tasks").upsert(task);
    return { ok: !error, error: error && error.message };
  }

  async function deleteTask(id) {
    try {
      const list = JSON.parse(localStorage.getItem("vh_tasks") || "[]").filter(function (t) { return t.id !== id; });
      localStorage.setItem("vh_tasks", JSON.stringify(list));
    } catch (e) {}
    if (!ready) return { ok: true };
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    return { ok: !error };
  }

  window.VibeBackend = {
    init: init,
    isReady: function () { return ready; },
    client: function () { return supabase; },
    signUp: signUp,
    signIn: signIn,
    signInWithProvider: signInWithProvider,
    signOut: signOut,
    getSession: getSession,
    getProfile: getProfile,
    updateProfile: updateProfile,
    uploadAvatar: uploadAvatar,
    uploadProductLogo: uploadProductLogo,
    uploadOwnerAvatar: uploadOwnerAvatar,
    uploadMedia: uploadMedia,
    fetchProducts: fetchProducts,
    toggleWaitlist: toggleWaitlist,
    getUserWaitlist: getUserWaitlist,
    submitProduct: submitProduct,
    fetchTasks: fetchTasks,
    saveTask: saveTask,
    deleteTask: deleteTask
  };
})();

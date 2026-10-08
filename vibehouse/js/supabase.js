// ============================================================
// Vibehouse Backend — Supabase only.
// localStorage is used ONLY as a <2s bridge; cleared on cloud success.
// ============================================================
(function () {
  const cfg = window.VIBEHOUSE_CONFIG || {};
  let client = null;
  let ready = false;
  let initPromise = null;

  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.supabase) return resolve();
      const s = document.createElement("script");
      const t = setTimeout(() => reject(new Error("SDK timeout")), 8000);
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      s.onload = () => { clearTimeout(t); resolve(); };
      s.onerror = () => { clearTimeout(t); reject(new Error("SDK failed")); };
      document.head.appendChild(s);
    });
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = (async function () {
      if (!cfg.USE_SUPABASE || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
        console.warn("[Vibehouse] Supabase keys missing. Site will run in read-only seed mode.");
        return false;
      }
      try {
        await loadSdk();
        client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" }
        });
        ready = true;
        console.info("[Vibehouse] Supabase connected.");
        return true;
      } catch (e) {
        console.error("[Vibehouse] Supabase init failed:", e);
        return false;
      }
    })();
    return initPromise;
  }

  // ---------- AUTH ----------
  async function signUp(email, password, name) {
    if (!ready) return { error: "Backend not connected" };
    const { data, error } = await client.auth.signUp({
      email, password,
      options: { data: { full_name: name } }
    });
    if (error) return { error: error.message };
    // Profile row is created by the handle_new_user() SQL trigger. We don't
    // insert here to avoid races with the trigger.
    return { data, user: data.user };
  }

  async function signIn(email, password) {
    if (!ready) return { error: "Backend not connected" };
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { data, user: data.user };
  }

  async function signInWithProvider(provider) {
    if (!ready) return { error: "Backend not connected" };
    const { error } = await client.auth.signInWithOAuth({
      provider, options: { redirectTo: window.location.origin }
    });
    if (error) return { error: error.message };
    return { ok: true };
  }

  async function signOut() {
    try { if (ready) await client.auth.signOut(); } catch (e) { console.warn("signOut", e); }
    try {
      Object.keys(localStorage).forEach(k => {
        if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k);
      });
      localStorage.removeItem("vh_user");
    } catch (e) {}
  }

  async function getSession() {
    if (!ready) return null;
    try { const { data } = await client.auth.getSession(); return data.session || null; }
    catch (e) { return null; }
  }

  async function waitForSession(ms) {
    if (!ready) return null;
    const first = await getSession();
    if (first) return first;
    return new Promise(resolve => {
      let done = false, sub = null;
      const finish = s => {
        if (done) return;
        done = true; clearTimeout(timer);
        try { sub && sub.unsubscribe(); } catch (e) {}
        resolve(s || null);
      };
      const timer = setTimeout(() => getSession().then(finish), ms || 5000);
      try {
        const res = client.auth.onAuthStateChange((event, session) => {
          if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) finish(session);
        });
        sub = res && res.data && res.data.subscription;
      } catch (e) { getSession().then(finish); }
    });
  }

  function onAuthChange(cb) {
    if (!ready) return () => {};
    const res = client.auth.onAuthStateChange((event, session) => cb(event, session));
    const sub = res && res.data && res.data.subscription;
    return () => { try { sub && sub.unsubscribe(); } catch (e) {} };
  }

  // ---------- PROFILES ----------
  async function getProfile(userId) {
    if (!ready || !userId) return null;
    try {
      const { data } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data || null;
    } catch (e) { return null; }
  }

  async function updateProfile(userId, fields) {
    if (!ready || !userId) return { ok: false, error: "Backend not connected" };
    // Try UPDATE first. If it matched 0 rows (missing profile or blocked), UPSERT.
    let res = await client.from("profiles").update(fields).eq("id", userId).select("id");
    if (!res.error && !(res.data && res.data.length)) {
      res = await client.from("profiles").upsert(Object.assign({ id: userId }, fields)).select("id");
    }
    if (res.error) return { ok: false, error: res.error.message };
    if (!(res.data && res.data.length)) return { ok: false, error: "Profile row not writable (check RLS policies)" };
    return { ok: true };
  }

  // ---------- STORAGE ----------
  async function uploadAvatar(userId, dataUrl) {
    if (!ready || !userId) return { ok: false, error: "Backend not connected" };
    try {
      const blob = await fetch(dataUrl).then(r => r.blob());
      const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
      const path = `${userId}.${ext}`;
      const { error } = await client.storage.from("avatars").upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "31536000" });
      if (error) return { ok: false, error: error.message };
      const { data: pub } = client.storage.from("avatars").getPublicUrl(path);
      const url = pub && pub.publicUrl ? pub.publicUrl + "?v=" + Date.now() : null;
      if (!url) return { ok: false, error: "No public URL" };
      const saved = await updateProfile(userId, { avatar_url: url });
      if (!saved.ok) return { ok: false, error: "Uploaded but not saved: " + saved.error };
      return { ok: true, url };
    } catch (e) { return { ok: false, error: e.message || "Upload failed" }; }
  }

  async function uploadProductIcon(productId, dataUrl) {
    if (!ready || !productId) return { ok: false, error: "Backend not connected" };
    try {
      const blob = await fetch(dataUrl).then(r => r.blob());
      const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
      const path = `${productId}.${ext}`;
      const { error } = await client.storage.from("product-icons").upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "31536000" });
      if (error) return { ok: false, error: error.message };
      const { data: pub } = client.storage.from("product-icons").getPublicUrl(path);
      const url = pub && pub.publicUrl ? pub.publicUrl + "?v=" + Date.now() : null;
      if (!url) return { ok: false, error: "No public URL" };
      const { error: dbErr } = await client.from("products").update({ logo_url: url }).eq("id", productId);
      if (dbErr) return { ok: false, error: dbErr.message };
      return { ok: true, url };
    } catch (e) { return { ok: false, error: e.message || "Upload failed" }; }
  }

  async function uploadMedia(file, ownerId) {
    if (!ready) return { ok: false, error: "Backend not connected" };
    const ext = ((file.name || "").split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await client.storage.from("listing-media").upload(path, file, {
      contentType: file.type || undefined, upsert: false, cacheControl: "31536000"
    });
    if (error) return { ok: false, error: error.message };
    const { data: pub } = client.storage.from("listing-media").getPublicUrl(path);
    return { ok: true, url: pub.publicUrl, path };
  }

  // ---------- DB ----------
  async function fetchProducts() {
    if (!ready) return null;
    const { data, error } = await client.from("products").select("*").order("created_at", { ascending: false });
    if (error) { console.warn("fetchProducts", error.message); return null; }
    return data;
  }

  async function toggleWaitlist(productId, userId, join) {
    if (!ready) return { ok: false, error: "Backend not connected" };
    if (join) {
      const { error } = await client.from("waitlist").upsert({
        product_id: productId, user_id: userId
      });
      return { ok: !error, error: error && error.message };
    }
    const { error } = await client.from("waitlist").delete()
      .eq("product_id", productId).eq("user_id", userId);
    return { ok: !error, error: error && error.message };
  }

  async function getUserWaitlist(userId) {
    if (!ready || !userId) return {};
    const { data } = await client.from("waitlist").select("product_id").eq("user_id", userId);
    const map = {};
    (data || []).forEach(r => { map[r.product_id] = true; });
    return map;
  }

  async function fetchTasks(userId) {
    if (!ready || !userId) return null;
    const { data } = await client.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    return data || [];
  }

  async function saveTask(task) {
    if (!ready) return { ok: false, error: "Backend not connected" };
    const { error } = await client.from("tasks").upsert(task);
    return { ok: !error, error: error && error.message };
  }

  async function deleteTask(id) {
    if (!ready) return { ok: false, error: "Backend not connected" };
    const { error } = await client.from("tasks").delete().eq("id", id);
    return { ok: !error, error: error && error.message };
  }

  window.VibeBackend = {
    init,
    isReady: () => ready,
    client: () => client,
    signUp, signIn, signInWithProvider, signOut,
    getSession, waitForSession, onAuthChange,
    getProfile, updateProfile,
    uploadAvatar, uploadProductIcon, uploadMedia,
    fetchProducts,
    toggleWaitlist, getUserWaitlist,
    fetchTasks, saveTask, deleteTask
  };
})();

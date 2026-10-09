// ============================================================
// Vibehouse Backend – Supabase only
// ============================================================
(function () {
  const cfg = window.VIBEHOUSE_CONFIG || {};
  let supabase = null;
  let ready = false;
  let initPromise = null;

  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.supabase) return resolve();
      const s = document.createElement("script");
      const timer = setTimeout(() => reject(new Error("Supabase SDK timeout")), 8000);
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      s.onload = () => { clearTimeout(timer); resolve(); };
      s.onerror = () => { clearTimeout(timer); reject(new Error("SDK load failed")); };
      document.head.appendChild(s);
    });
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (!cfg.USE_SUPABASE || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
        console.info("[Vibehouse] Supabase not configured");
        return false;
      }
      try {
        await loadSdk();
        const { createClient } = window.supabase;
        supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        ready = true;
        return true;
      } catch (e) {
        console.warn("[Vibehouse] init failed", e);
        return false;
      }
    })();
    return initPromise;
  }

  // ---------- Auth ----------
  async function signUp(email, password, name) {
    if (!ready) return { error: "Backend not ready" };
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: name } }
    });
    if (error) return { error: error.message };
    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email,
        full_name: name,
        avatar_letter: (name || email)[0].toUpperCase(),
        tools_count: 0,
        karma: 0,
        followers: 0
      }, { onConflict: "id" });
    }
    return { data, user: data.user };
  }

  async function signIn(email, password) {
    if (!ready) return { error: "Backend not ready" };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { data, user: data.user };
  }

  async function signInWithProvider(provider) {
    if (!ready) return { error: "Social login unavailable" };
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin }
    });
    return error ? { error: error.message } : { ok: true };
  }

  async function signOut() {
    if (ready) await supabase.auth.signOut();
  }

  async function getSession() {
    if (!ready) return null;
    const { data } = await supabase.auth.getSession();
    return data.session || null;
  }

  async function waitForSession(timeoutMs = 5000) {
    if (!ready) return null;
    const first = await getSession();
    if (first) return first;
    return new Promise(resolve => {
      let done = false;
      let sub = null;
      const finish = s => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { sub?.unsubscribe(); } catch (_) {}
        resolve(s || null);
      };
      const timer = setTimeout(() => getSession().then(finish), timeoutMs);
      const res = supabase.auth.onAuthStateChange((event, session) => {
        if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
          finish(session);
        }
      });
      sub = res?.data?.subscription;
    });
  }

  function onAuthChange(cb) {
    if (!ready) return () => {};
    const res = supabase.auth.onAuthStateChange((event, session) => cb(event, session));
    const sub = res?.data?.subscription;
    return () => { try { sub?.unsubscribe(); } catch (_) {} };
  }

  // ---------- Profiles ----------
  async function getProfile(userId) {
    if (!ready) return null;
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    return data || null;
  }

  async function updateProfile(userId, fields) {
    if (!ready) return { ok: false, error: "Backend not ready" };
    let res = await supabase.from("profiles").update(fields).eq("id", userId).select("id");
    if (!res.error && !(res.data && res.data.length)) {
      res = await supabase.from("profiles").upsert({ id: userId, ...fields }).select("id");
    }
    if (res.error) return { ok: false, error: res.error.message };
    if (!(res.data && res.data.length)) return { ok: false, error: "Profile row missing or not writable" };
    return { ok: true };
  }

  async function uploadAvatar(userId, fileOrDataUrl) {
    if (!ready) return { ok: false, error: "Backend not ready" };
    try {
      let blob = fileOrDataUrl;
      if (typeof fileOrDataUrl === "string") {
        const res = await fetch(fileOrDataUrl);
        blob = await res.blob();
      }
      const path = `avatars/${userId}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, blob, {
        upsert: true, contentType: "image/jpeg"
      });
      if (error) return { ok: false, error: error.message };
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub?.publicUrl ? `${pub.publicUrl}?v=${Date.now()}` : null;
      if (!url) return { ok: false, error: "Could not get public URL" };
      const saved = await updateProfile(userId, { avatar_url: url });
      if (!saved.ok) return { ok: false, error: "Image uploaded but profile not updated: " + saved.error };
      return { ok: true, url };
    } catch (e) {
      return { ok: false, error: e.message || "Upload failed" };
    }
  }

  // ---------- Media (logos, screenshots, videos) ----------
  async function uploadMedia(file, ownerId) {
    if (!ready) return { ok: false, error: "Cloud storage not connected" };
    const ext = ((file.name || "").split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("listing-media").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
      cacheControl: "31536000"
    });
    if (error) return { ok: false, error: error.message };
    const { data: pub } = supabase.storage.from("listing-media").getPublicUrl(path);
    return { ok: true, url: pub.publicUrl, path };
  }

  async function uploadProductLogo(productId, dataUrl) {
    if (!ready) return { ok: false, error: "Backend not ready" };
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const path = `logos/${productId}.jpg`;
      const { error } = await supabase.storage.from("logos").upload(path, blob, {
        upsert: true, contentType: "image/jpeg"
      });
      if (error) return { ok: false, error: error.message };
      const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
      const url = pub?.publicUrl ? `${pub.publicUrl}?v=${Date.now()}` : null;
      return { ok: true, url };
    } catch (e) {
      return { ok: false, error: e.message || "Upload failed" };
    }
  }

  // ---------- Listings / Products ----------
  async function fetchLiveListings() {
    if (!ready) return [];
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .eq("status", "live")
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[Vibehouse] fetchLiveListings", error);
      return [];
    }
    return data || [];
  }

  async function getListingStats() {
    if (!ready) return {};
    const { data } = await supabase.from("listing_stats").select("*");
    const map = {};
    (data || []).forEach(r => {
      map[r.id] = { views: Number(r.views) || 0, clicks: Number(r.clicks) || 0 };
    });
    return map;
  }

  // ---------- Waitlist ----------
  async function toggleWaitlist(productId, userId, join) {
    if (!ready) return { ok: false, error: "Backend not ready" };
    if (join) {
      const { error } = await supabase.from("waitlist").upsert({
        product_id: productId,
        user_id: userId,
        created_at: new Date().toISOString()
      });
      return { ok: !error, error: error?.message };
    }
    const { error } = await supabase.from("waitlist")
      .delete()
      .eq("product_id", productId)
      .eq("user_id", userId);
    return { ok: !error, error: error?.message };
  }

  async function getUserWaitlist(userId) {
    if (!ready) return {};
    const { data } = await supabase.from("waitlist").select("product_id").eq("user_id", userId);
    const map = {};
    (data || []).forEach(r => { map[r.product_id] = true; });
    return map;
  }

  // ---------- Tasks ----------
  async function fetchTasks(userId) {
    if (!ready) return [];
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    return data || [];
  }

  async function saveTask(task) {
    if (!ready) return { ok: false, error: "Backend not ready" };
    const { error } = await supabase.from("tasks").upsert(task);
    return { ok: !error, error: error?.message };
  }

  async function deleteTask(id) {
    if (!ready) return { ok: false };
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    return { ok: !error };
  }

  // ---------- Follows ----------
  async function followerCount(makerId) {
    if (!ready) return 0;
    const { count } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("maker_id", String(makerId));
    return count ?? 0;
  }

  async function toggleFollow(followerId, makerId, follow) {
    if (!ready) return { ok: false };
    if (follow) {
      const { error } = await supabase.from("follows").insert([{
        follower_id: followerId,
        maker_id: String(makerId)
      }]);
      return { ok: !error };
    }
    const { error } = await supabase.from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("maker_id", String(makerId));
    return { ok: !error };
  }

  // ---------- Public API ----------
  window.VibeBackend = {
    init,
    isReady: () => ready,
    client: () => supabase,
    signUp,
    signIn,
    signInWithProvider,
    signOut,
    getSession,
    waitForSession,
    onAuthChange,
    getProfile,
    updateProfile,
    uploadAvatar,
    uploadMedia,
    uploadProductLogo,
    fetchLiveListings,
    getListingStats,
    toggleWaitlist,
    getUserWaitlist,
    fetchTasks,
    saveTask,
    deleteTask,
    followerCount,
    toggleFollow
  };
})();

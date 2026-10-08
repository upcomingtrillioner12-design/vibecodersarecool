// ============================================================
// Vibehouse Core Application Logic
// ============================================================

const App = {
  user: null,
  waitlist: {},
  tasks: [],
  currentPage: "home",
  searchQuery: "",
  activeFilter: "All",
  backendReady: false,

  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },

  idOf(u) { return u ? String(u.id || u.email || "") : ""; },

  isOAuthReturn() {
    return /[#?&](access_token|refresh_token|code|error)=/.test(location.hash + location.search);
  },

  hasStoredSession() {
    try { return Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)); } catch (e) { return false; }
  },

  cachedUser() {
    try {
      const k = Object.keys(localStorage).find(x => /^sb-.*-auth-token$/.test(x));
      const s = k && JSON.parse(localStorage.getItem(k));
      const su = s && (s.user || (s.currentSession && s.currentSession.user));
      if (su && su.email) return this.buildUser(su, null);
    } catch (e) {}
    return null;
  },

  buildUser(su, profile, fallbackName) {
    const meta = su.user_metadata || {};
    const email = su.email || "";
    const name = profile?.full_name || meta.full_name || meta.name || meta.user_name || fallbackName || email.split("@")[0] || "User";
    return {
      id: su.id,
      name, email,
      avatar: String(profile?.avatar_letter || name[0] || "?").toUpperCase(),
      tools: profile?.tools_count || 0,
      karma: profile?.karma || 0,
      followers: profile?.followers || 0,
      username: profile?.username || "",
      headline: profile?.headline || "",
      website: profile?.website || "",
      twitter: profile?.twitter || "",
      photo: profile?.avatar_url || null,
      joined: profile?.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      bio: profile?.bio || "Vibe coder."
    };
  },

  ensureBackend() {
    if (!this._bp) {
      this._bp = (window.VibeBackend ? Promise.resolve().then(() => window.VibeBackend.init()) : Promise.resolve(false))
        .catch(() => false)
        .then(ok => (this.backendReady = !!ok));
    }
    return this._bp;
  },

  cloudConfigured() {
    const c = window.VIBEHOUSE_CONFIG || {};
    return !!(c.USE_SUPABASE && c.SUPABASE_URL && c.SUPABASE_ANON_KEY);
  },

  async ensureProfile(su, profile) {
    if (profile || !window.VibeBackend?.client) return profile;
    try {
      const client = window.VibeBackend.client();
      if (!client) return profile;
      const meta = su.user_metadata || {};
      const name = meta.full_name || meta.name || meta.user_name || (su.email || "user").split("@")[0];
      const row = { id: su.id, email: su.email, full_name: name, avatar_letter: String(name[0] || "?").toUpperCase(), tools_count: 0, karma: 0 };
      const { error } = await client.from("profiles").upsert(row, { onConflict: "id", ignoreDuplicates: true });
      if (!error) return await window.VibeBackend.getProfile(su.id);
    } catch (e) {}
    return profile;
  },

  async loadCloudData(userId) {
    try {
      this.waitlist = await window.VibeBackend.getUserWaitlist(userId);
      const remoteTasks = await window.VibeBackend.fetchTasks(userId);
      if (remoteTasks?.length) this.tasks = remoteTasks;
    } catch (e) { console.warn("[Vibehouse] loadCloudData failed", e); }
  },

  async init() {
    const oauth = this.isOAuthReturn();

    // ✅ Load products from Supabase FIRST (single source of truth)
    await this.ensureBackend();
    await Store.init();
    window.PRODUCTS = Store.products;
    window.NEWS = Store.news;

    this.loadLocalState();

    if (this.cloudConfigured() && !oauth && !this.hasStoredSession()) {
      this.user = null;
      localStorage.removeItem("vh_user");
    } else if (!this.user) {
      this.user = this.cachedUser();
    }
    if (!this.tasks.length) this.tasks = [...TASKS_DEFAULT];

    this.bindGlobal();
    this.bindNavigation();

    this.ensureBackend().then(ok => {
      if (ok && window.VibeBackend.onAuthChange) {
        window.VibeBackend.onAuthChange(event => {
          if (event === "SIGNED_OUT" && this.user?.id) {
            this.user = null;
            this.saveUser();
            this.updateUserChip();
            this.route();
          }
        });
      }
    });

    const mustWait = oauth || (this.cloudConfigured() && this.hasStoredSession() && !this.user);

    if (mustWait) {
      try {
        await Promise.race([
          this.reconcile({ silent: true, oauth }),
          new Promise(r => setTimeout(r, 6000))
        ]);
      } catch (e) {}
      this.route();
      document.documentElement.classList.remove("booting");
      this.pullData(this.idOf(this.user));
    } else {
      this.route();
      document.documentElement.classList.remove("booting");
      this.reconcile({ oauth: false });
    }
  },

  async syncAuth(opts = {}) {
    const oauth = !!opts.oauth;
    const hadError = /[#?&]error=/.test(location.hash + location.search);
    let confirmed = false;

    try {
      if (window.VibeBackend) {
        await this.ensureBackend();
        if (this.backendReady) {
          const session = oauth ? await window.VibeBackend.waitForSession(5000) : await window.VibeBackend.getSession();
          if (session?.user) {
            confirmed = true;
            let profile = await window.VibeBackend.getProfile(session.user.id);
            profile = await this.ensureProfile(session.user, profile);
            this.user = this.buildUser(session.user, profile);
            await this.loadCloudData(session.user.id);
          } else if (this.user && /^[0-9a-f-]{36}$/i.test(String(this.user.id || ""))) {
            this.user = null;
          }
        }
      }
    } catch (e) { console.warn("[Vibehouse] reconcile failed", e); }

    if (oauth) {
      history.replaceState(null, "", location.pathname);
      if (confirmed && this.user) setTimeout(() => this.toast(`Welcome, ${this.user.name}!`, "success"), 400);
      else if (hadError) setTimeout(() => this.toast("Sign-in failed. Please try again.", "error"), 400);
    }
  },

  async reconcile(opts = {}) {
    const before = this.idOf(this.user);
    await this.syncAuth(opts);
    this.saveUser();
    this.updateUserChip();
    if (opts.silent) return;
    await this.pullData(before);
  },

  async pullData(before) {
    let dataChanged = false;
    try { if (window.VH && VH.pull) dataChanged = await VH.pull(); } catch (e) {}
    if (window.VH && VH.refreshCounts) VH.refreshCounts();
    const idChanged = before !== this.idOf(this.user);
    const liveData = ["home", "search", "dashboard", "profile", "leaderboard", "product"].includes(this.currentPage);
    if (idChanged || (dataChanged && liveData)) this.route();
  },

  go(path) {
    if (!path.startsWith("/")) path = "/" + path;
    if (location.pathname + location.search !== path) {
      history.pushState(null, "", path);
    }
    this.route();
    window.scrollTo(0, 0);
  },

  // ✅ FIXED: matches by ID, username slug, and name slug
  isProductOwner(p) {
    if (!this.user || !p) return false;
    const uid = String(this.user.id || "").toLowerCase();
    const uname = String(this.user.name || "").toLowerCase().trim();
    const unameSlug = uname.replace(/\s+/g, "-");
    const oid = String(p.ownerId || "").toLowerCase();
    const oname = String(p.owner || "").toLowerCase().trim();
    const onameSlug = oname.replace(/\s+/g, "-");
    if (oid && (uid === oid || unameSlug === oid)) return true;
    if (oname && (uname === oname || unameSlug === onameSlug)) return true;
    try {
      const owned = JSON.parse(localStorage.getItem("vh_owned_products") || "[]");
      if (owned.includes(p.id)) return true;
    } catch (e) {}
    return false;
  },

  loadLocalState() {
    try {
      const u = localStorage.getItem("vh_user");
      this.user = u ? JSON.parse(u) : null;
      const w = localStorage.getItem("vh_waitlist");
      this.waitlist = w ? JSON.parse(w) : {};
      const t = localStorage.getItem("vh_tasks");
      this.tasks = t ? JSON.parse(t) : [...TASKS_DEFAULT];
    } catch (e) {
      this.user = null;
      this.waitlist = {};
      this.tasks = [...TASKS_DEFAULT];
    }
  },

  saveUser() {
    try {
      if (this.user) localStorage.setItem("vh_user", JSON.stringify(this.user));
      else localStorage.removeItem("vh_user");
    } catch (e) {}
  },
  saveWaitlist() { try { localStorage.setItem("vh_waitlist", JSON.stringify(this.waitlist)); } catch (e) {} },
  saveTasks()    { try { localStorage.setItem("vh_tasks", JSON.stringify(this.tasks)); } catch (e) {} },

  parsePath() {
    let path = location.pathname.replace(/\/$/, "") || "/";
    if (path.endsWith("index.html")) path = "/";
    const parts = path.split("/").filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
    if (parts.length === 0) return { page: "home", id: null };
    if (parts[0] === "ai" && parts[1]) return { page: "product", id: parts[1] };
    if (parts[0] === "product" && parts[1]) return { page: "product", id: parts[1] };
    if (parts[0] === "profile" && parts[1]) return { page: "profile", id: parts[1] };
    if (parts[0] === "generate-images") return { page: "generate-images", id: null };
    if (parts[0] === "generate-videos") return { page: "generate-videos", id: null };
    const known = ["home", "search", "deals", "leaderboard", "tasks", "minitools", "characters", "map", "prompts", "launch"];
    if (known.includes(parts[0])) return { page: parts[0], id: null };
    return { page: "home", id: null };
  },

  route() {
    const { page, id } = this.parsePath();
    this.currentPage = page;
    document.getElementById("sidebar")?.classList.remove("open");
    document.querySelectorAll(".nav-item").forEach(el => {
      el.classList.toggle("active", el.dataset.page === this.currentPage);
    });
    const content = document.getElementById("content");
    if (!content) return;
    switch (this.currentPage) {
      case "home": this.renderHome(content); break;
      case "search": this.renderSearch(content); break;
      case "deals": this.renderDeals(content); break;
      case "leaderboard": this.renderLeaderboard(content); break;
      case "tasks": this.renderTasks(content); break;
      case "minitools": this.renderMiniTools(content); break;
      case "characters": this.renderCharacters(content); break;
      case "map": this.renderMap(content); break;
      case "prompts": this.renderPrompts(content); break;
      case "launch": this.renderLaunch(content); break;
      case "product": this.renderProduct(content, id); break;
      case "profile": this.renderProfile(content, id); break;
      case "generate-images": this.renderGenerateImages(content); break;
      case "generate-videos": this.renderGenerateVideos(content); break;
      default: this.renderHome(content);
    }
    this.updateUserChip();
  },

  bindNavigation() {
    window.addEventListener("popstate", () => this.route());
    document.addEventListener("click", (e) => {
      const g = e.target.closest("[data-go]");
      if (g) { e.preventDefault(); this.go(g.dataset.go); return; }
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest("a[href]");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#") || a.target === "_blank" || a.hasAttribute("download")) return;
      if (href.startsWith("/") || !href.includes("://")) {
        e.preventDefault();
        this.go(href.startsWith("/") ? href : "/" + href);
      }
    });
  },

  bindGlobal() {
    const searchInput = document.getElementById("globalSearch");
    if (searchInput) {
      searchInput.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          const q = e.target.value.trim();
          if (q) { this.searchQuery = q; App.go("/search"); }
        }
      });
    }
    document.getElementById("btnLogin")?.addEventListener("click", () => this.openAuth("login"));
    document.getElementById("btnSignup")?.addEventListener("click", () => this.openAuth("signup"));
    document.getElementById("btnLogout")?.addEventListener("click", () => this.logout());
    const sbBtn = document.getElementById("sidebarToggle");
    const setSb = open => {
      document.body.classList.toggle("sidebar-open", open);
      sbBtn?.setAttribute("aria-expanded", String(open));
      if (sbBtn) sbBtn.title = open ? "Collapse sidebar" : "Expand sidebar";
    };
    setSb(false);
    sbBtn?.addEventListener("click", e => { e.stopPropagation(); setSb(!document.body.classList.contains("sidebar-open")); });
    document.addEventListener("click", e => {
      if (document.body.classList.contains("sidebar-open") && !e.target.closest("#sidebar")) setSb(false);
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") setSb(false); });
    document.querySelectorAll(".sidebar .nav-item").forEach(n => n.addEventListener("click", () => setSb(false)));
    document.getElementById("menuToggle")?.addEventListener("click", () => {
      document.getElementById("sidebar")?.classList.toggle("open");
    });
    document.getElementById("modalOverlay")?.addEventListener("click", e => {
      if (e.target.id === "modalOverlay") this.closeModal();
    });
    document.getElementById("modalClose")?.addEventListener("click", () => this.closeModal());
  },

  openAuth(mode = "signup") {
    const overlay = document.getElementById("modalOverlay");
    const body = document.getElementById("modalBody");
    if (!overlay || !body) return;

    body.innerHTML = `
      <h2 class="modal-title">${mode === "signup" ? "Create account" : "Log in"}</h2>
      <div class="tabs">
        <button class="tab ${mode === "signup" ? "active" : ""}" data-mode="signup">Sign up</button>
        <button class="tab ${mode === "login" ? "active" : ""}" data-mode="login">Log in</button>
      </div>
      <div class="social-auth">
        <button type="button" class="btn-social" data-provider="google">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
          <span>${mode === "signup" ? "Sign up" : "Continue"} with Google</span>
        </button>
        <button type="button" class="btn-social" data-provider="github">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.7 2.7 1.2 3.3.9.1-.7.4-1.2.7-1.5-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4s2 .1 2.9.4c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>
          <span>${mode === "signup" ? "Sign up" : "Continue"} with GitHub</span>
        </button>
      </div>
      <div class="auth-divider"><span>or use email</span></div>
      <form id="authForm">
        ${mode === "signup" ? `<div class="field"><label>Name</label><input type="text" id="authName" placeholder="Your name" required></div>` : ""}
        <div class="field"><label>Email</label><input type="email" id="authEmail" placeholder="you@example.com" required></div>
        <div class="field"><label>Password</label><input type="password" id="authPass" placeholder="••••••••" required minlength="6"></div>
        <button type="submit" class="btn btn-primary" id="authSubmit" style="width:100%;justify-content:center;margin-top:8px">
          ${mode === "signup" ? "Create my account" : "Log in"}
        </button>
      </form>
      <div class="modal-msg" id="authMsg"></div>
    `;
    overlay.classList.add("open");

    body.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => this.openAuth(tab.dataset.mode)));

    body.querySelectorAll(".btn-social").forEach(btn => {
      btn.addEventListener("click", async () => {
        const msg = document.getElementById("authMsg");
        const fail = t => { msg.textContent = t; msg.style.color = "var(--danger)"; btn.disabled = false; };
        msg.style.color = "var(--text-muted)";
        msg.textContent = "Connecting…";
        btn.disabled = true;
        if (!window.VibeBackend || !this.cloudConfigured()) return fail("Social login isn't set up on this site yet.");
        await this.ensureBackend();
        if (!this.backendReady) return fail("Couldn't reach the login server.");
        msg.textContent = "Redirecting…";
        const r = await window.VibeBackend.signInWithProvider(btn.dataset.provider);
        if (r.error) fail(r.error);
      });
    });

    document.getElementById("authForm").addEventListener("submit", async e => {
      e.preventDefault();
      const submitBtn = document.getElementById("authSubmit");
      const email = document.getElementById("authEmail").value.trim();
      const pass = document.getElementById("authPass").value;
      const name = document.getElementById("authName")?.value.trim() || email.split("@")[0];
      const msg = document.getElementById("authMsg");
      const fail = t => { msg.textContent = t; msg.style.color = "var(--danger)"; if (submitBtn) submitBtn.disabled = false; };
      msg.style.color = "var(--text-muted)";
      msg.textContent = "Working...";
      if (submitBtn) submitBtn.disabled = true;

      await this.ensureBackend();
      if (this.cloudConfigured() && !this.backendReady) return fail("Couldn't reach the server.");

      if (this.backendReady && window.VibeBackend) {
        const result = mode === "signup"
          ? await window.VibeBackend.signUp(email, pass, name)
          : await window.VibeBackend.signIn(email, pass);
        if (result.error) return fail(result.error);
        const user = result.user || result.data?.user;
        if (!user) return fail("Something went wrong. Please try again.");
        if (mode === "signup" && !result.data?.session) {
          msg.style.color = "var(--success)";
          msg.textContent = "Account created. Check your email to confirm, then log in.";
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        let profile = await window.VibeBackend.getProfile(user.id);
        profile = await this.ensureProfile(user, profile);
        this.user = this.buildUser(user, profile, name);
        await this.loadCloudData(user.id);
        this.saveUser();
        this.closeModal();
        this.toast(`Welcome, ${this.user.name}!`, "success");
        this.updateUserChip();
        this.route();
        return;
      }

      this.user = { name, email, avatar: String(name[0] || "?").toUpperCase(), tools: 0, karma: 0, joined: new Date().toISOString().slice(0, 10), bio: "Vibe coder." };
      this.saveUser();
      this.closeModal();
      this.toast(`Welcome, ${name}!`, "success");
      this.updateUserChip();
      this.route();
    });
  },

  async logout() {
    try { if (window.VibeBackend) await window.VibeBackend.signOut(); } catch (e) {}
    this.user = null;
    this.waitlist = {};
    this.tasks = [...TASKS_DEFAULT];
    ["vh_user", "vh_waitlist", "vh_tasks"].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    this.toast("Logged out", "success");
    this.updateUserChip();
    this.route();
  },

  closeModal() { document.getElementById("modalOverlay")?.classList.remove("open"); },

  updateUserChip() {
    document.documentElement.setAttribute("data-auth", this.user ? "user" : "guest");
    const chip = document.getElementById("userChip");
    const loginBtns = document.getElementById("authButtons");
    const logoutBtn = document.getElementById("btnLogout");
    if (!chip || !loginBtns) return;

    if (this.user) {
      chip.style.display = "flex";
      loginBtns.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "inline-flex";
      const av = chip.querySelector(".user-avatar");
      const photo = window.IconEngine ? IconEngine.userPhoto(this.user) : this.user.photo;
      if (av) {
        av.textContent = "";
        if (photo) {
          const img = document.createElement("img");
          img.src = photo;
          img.alt = this.user.name || "";
          av.appendChild(img);
        } else {
          av.textContent = this.user.avatar;
        }
      }
      const nm = chip.querySelector(".user-name");
      const mt = chip.querySelector(".user-meta");
      if (nm) nm.textContent = this.user.name;
      if (mt) mt.textContent = `${this.user.tools || 0} tools · ${this.user.karma || 0} karma`;
    } else {
      chip.style.display = "none";
      loginBtns.style.display = "flex";
      if (logoutBtn) logoutBtn.style.display = "none";
    }
  },

  toast(msg, type = "success") {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = `toast ${type} show`;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove("show"), 2800);
  },

  mono(name) {
    const w = String(name || "?").split(" ");
    return ((w[0][0] || "?") + (w[1] ? w[1][0] : w[0][1] || "")).toUpperCase();
  },

  productLogoHtml(p, sizeClass = "product-logo") {
    const src = (window.IconEngine ? IconEngine.productLogo(p) : null)
      || p.logoUrl
      || p._resolvedLogo;
    const color = p.logoColor || "#6c5ce7";
    if (src) {
      return `<div class="${sizeClass} has-img" style="background:${this.esc(color)}"><img src="${this.esc(src)}" alt="${this.esc(p.name)}" loading="lazy"></div>`;
    }
    const mono = this.mono(p.name);
    return `<div class="${sizeClass}" style="background:${this.esc(color)};color:#fff;border-color:transparent">${this.esc(mono)}</div>`;
  },

  ownerAvatarHtml(p, size = 36) {
    const src = (window.IconEngine ? IconEngine.ownerAvatar(p) : null)
      || p.ownerAvatarUrl
      || p._resolvedAvatar;
    const color = p.ownerColor || "#0984e3";
    const letter = (p.owner || "?")[0].toUpperCase();
    if (src) {
      return `<div class="owner-avatar" style="width:${size}px;height:${size}px;background:${this.esc(color)}"><img src="${this.esc(src)}" alt="${this.esc(p.owner)}" loading="lazy"></div>`;
    }
    return `<div class="owner-avatar" style="width:${size}px;height:${size}px;background:${this.esc(color)}">${this.esc(letter)}</div>`;
  },

  userAvatarHtml(user, sizeClass = "user-avatar") {
    if (!user) return "";
    const letter = (user.avatar || user.name || "?")[0].toUpperCase();
    const photo = (window.IconEngine ? IconEngine.userPhoto(user) : null) || user.photo || localStorage.getItem("vh_user_photo");
    if (photo) return `<div class="${sizeClass}"><img src="${this.esc(photo)}" alt="${this.esc(user.name)}"></div>`;
    const src = window.IconEngine ? IconEngine.avatarSvg(user.name || letter) : null;
    if (src) return `<div class="${sizeClass}"><img src="${this.esc(src)}" alt="${this.esc(user.name)}"></div>`;
    return `<div class="${sizeClass}">${this.esc(letter)}</div>`;
  },

  formatNum(n) {
    n = Number(n) || 0;
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
    return n.toString();
  },

  searchProducts(q) {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return [...Store.products];
    return Store.products.filter(p =>
      [p.name, p.desc, p.owner].some(v => String(v || "").toLowerCase().includes(s)) ||
      (p.tags || []).some(t => String(t).toLowerCase().includes(s))
    );
  },

  // ============================================================
  // PAGE RENDERERS
  // ============================================================

  renderHome(el) {
    el.innerHTML = `
      <div class="page-header home-hero">
        <h1 class="page-title">Vibe coders are cool.</h1>
        <p class="page-sub">The platform for vibe coders.</p>
      </div>

      <div class="filters" id="homeFilters">
        ${["All", "Web App", "AI Agent", "AI Model", "Mobile App", "APK", "Free"].map(f =>
          `<button class="filter-chip ${this.activeFilter === f ? "active" : ""}" data-f="${f}">${f}</button>`
        ).join("")}
      </div>

      <div class="products-list" id="homeProducts"></div>

      <div class="home-company">
        <p class="statement">We run the house. <em>Vibe coders fill it</em> with tools, apps and websites, each one a product you can subscribe to.</p>
      <div class="about-strip">
        <div class="about-item"><div class="about-k">The community</div><p>vibecodersarecool is the community of vibe coders.</p></div>
        <div class="about-item"><div class="about-k">The products</div><p>Tools, apps and websites, each with its own subscription.</p></div>
        <div class="about-item"><div class="about-k">One roof</div><p>One account, one place to pay, one home.</p></div>
      </div>

      <div class="spotlight">
        <div class="spotlight-logo">Dx</div>
        <div class="spotlight-info"><div class="spotlight-name">Daxeon</div><div class="spotlight-desc">Scam protection for Discord communities.</div></div>
        <span class="spotlight-tag">Content moderation</span>
        <button class="btn btn-primary btn-sm" data-go="/ai/daxeon">View →</button>
      </div>

      <div class="action-row">
        <button class="action-btn images" data-go="/generate-images"><span class="icon">🖼</span> Generate images</button>
        <button class="action-btn videos" data-go="/generate-videos"><span class="icon">🎬</span> Generate videos <span class="badge">New</span></button>
      </div>

      <div class="stats-row">
        <div class="stat-chip"><strong>${this.formatNum(STATS.tools)}</strong> Tools</div>
        <div class="stat-chip"><strong>${STATS.devices}</strong> Devices</div>
        <div class="stat-chip"><strong>${STATS.robots}</strong> Robots</div>
        <div class="stat-chip"><strong>${this.formatNum(STATS.news)}</strong> News</div>
        <div class="stat-chip"><strong>${this.formatNum(STATS.videos)}</strong> Videos</div>
        <div class="stat-chip"><strong>${this.formatNum(STATS.models)}</strong> Models</div>
        <div class="stat-chip"><strong>${this.formatNum(STATS.companies)}</strong> Companies</div>
        <div class="stat-chip"><strong>${STATS.countries}</strong> Countries</div>
        <div class="stat-chip"><strong>${this.formatNum(STATS.tasks)}</strong> Tasks</div>
      </div>

      <h2 style="margin:40px 0 16px;font-size:18px;font-weight:700">Latest from the feed</h2>
      <div class="feed" id="homeFeed"></div>
      </div>
    `;

    this.renderProductCards(document.getElementById("homeProducts"), this.getFilteredProducts());
    this.renderFeed(document.getElementById("homeFeed"));

    document.getElementById("homeFilters").addEventListener("click", e => {
      const btn = e.target.closest(".filter-chip");
      if (!btn) return;
      this.activeFilter = btn.dataset.f;
      document.querySelectorAll("#homeFilters .filter-chip").forEach(c => c.classList.toggle("active", c.dataset.f === this.activeFilter));
      this.renderProductCards(document.getElementById("homeProducts"), this.getFilteredProducts());
    });
  },

  getFilteredProducts() {
    let list = [...Store.products];
    if (this.activeFilter === "Free") list = list.filter(p => p.priceValue === 0);
    else if (this.activeFilter !== "All") list = list.filter(p => p.type === this.activeFilter);
    return list;
  },

  // ✅ MERGED: compact row layout from vh-list.js, but rendered here
  renderProductCards(container, list) {
    if (!container) return;
    if (!list || !list.length) {
      container.classList.remove("vh-rows");
      container.innerHTML = `<div class="empty"><h3>No tools match</h3><p>Try a different filter.</p></div>`;
      return;
    }
    container.classList.add("vh-rows");
    container.innerHTML = list.map(p => {
      const free = Number(p.priceValue) === 0;
      const price = free ? "Free" : (p.price || "");
      const cat = p.category || p.type || "";
      return `
      <article class="vh-row" data-go="/ai/${this.esc(encodeURIComponent(p.id))}">
        <div class="vr-logo">${this.productLogoHtml(p)}</div>
        <div class="vr-main">
          <div class="vr-title">
            <span class="vr-name">${this.esc(p.name)}</span>
            ${p.type ? `<span class="vr-chip">${this.esc(p.type)}</span>` : ""}
            ${p.video ? `<span class="vr-chip demo">▶ Demo</span>` : ""}
          </div>
          <p class="vr-desc">${this.esc(p.desc)}</p>
        </div>
        <div class="vr-cat">${this.esc(cat)}</div>
        <div class="vr-owner">
          ${this.ownerAvatarHtml(p, 32)}
          <span class="vr-owner-name">${this.esc(p.owner)}</span>
        </div>
        <div class="vr-price ${free ? "free" : ""}">${this.esc(price)}</div>
      </article>`;
    }).join("");
  },

  renderFeed(container) {
    if (!container) return;
    container.innerHTML = NEWS.map(n => `
      <article class="feed-item">
        <div class="feed-logo">${this.esc(String(n.source || "?")[0])}</div>
        <div class="feed-body">
          <div class="feed-title">${this.esc(n.title)}${n.type === "video" ? `<span class="badge">${this.esc(n.duration || "Video")}</span>` : ""}</div>
          <div class="feed-desc">${this.esc(n.source)}</div>
          <div class="feed-meta">
            <span class="feed-tag">${this.esc(n.tag)}</span>
            <span>${this.esc(n.time)} ago</span>
            <span>▲ ${this.formatNum(n.votes)}</span>
          </div>
        </div>
      </article>
    `).join("");
  },

  renderSearch(el) {
    const q = this.searchQuery || "";
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Search</h1>
        <p class="page-sub">${q ? `Results for "${this.esc(q)}"` : "Search tools, makers, and more"}</p>
      </div>
      <div class="search-box" style="max-width:100%;margin-bottom:24px">
        <svg class="search-icon" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6"/><path d="M14 14l-3-3"/></svg>
        <input type="text" id="pageSearch" value="${this.esc(q)}" placeholder="Search tools, makers, categories...">
      </div>
      <div class="products-grid" id="searchResults"></div>
    `;
    this.renderProductCards(document.getElementById("searchResults"), this.searchProducts(q));
    const input = document.getElementById("pageSearch");
    input?.focus();
    input?.addEventListener("input", e => {
      this.searchQuery = e.target.value.trim();
      this.renderProductCards(document.getElementById("searchResults"), this.searchProducts(this.searchQuery));
    });
  },

  renderProduct(el, id) {
    // ✅ Read from Store (Supabase), fall back to PRODUCTS
    const p = Store.findProduct(id) || PRODUCTS.find(x => x.id === id);
    if (!p) {
      el.innerHTML = `<div class="empty"><h3>Product not found</h3><p><a href="/" style="color:var(--accent)">← Back home</a></p></div>`;
      return;
    }

    const onWaitlist = !!this.waitlist[p.id];
    const ownerSlug = p.ownerId || String(p.owner || "").toLowerCase().replace(/\s+/g, "-");
    const ownerPath = "/profile/" + encodeURIComponent(ownerSlug);
    const isOwner = this.isProductOwner(p);

    el.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="history.back()" style="margin-bottom:20px">← Back</button>

      <div class="detail-hero">
        ${this.productLogoHtml(p, "detail-logo")}
        <div class="detail-info">
          <h1 class="detail-name">${this.esc(p.name)}</h1>
          <div class="detail-type">${this.esc(p.type)} · ${this.esc(p.category)}</div>
          <p class="detail-desc">${this.esc(p.longDesc)}</p>
          <div class="detail-actions">
            <button class="btn btn-primary" id="btnWaitlist">${onWaitlist ? "✓ On waitlist" : "Join waitlist"}</button>
            <button class="btn btn-ghost" data-go="${this.esc(ownerPath)}">View maker</button>
            ${isOwner ? `<button class="btn btn-ghost" id="btnChangeLogo">Change icon</button><input type="file" id="productLogoInput" accept="image/*" style="display:none">` : ""}
            ${p.video ? `<button class="btn btn-ghost" id="btnVideo">Watch demo</button>` : ""}
            ${p.pdf ? `<button class="btn btn-ghost" id="btnPdf">Download PDF</button>` : ""}
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div>
          <div class="card">
            <h3>Features</h3>
            <ul style="display:flex;flex-direction:column;gap:8px">
              ${(p.features || []).map(f => `<li style="display:flex;gap:8px;align-items:center"><span style="color:var(--success)">✓</span> ${this.esc(f)}</li>`).join("")}
            </ul>
          </div>
          <div class="card">
            <h3>Introduction from the maker</h3>
            <p style="font-size:14px;line-height:1.6;color:var(--text-muted)">"${this.esc(p.intro)}"</p>
          </div>
          <div class="card">
            <h3>Tags</h3>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${(p.tags || []).map(t => `<span class="feed-tag">${this.esc(t)}</span>`).join("")}
            </div>
          </div>
        </div>
        <div>
          <div class="card">
            <h3>Maker</h3>
            <div class="maker-card">
              ${this.ownerAvatarHtml(p, 48).replace("owner-avatar", "maker-avatar")}
              <div>
                <div style="font-weight:700">${this.esc(p.owner)}</div>
                <div style="font-size:13px;color:var(--text-muted)">${this.esc(p.ownerRole)}</div>
              </div>
            </div>
            <p style="margin-top:12px;font-size:13px;color:var(--text-muted)">${this.esc(p.ownerBio)}</p>
            ${!isOwner ? `<button class="btn btn-ghost btn-sm" style="margin-top:12px;width:100%;justify-content:center" data-go="${this.esc(ownerPath)}">View full profile</button>` : ""}
          </div>
          <div class="card">
            <h3>Stats</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">
              <div><strong style="display:block;font-size:18px">${this.formatNum(p.users)}</strong> Users</div>
              <div><strong style="display:block;font-size:18px">${this.esc(p.rating)}</strong> Rating</div>
              <div><strong style="display:block;font-size:18px">${this.esc(p.launched)}</strong> Launched</div>
              <div><strong style="display:block;font-size:18px">${this.esc(p.status)}</strong> Status</div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById("btnWaitlist")?.addEventListener("click", async () => {
      if (this.cloudConfigured()) {
        await this.ensureBackend();
        if (!this.user?.id) { this.openAuth("login"); return; }
      }
      const joining = !this.waitlist[p.id];
      const previous = !!this.waitlist[p.id];
      this.waitlist[p.id] = joining;
      this.saveWaitlist();
      const btn = document.getElementById("btnWaitlist"); if (btn) btn.disabled = true;
      if (this.backendReady && this.user?.id && window.VibeBackend) {
        const result = await window.VibeBackend.toggleWaitlist(p.id, this.user.id, joining);
        if (!result?.ok) {
          this.waitlist[p.id] = previous; this.saveWaitlist();
          if (btn) { btn.disabled = false; btn.textContent = previous ? "✓ On waitlist" : "Join waitlist"; }
          this.toast(result?.error || "Could not update waitlist", "error");
          return;
        }
      }
      if (btn) { btn.disabled = false; btn.textContent = joining ? "✓ On waitlist" : "Join waitlist"; }
      this.toast(joining ? `You're on the waitlist for ${p.name}` : "Removed from waitlist", "success");
    });

    // ✅ FIXED: Product icon upload — uses Store, falls back to localStorage
    document.getElementById("btnChangeLogo")?.addEventListener("click", () => {
      document.getElementById("productLogoInput")?.click();
    });
    document.getElementById("productLogoInput")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = window.IconEngine
          ? await IconEngine.fileToDataUrl(file)
          : await new Promise((res, rej) => {
              const r = new FileReader();
              r.onload = () => res(r.result);
              r.onerror = rej;
              r.readAsDataURL(file);
            });

        // 1. Optimistic local update (instant)
        p.logoUrl = dataUrl;
        p._resolvedLogo = dataUrl;
        localStorage.setItem("vh_logo_" + p.id, dataUrl);
        const logoEl = document.querySelector(".detail-logo");
        if (logoEl) logoEl.outerHTML = this.productLogoHtml(p, "detail-logo");

        // 2. Upload to Supabase — persists across refresh & devices
        if (window.Store && Store._client) {
          const res = await Store.uploadProductIcon(p.id, dataUrl);
          if (res.ok && res.url) {
            p.logoUrl = res.url;
            p._resolvedLogo = res.url;
            localStorage.removeItem("vh_logo_" + p.id);
            if (logoEl) logoEl.outerHTML = this.productLogoHtml(p, "detail-logo");
            this.toast("Product icon saved", "success");
          } else {
            this.toast("Saved locally only: " + (res.error || "cloud failed"), "error");
          }
        } else {
          this.toast("Product icon saved locally", "success");
        }
      } catch (err) {
        this.toast("Could not process image", "error");
      }
    });

    document.getElementById("btnVideo")?.addEventListener("click", () => {
      if (!p.video) return this.toast("No demo video is available", "error");
      this.openMediaModal("video", p.video, p.name + " demo");
    });
    document.getElementById("btnPdf")?.addEventListener("click", () => {
      if (!p.pdf) return this.toast("No PDF is available", "error");
      const href = p.pdf.startsWith("http") || p.pdf.startsWith("/") ? p.pdf : "assets/" + p.pdf;
      const a = document.createElement("a"); a.href = href; a.download = p.pdf.split("/").pop();
      document.body.appendChild(a); a.click(); a.remove();
      this.toast("PDF download started", "success");
    });
  },

  openMediaModal(kind, src, title = "Preview") {
    const overlay = document.getElementById("modalOverlay");
    const body = document.getElementById("modalBody");
    if (!overlay || !body) return;
    const safe = this.esc(src);
    const t = this.esc(title);
    body.innerHTML = kind === "video"
      ? `<h2 class="modal-title">${t}</h2><video src="${safe}" controls autoplay playsinline style="width:100%;border-radius:12px;background:#000;max-height:65vh"></video>`
      : `<h2 class="modal-title">${t}</h2><img src="${safe}" alt="${t}" style="width:100%;border-radius:12px">`;
    overlay.classList.add("open");
  },

  // ✅ FIXED: Profile matching by ID OR name slug, uses Store
  renderProfile(el, id) {
    const isMe = id === "me";

    if (isMe && !this.user) {
      el.innerHTML = `
        <div class="empty" style="padding:80px 20px">
          <h3>Sign in to see your profile</h3>
          <p style="margin:12px 0 24px">Your profile, tools and karma live here once you're logged in.</p>
          <button class="btn btn-primary" id="profileLogin">Log in</button>
          <button class="btn btn-ghost" id="profileSignup" style="margin-left:8px">Sign up</button>
        </div>`;
      document.getElementById("profileLogin")?.addEventListener("click", () => this.openAuth("login"));
      document.getElementById("profileSignup")?.addEventListener("click", () => this.openAuth("signup"));
      return;
    }

    const decodedId = decodeURIComponent(id || "");
    const makerProducts = isMe ? [] : Store.productsByOwner(decodedId);
    const maker = makerProducts[0];
    if (!maker && !isMe) {
      el.innerHTML = `<div class="empty"><h3>Profile not found</h3><a href="/" style="color:var(--accent)">← Home</a></div>`;
      return;
    }

    const name = isMe ? this.user.name : (maker?.owner || "Unknown");
    const avatar = isMe ? this.user.avatar : (String(maker?.owner || "?")[0]);
    const bio = isMe ? this.user.bio : (maker?.ownerBio || "");
    const role = isMe ? (this.user.headline || "Vibe Coder") : (maker?.ownerRole || "Vibe Coder");
    const photo = isMe ? (window.IconEngine ? IconEngine.userPhoto(this.user) : this.user.photo) : null;
    const username = isMe ? (this.user.username || "") : (maker?.ownerUsername || "");

    el.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="history.back()" style="margin-bottom:20px">← Back</button>
      <div class="profile-header">
        <div class="profile-avatar" id="profileAvatarBox" style="background:linear-gradient(135deg,var(--accent),#a29bfe);${isMe ? "cursor:pointer" : ""}">
          ${photo ? `<img src="${this.esc(photo)}" alt="${this.esc(name)}" id="profilePhotoImg">` : this.esc(avatar)}
          ${isMe ? `<div class="upload-hint">Change photo</div><input type="file" id="profilePhotoInput" accept="image/*">` : ""}
        </div>
        <div>
          <h1 class="page-title" style="margin-bottom:4px">${this.esc(name)}</h1>
          ${username ? `<p style="color:var(--text-muted);margin-bottom:6px">@${this.esc(username)}</p>` : ""}
          <p style="color:var(--text-muted);margin-bottom:8px">${this.esc(role)}</p>
          <p style="font-size:14px;max-width:480px">${this.esc(bio)}</p>
          <div class="profile-stats">
            <div class="profile-stat"><strong>${isMe ? (this.user.tools || 0) : makerProducts.length}</strong><span>Tools</span></div>
            <div class="profile-stat"><strong>${isMe ? (this.user.karma || 0) : makerProducts.reduce((s, p) => s + (p.users || 0), 0).toLocaleString()}</strong><span>${isMe ? "Karma" : "Total users"}</span></div>
            <div class="profile-stat"><strong>${isMe ? (this.user.followers || 0) : (makerProducts.reduce((s, p) => s + (Number(p.rating) || 0), 0) / (makerProducts.length || 1)).toFixed(1)}</strong><span>${isMe ? "Followers" : "Avg rating"}</span></div>
          </div>
        </div>
      </div>
      <h2 style="font-size:18px;font-weight:700;margin-bottom:16px">Tools by ${this.esc(name)}</h2>
      <div class="products-list" id="profileProducts"></div>
    `;
    this.renderProductCards(document.getElementById("profileProducts"), makerProducts);

    if (isMe) {
      const box = document.getElementById("profileAvatarBox");
      const input = document.getElementById("profilePhotoInput");
      box?.addEventListener("click", () => input?.click());
      input?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith("image/")) {
          this.toast("Please choose an image file", "error");
          return;
        }
        try {
          const dataUrl = window.IconEngine
            ? await IconEngine.fileToDataUrl(file)
            : await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(r.result);
                r.onerror = rej;
                r.readAsDataURL(file);
              });

          // Instant local update
          localStorage.setItem("vh_user_photo", dataUrl);
          if (this.user?.id) localStorage.setItem("vh_user_photo_uid", String(this.user.id));
          if (this.user) { this.user.photo = dataUrl; this.saveUser(); }
          const img = document.getElementById("profilePhotoImg");
          if (img) img.src = dataUrl;
          else if (box) {
            box.innerHTML = `<img src="${this.esc(dataUrl)}" alt="${this.esc(name)}" id="profilePhotoImg"><div class="upload-hint">Change photo</div><input type="file" id="profilePhotoInput" accept="image/*">`;
            const inp2 = document.getElementById("profilePhotoInput");
            inp2?.addEventListener("change", ev => input.dispatchEvent(new Event("change")));
            box.onclick = () => inp2?.click();
          }
          this.updateUserChip();

          // Upload to Supabase
          if (window.Store && Store._client && this.user?.id) {
            const res = await Store.uploadAvatar(this.user.id, dataUrl);
            if (res.ok && res.url) {
              this.user.photo = res.url;
              this.saveUser();
              localStorage.removeItem("vh_user_photo");
              localStorage.removeItem("vh_user_photo_uid");
              const img2 = document.getElementById("profilePhotoImg");
              if (img2) img2.src = res.url;
              this.updateUserChip();
              this.toast("Profile photo saved", "success");
            } else {
              this.toast("Saved locally only: " + (res.error || "cloud failed"), "error");
            }
          } else {
            this.toast("Profile photo saved locally", "success");
          }
        } catch (err) {
          this.toast("Could not process image", "error");
        }
      });
    }
  },

  renderTasks(el) {
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Tasks</h1>
        <p class="page-sub">Your personal build board.</p>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
        <input type="text" id="newTaskInput" placeholder="Add a new task..." style="flex:1;min-width:200px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:10px 14px">
        <button class="btn btn-primary" id="addTaskBtn">Add task</button>
      </div>
      <div class="task-list" id="taskList"></div>
    `;
    const renderList = () => {
      const list = document.getElementById("taskList");
      if (!list) return;
      if (!this.tasks.length) {
        list.innerHTML = `<div class="empty"><h3>No tasks yet</h3><p>Add one above.</p></div>`;
        return;
      }
      list.innerHTML = this.tasks.map(t => `
        <div class="task-item ${t.done ? "done" : ""}" data-id="${this.esc(t.id)}">
          <button class="task-check" aria-label="Toggle">${t.done ? "✓" : ""}</button>
          <div style="flex:1">
            <div class="task-title" style="font-weight:600">${this.esc(t.title)}</div>
            <div style="font-size:12px;color:var(--text-muted)">Due ${this.esc(t.due || "—")}</div>
          </div>
          <button class="btn btn-ghost btn-sm task-del">Delete</button>
        </div>
      `).join("");
      list.querySelectorAll(".task-check").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.closest(".task-item").dataset.id;
          const task = this.tasks.find(t => String(t.id) === id);
          if (task) {
            task.done = !task.done;
            this.saveTasks();
            renderList();
            if (this.backendReady && this.user?.id && window.VibeBackend) {
              await window.VibeBackend.saveTask({ ...task, user_id: this.user.id });
            }
          }
        });
      });
      list.querySelectorAll(".task-del").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.closest(".task-item").dataset.id;
          this.tasks = this.tasks.filter(t => String(t.id) !== id);
          this.saveTasks();
          renderList();
          this.toast("Task deleted", "success");
          if (this.backendReady && this.user?.id && window.VibeBackend) {
            await window.VibeBackend.deleteTask(id);
          }
        });
      });
    };
    renderList();
    const addTask = async () => {
      const input = document.getElementById("newTaskInput");
      const title = input.value.trim();
      if (!title) return;
      const task = { id: "t" + Date.now(), title, done: false, due: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), created_at: new Date().toISOString() };
      this.tasks.unshift(task);
      this.saveTasks();
      input.value = "";
      renderList();
      this.toast("Task added", "success");
      if (this.backendReady && this.user?.id && window.VibeBackend) {
        await window.VibeBackend.saveTask({ ...task, user_id: this.user.id });
      }
    };
    document.getElementById("addTaskBtn")?.addEventListener("click", addTask);
    document.getElementById("newTaskInput")?.addEventListener("keydown", e => { if (e.key === "Enter") addTask(); });
  },

  renderDeals(el) {
    const deals = Store.products.filter(p => p.priceValue === 0 || !p.priceValue);
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Deals</h1>
        <p class="page-sub">Free tools to start with. Great for vibe coders.</p>
      </div>
      <div class="products-grid" id="dealsGrid"></div>
    `;
    this.renderProductCards(document.getElementById("dealsGrid"), deals);
  },

  renderLeaderboard(el) {
    const ranked = [...Store.products].sort((a, b) => (b.users || 0) - (a.users || 0));
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Leaderboard</h1>
        <p class="page-sub">Most used tools on vibecodersarecool right now.</p>
      </div>
      <div class="feed">
        ${ranked.map((p, i) => `
          <article class="feed-item" style="cursor:pointer" data-go="/ai/${this.esc(encodeURIComponent(p.id))}">
            <div style="font-weight:800;font-size:20px;width:36px;text-align:center;color:var(--text-muted)">#${i + 1}</div>
            ${this.productLogoHtml(p, "feed-logo").replace("product-logo", "feed-logo")}
            <div class="feed-body">
              <div class="feed-title">${this.esc(p.name)}</div>
              <div class="feed-desc">${this.esc(p.desc)}</div>
              <div class="feed-meta">
                <span class="feed-tag">${this.esc(p.type)}</span>
                <span>${this.formatNum(p.users)} users</span>
                <span>★ ${this.esc(p.rating)}</span>
              </div>
            </div>
          </article>
        `).join("")}
      </div>
    `;
  },

  renderMiniTools(el) {
    const tools = [
      { key: "contrast", name: "Color Contrast", desc: "Check WCAG contrast between two colors instantly.", action: "Open checker" },
      { key: "json", name: "JSON Formatter", desc: "Paste JSON and get readable output with validation.", action: "Format" },
      { key: "regex", name: "Regex Tester", desc: "Test a regular expression against sample text.", action: "Test regex" },
      { key: "meta", name: "Meta Tag Preview", desc: "Preview a share card from title, description and URL.", action: "Preview" },
      { key: "slug", name: "Slug Generator", desc: "Turn any title into a clean URL slug.", action: "Generate" },
      { key: "lorem", name: "Lorem Ipsum", desc: "Generate useful placeholder copy by paragraph count.", action: "Generate" }
    ];
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Mini Tools</h1><p class="page-sub">Small utilities that work directly in your browser. Nothing is sent anywhere.</p></div><div class="products-grid">${tools.map(t => `
      <div class="product-card"><div class="product-top"><div class="product-logo">${t.name[0]}</div><div class="product-meta"><div class="product-name">${t.name}</div><div class="product-type">Browser utility</div></div></div><p class="product-desc">${t.desc}</p><button class="btn btn-primary btn-sm mini-open" data-tool="${t.key}" style="margin-top:8px">${t.action}</button></div>`).join("")}</div><div id="miniToolPanel"></div>`;
    el.querySelectorAll(".mini-open").forEach(b => b.addEventListener("click", () => this.openMiniTool(b.dataset.tool)));
  },

  openMiniTool(key) {
    const box = document.getElementById("miniToolPanel"); if (!box) return;
    const forms = {
      contrast: `<div class="card" style="margin-top:20px"><h3>Color Contrast</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="field"><label>Foreground</label><input id="mtFg" type="color" value="#ffffff"></div><div class="field"><label>Background</label><input id="mtBg" type="color" value="#111111"></div></div><button class="btn btn-primary" id="mtRun">Check contrast</button><p id="mtOut" class="vh-note" style="margin-top:12px"></p></div>`,
      json: `<div class="card" style="margin-top:20px"><h3>JSON Formatter</h3><textarea id="mtJson" rows="8" placeholder='{"name":"vibehouse","active":true}'></textarea><button class="btn btn-primary" id="mtRun">Format JSON</button><pre id="mtOut" style="margin-top:12px;white-space:pre-wrap"></pre></div>`,
      regex: `<div class="card" style="margin-top:20px"><h3>Regex Tester</h3><input id="mtRegex" placeholder="^[a-z]+$"><textarea id="mtText" rows="5" placeholder="test text"></textarea><button class="btn btn-primary" id="mtRun">Test</button><p id="mtOut" class="vh-note" style="margin-top:12px"></p></div>`,
      meta: `<div class="card" style="margin-top:20px"><h3>Meta Tag Preview</h3><input id="mtTitle" placeholder="Page title"><textarea id="mtDesc" rows="3" placeholder="Description"></textarea><input id="mtUrl" type="url" placeholder="https://example.com"><button class="btn btn-primary" id="mtRun">Preview</button><div id="mtOut" style="margin-top:12px"></div></div>`,
      slug: `<div class="card" style="margin-top:20px"><h3>Slug Generator</h3><input id="mtSlug" placeholder="My awesome new product"><button class="btn btn-primary" id="mtRun">Generate slug</button><p id="mtOut" class="vh-note" style="margin-top:12px"></p></div>`,
      lorem: `<div class="card" style="margin-top:20px"><h3>Lorem Ipsum</h3><select id="mtCount"><option value="1">1 paragraph</option><option value="2">2 paragraphs</option><option value="3">3 paragraphs</option></select><button class="btn btn-primary" id="mtRun">Generate</button><pre id="mtOut" style="margin-top:12px;white-space:pre-wrap"></pre></div>`
    };
    box.innerHTML = forms[key] || "";
    const out = document.getElementById("mtOut"); const btn = document.getElementById("mtRun");
    btn?.addEventListener("click", () => {
      out.style.color = "";
      try {
        if (key === "contrast") { const lum = h => { const c = h.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }; const a = lum(document.getElementById("mtFg").value), b = lum(document.getElementById("mtBg").value); const r = (Math.max(a, b) + .05) / (Math.min(a, b) + .05); out.textContent = `Contrast ratio: ${r.toFixed(2)}:1 — ${r >= 7 ? "AAA normal text" : r >= 4.5 ? "AA normal text" : r >= 3 ? "AA large text only" : "Fails WCAG AA"}`; }
        if (key === "json") { out.textContent = JSON.stringify(JSON.parse(document.getElementById("mtJson").value), null, 2); }
        if (key === "regex") { const re = new RegExp(document.getElementById("mtRegex").value); const text = document.getElementById("mtText").value; const m = text.match(re); out.textContent = m ? `Match found: ${m[0]}` : "No match"; }
        if (key === "meta") { const title = document.getElementById("mtTitle").value || "Untitled"; const desc = document.getElementById("mtDesc").value || "No description"; const url = document.getElementById("mtUrl").value || "https://example.com"; out.innerHTML = `<div class="card"><strong>${this.esc(title)}</strong><p style="color:var(--text-muted);margin:6px 0">${this.esc(desc)}</p><small>${this.esc(url)}</small></div>`; }
        if (key === "slug") { out.textContent = document.getElementById("mtSlug").value.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, ""); }
        if (key === "lorem") { const p = "Vibehouse helps builders turn ideas into useful products with less friction."; out.textContent = Array.from({ length: Number(document.getElementById("mtCount").value) }, () => p).join("\n\n"); }
      } catch (e) { out.textContent = "Invalid input: " + e.message; out.style.color = "var(--danger)"; }
    });
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  },

  renderCharacters(el) {
    const chars = [
      { key: "coach", name: "Vibe Coach", desc: "Helps you ship faster and stay motivated.", mood: "Encouraging" },
      { key: "reviewer", name: "Code Reviewer", desc: "Gives honest, constructive feedback on your code.", mood: "Precise" },
      { key: "copy", name: "Copywriter", desc: "Turns rough notes into clean product copy.", mood: "Creative" },
      { key: "researcher", name: "Researcher", desc: "Turns a question into a structured research plan.", mood: "Curious" }
    ];
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Characters</h1><p class="page-sub">Chat with built-in characters.</p></div><div class="products-grid">${chars.map(c => `<div class="product-card"><div class="product-top"><div class="product-logo">${c.name[0]}</div><div class="product-meta"><div class="product-name">${c.name}</div><div class="product-type">${c.mood}</div></div></div><p class="product-desc">${c.desc}</p><button class="btn btn-primary btn-sm char-open" data-char="${c.key}" style="margin-top:8px">Chat</button></div>`).join("")}</div><div id="characterPanel"></div>`;
    el.querySelectorAll(".char-open").forEach(b => b.addEventListener("click", () => this.openCharacter(b.dataset.char, chars.find(c => c.key === b.dataset.char))));
  },

  openCharacter(key, character) {
    const box = document.getElementById("characterPanel"); if (!box) return;
    box.innerHTML = `<div class="card" style="margin-top:20px"><h3>${character.name}</h3><div id="chatLog" style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow:auto;margin:12px 0"><div class="feed-item"><div class="feed-body"><b>${character.name}</b><div class="feed-desc">I'm ready. Tell me what you're building or what you want reviewed.</div></div></div></div><form id="chatForm" style="display:flex;gap:8px"><input id="chatInput" required placeholder="Message ${character.name}..."><button class="btn btn-primary">Send</button></form></div>`;
    const log = document.getElementById("chatLog"), form = document.getElementById("chatForm");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const input = document.getElementById("chatInput"), text = input.value.trim(); if (!text) return;
      log.insertAdjacentHTML("beforeend", `<div class="feed-item"><div class="feed-body"><b>You</b><div class="feed-desc">${this.esc(text)}</div></div></div>`);
      input.value = "";
      let reply = this.characterFallback(key, text);
      const endpoint = window.VIBEHOUSE_CONFIG?.CHARACTER_API_URL;
      if (endpoint) { try { const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ character: key, message: text }) }); if (!r.ok) throw new Error("API request failed"); const data = await r.json(); reply = data.reply || reply; } catch (err) { this.toast("Character API unavailable; used offline reply", "error"); } }
      log.insertAdjacentHTML("beforeend", `<div class="feed-item"><div class="feed-body"><b>${character.name}</b><div class="feed-desc">${this.esc(reply)}</div></div></div>`);
      log.scrollTop = log.scrollHeight;
    });
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  },

  characterFallback(key, text) {
    const t = text.toLowerCase();
    if (key === "reviewer") return t.includes("bug") || t.includes("error") ? "Paste the smallest failing snippet, the expected behavior, and the actual error." : "Share the code or architecture you want reviewed.";
    if (key === "copy") return "Give me the audience, product, and the one action you want the reader to take.";
    if (key === "researcher") return "Start with the exact question, your deadline, and the sources you trust.";
    return "Pick the smallest shippable version first. Tell me the goal, the user, and what is blocking you right now.";
  },

  renderMap(el) {
    const regions = [{ name: "India", makers: 4, lat: 20.59, lon: 78.96 }, { name: "USA", makers: 3, lat: 39.8, lon: -98.6 }, { name: "Saudi Arabia", makers: 1, lat: 23.9, lon: 45.1 }, { name: "Morocco", makers: 1, lat: 31.8, lon: -7.1 }, { name: "Poland", makers: 1, lat: 51.9, lon: 19.1 }];
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Map</h1><p class="page-sub">Explore maker regions.</p></div><div class="card"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">${regions.map(r => `<button class="btn btn-ghost map-region" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${r.name}"><strong>${r.name}</strong><span style="display:block;color:var(--text-muted)">${r.makers} makers</span></button>`).join("")}</div><p id="mapStatus" class="vh-note" style="margin-top:14px">Choose a region to open its location.</p></div>`;
    el.querySelectorAll(".map-region").forEach(b => b.addEventListener("click", () => { const lat = b.dataset.lat, lon = b.dataset.lon, name = b.dataset.name; document.getElementById("mapStatus").textContent = `Opening ${name} in maps…`; window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`, "_blank", "noopener,noreferrer"); }));
  },

  renderPrompts(el) {
    const prompts = [
      { title: "Product description", text: "Write a short, benefit-focused product description for a SaaS tool that helps freelancers send invoices and chase payments automatically." },
      { title: "Launch tweet", text: "Write a launch announcement tweet for a new AI habit tracker that never resets your streak." },
      { title: "Cold email", text: "Draft a short cold email offering a free trial of a Discord scam-protection bot to a community owner." },
      { title: "Feature prioritization", text: "Given a list of 8 feature requests, help me rank them by impact vs effort for a small team of 2." }
    ];
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Prompts</h1>
        <p class="page-sub">Ready-to-use prompts for builders and marketers.</p>
      </div>
      <div class="feed">
        ${prompts.map((p, i) => `
          <article class="feed-item">
            <div class="feed-logo">${i + 1}</div>
            <div class="feed-body">
              <div class="feed-title">${p.title}</div>
              <div class="feed-desc" style="white-space:pre-wrap">${p.text}</div>
              <button class="btn btn-ghost btn-sm copy-prompt" data-prompt="${encodeURIComponent(p.text)}" style="margin-top:8px">Copy prompt</button>
            </div>
          </article>
        `).join("")}
      </div>
    `;
    el.querySelectorAll(".copy-prompt").forEach(b => b.addEventListener("click", async () => { const text = decodeURIComponent(b.dataset.prompt); try { await navigator.clipboard.writeText(text); this.toast("Copied to clipboard", "success"); } catch (e) { this.toast("Clipboard access was blocked", "error"); } }));
  },

  // ✅ FIXED: Launch writes to Supabase via Store
  renderLaunch(el) {
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Launch your product</h1>
        <p class="page-sub">Get in front of builders and operators. Review typically takes 24–48 hours.</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 320px;gap:28px;align-items:start">
        <div class="card">
          <h3 style="margin-bottom:20px">Submit your tool</h3>
          <form id="launchForm">
            <div class="field"><label>Product name *</label><input type="text" id="launchName" required placeholder="e.g. Invoice Nest" maxlength="80"></div>
            <div class="field"><label>One-line description *</label><input type="text" id="launchDesc" required placeholder="What it does in one clear sentence" maxlength="160"></div>
            <div class="field"><label>Long description</label><textarea id="launchLong" rows="4" placeholder="Tell makers why this exists..."></textarea></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="field"><label>Category *</label>
                <select id="launchCat" required>
                  <option value="">Select...</option>
                  <option>SaaS tool</option><option>Mobile app</option><option>Web app</option>
                  <option>Website</option><option>Chrome extension</option><option>API</option><option>Other</option>
                </select>
              </div>
              <div class="field" style="display:none"><label>Pricing</label><select id="launchPrice"><option>Free</option></select></div>
            </div>
            <div class="field"><label>Website / Demo URL *</label><input type="url" id="launchUrl" required placeholder="https://yoursite.com"></div>
            <div class="field"><label>Logo URL (optional)</label><input type="url" id="launchLogo" placeholder="https://.../logo.png"></div>
            <div class="field"><label>Your name *</label><input type="text" id="launchMaker" required placeholder="How you want to be credited"></div>
            <div class="field"><label>Email *</label><input type="email" id="launchEmail" required placeholder="you@example.com"></div>
            <div class="field"><label>Twitter / X handle (optional)</label><input type="text" id="launchTwitter" placeholder="@yourhandle"></div>
            <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:8px" id="launchSubmitBtn">Submit for review</button>
          </form>
          <div id="launchMsg" class="modal-msg" style="margin-top:14px"></div>
        </div>
        <div>
          <div class="card"><h3>What happens next</h3><ol style="font-size:13px;color:var(--text-muted);line-height:1.7;padding-left:18px"><li>We review your submission (24–48h)</li><li>You'll get an email when it's approved</li><li>Your tool appears on Home + Search</li><li>Makers can join the waitlist / try it</li></ol></div>
          <div class="card"><h3>Tips for approval</h3><ul style="font-size:13px;color:var(--text-muted);line-height:1.7;padding-left:18px"><li>Live demo or clear screenshots</li><li>Honest one-liner (no hype)</li><li>Working signup / contact path</li><li>Built by a real person (not pure agency spam)</li></ul></div>
          <div class="card"><h3>Advertise</h3><p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Want a spotlight slot or homepage feature?</p><button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center" onclick="App.toast('Email launch@vibehouse.com for ad rates','success')">Contact for ads</button></div>
        </div>
      </div>
    `;
    const style = document.createElement("style");
    style.textContent = `@media(max-width:800px){ #content > div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; } }`;
    el.appendChild(style);

    document.getElementById("launchForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      const form = e.target;
      const btn = document.getElementById("launchSubmitBtn");
      const msg = document.getElementById("launchMsg");
      btn.disabled = true;
      btn.textContent = "Submitting...";
      msg.textContent = "";
      msg.style.color = "var(--text-muted)";

      const payload = {
        name: document.getElementById("launchName").value.trim(),
        desc: document.getElementById("launchDesc").value.trim(),
        long: document.getElementById("launchLong").value.trim(),
        cat: document.getElementById("launchCat").value,
        price: document.getElementById("launchPrice").value,
        url: document.getElementById("launchUrl").value.trim(),
        logo: document.getElementById("launchLogo").value.trim(),
        maker: document.getElementById("launchMaker").value.trim(),
        email: document.getElementById("launchEmail").value.trim(),
        twitter: document.getElementById("launchTwitter").value.trim(),
        at: new Date().toISOString()
      };

      let sentToBackend = false;
      let backendError = "";

      if (window.Store && Store._client) {
        const result = await Store.createProduct(payload, this.user?.id || null);
        if (result.ok) {
          sentToBackend = true;
          window.PRODUCTS = Store.products;
        } else {
          backendError = result.error || "Failed";
        }
      }

      if (!sentToBackend) {
        try {
          const subs = JSON.parse(localStorage.getItem("vh_submissions") || "[]");
          subs.push(payload);
          localStorage.setItem("vh_submissions", JSON.stringify(subs));
        } catch (err) {}
        if (backendError) {
          msg.textContent = "Backend error: " + backendError + " — saved locally.";
          msg.style.color = "var(--danger)";
        }
      }

      if (this.user) {
        try {
          const owned = JSON.parse(localStorage.getItem("vh_owned_products") || "[]");
          const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          if (slug && !owned.includes(slug)) {
            owned.push(slug);
            localStorage.setItem("vh_owned_products", JSON.stringify(owned));
          }
        } catch (err) {}
      }

      btn.disabled = false;
      btn.textContent = "Submit for review";
      if (!msg.textContent) {
        msg.style.color = "var(--success)";
        msg.textContent = sentToBackend
          ? `✓ "${payload.name}" submitted. We'll email ${payload.email} when reviewed.`
          : `✓ "${payload.name}" saved.`;
      }
      this.toast(`Submitted: ${payload.name}`, "success");
      form.reset();
    });
  },

  renderGenerateImages(el) {
    el.innerHTML = `
      <div class="page-header"><h1 class="page-title">Generate Images</h1><p class="page-sub">Create a local visual instantly.</p></div>
      <div class="card" style="max-width:720px"><div class="field"><label>Prompt</label><textarea id="imgPrompt" rows="3" placeholder="A cozy cafe interior..."></textarea></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px"><div class="field" style="flex:1;min-width:160px;margin:0"><label>Style</label><select id="imgStyle"><option>Photorealistic</option><option>Illustration</option><option>3D Render</option><option>Watercolor</option></select></div><div class="field" style="flex:1;min-width:160px;margin:0"><label>Aspect</label><select id="imgAspect"><option>1:1</option><option>16:9</option><option>9:16</option><option>4:3</option></select></div></div>
      <button class="btn btn-primary" id="genImgBtn" style="width:100%;justify-content:center">Generate image</button><div id="imgResult" style="margin-top:20px;display:none"></div></div>`;
    document.getElementById("genImgBtn")?.addEventListener("click", async () => {
      const prompt = document.getElementById("imgPrompt").value.trim(); if (!prompt) return this.toast("Enter a prompt first", "error");
      const btn = document.getElementById("genImgBtn"), result = document.getElementById("imgResult"); btn.disabled = true; btn.textContent = "Generating…";
      try {
        const endpoint = window.VIBEHOUSE_CONFIG?.IMAGE_API_URL;
        if (endpoint) {
          const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, style: document.getElementById("imgStyle").value, aspect: document.getElementById("imgAspect").value }) });
          if (!r.ok) throw new Error("Image API request failed");
          const d = await r.json(); const url = d.url || d.image_url; if (!url) throw new Error("Image API returned no image URL");
          const u = this.esc(url);
          result.innerHTML = `<div class="card"><img src="${u}" alt="Generated image" style="width:100%;border-radius:12px"><div style="display:flex;gap:8px;margin-top:12px"><a class="btn btn-ghost" href="${u}" target="_blank" rel="noopener">Open</a></div></div>`;
        } else {
          const [aw, ah] = (document.getElementById("imgAspect").value.split(":").map(Number)); const w = aw === 1 && ah === 1 ? 800 : aw === 16 ? 960 : 600, h = aw === 1 && ah === 1 ? 800 : ah === 16 ? 540 : 960;
          const text = prompt.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); const style = document.getElementById("imgStyle").value;
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#111827"/><stop offset=".55" stop-color="#4f46e5"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * .72}" cy="${h * .28}" r="${Math.min(w, h) * .14}" fill="#fff" opacity=".12"/><text x="${w * .08}" y="${h * .72}" fill="#fff" font-family="Inter,Arial" font-size="${Math.max(22, w / 28)}" font-weight="700">${text.slice(0, 90)}</text><text x="${w * .08}" y="${h * .78}" fill="#fff" opacity=".65" font-family="Inter,Arial" font-size="${Math.max(14, w / 45)}">${style} · local preview</text></svg>`;
          const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
          result.innerHTML = `<div class="card"><img src="${url}" alt="Generated local preview" style="width:100%;border-radius:12px"><div style="display:flex;gap:8px;margin-top:12px"><a class="btn btn-primary" href="${url}" download="vibehouse-image.svg">Download SVG</a></div><p class="vh-note" style="margin-top:8px">Local generator mode.</p></div>`;
        }
        this.toast("Image ready", "success");
      } catch (e) { result.innerHTML = `<div class="card"><p style="color:var(--danger)">${this.esc(e.message)}</p></div>`; this.toast("Image generation failed", "error"); }
      finally { btn.disabled = false; btn.textContent = "Generate image"; result.style.display = "block"; }
    });
  },

  renderGenerateVideos(el) {
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Generate Videos</h1><p class="page-sub">Create a short browser-generated motion preview.</p></div><div class="card" style="max-width:720px"><div class="field"><label>Prompt</label><textarea id="vidPrompt" rows="3" placeholder="A time-lapse of a city skyline..."></textarea></div><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px"><div class="field" style="flex:1;min-width:160px;margin:0"><label>Duration</label><select id="vidDur"><option value="4">4s</option><option value="8">8s</option><option value="12">12s</option></select></div><div class="field" style="flex:1;min-width:160px;margin:0"><label>Resolution</label><select id="vidRes"><option>720p</option><option>1080p</option></select></div></div><button class="btn btn-primary" id="genVidBtn" style="width:100%;justify-content:center">Generate video</button><div id="vidResult" style="margin-top:20px;display:none"></div></div>`;
    document.getElementById("genVidBtn")?.addEventListener("click", async () => {
      const prompt = document.getElementById("vidPrompt").value.trim(); if (!prompt) return this.toast("Enter a prompt first", "error");
      const btn = document.getElementById("genVidBtn"), result = document.getElementById("vidResult"); btn.disabled = true; btn.textContent = "Generating…"; result.style.display = "block";
      try {
        const endpoint = window.VIBEHOUSE_CONFIG?.VIDEO_API_URL;
        if (endpoint) {
          const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, duration: Number(document.getElementById("vidDur").value), resolution: document.getElementById("vidRes").value }) });
          if (!r.ok) throw new Error("Video API request failed");
          const d = await r.json(); const url = d.url || d.video_url; if (!url) throw new Error("Video API returned no video URL");
          result.innerHTML = `<video src="${this.esc(url)}" controls style="width:100%;border-radius:12px;background:#000"></video>`;
        } else {
          if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) throw new Error("This browser can't record video previews.");
          const seconds = Number(document.getElementById("vidDur").value), canvas = document.createElement("canvas"), ctx = canvas.getContext("2d"); canvas.width = 640; canvas.height = 360;
          const stream = canvas.captureStream(24);
          const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
          const rec = new MediaRecorder(stream, { mimeType: mime }); const chunks = [];
          rec.ondataavailable = e => e.data.size && chunks.push(e.data);
          const done = new Promise(resolve => rec.onstop = () => resolve(new Blob(chunks, { type: mime })));
          rec.start(); const start = performance.now();
          const draw = now => {
            const t = (now - start) / 1000;
            ctx.fillStyle = "#111827"; ctx.fillRect(0, 0, 640, 360); ctx.fillStyle = "#4f46e5"; ctx.beginPath(); ctx.arc(320 + Math.sin(t) * 140, 180 + Math.cos(t * .8) * 70, 70, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#fff"; ctx.font = "700 24px Inter,Arial"; ctx.fillText("vibehouse local motion", 24, 42); ctx.font = "18px Inter,Arial"; ctx.fillText(prompt.slice(0, 55), 24, 320);
            if (t < seconds) requestAnimationFrame(draw); else rec.stop();
          };
          requestAnimationFrame(draw);
          const blob = await done; const url = URL.createObjectURL(blob);
          result.innerHTML = `<video src="${url}" controls autoplay loop style="width:100%;border-radius:12px;background:#000"></video><a class="btn btn-primary" style="margin-top:10px" href="${url}" download="vibehouse-video.webm">Download video</a><p class="vh-note" style="margin-top:8px">Local motion mode.</p>`;
        }
        this.toast("Video ready", "success");
      } catch (e) { result.innerHTML = `<div class="card"><p style="color:var(--danger)">${this.esc(e.message)}</p></div>`; this.toast("Video generation failed", "error"); }
      finally { btn.disabled = false; btn.textContent = "Generate video"; }
    });
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());

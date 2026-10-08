// ============================================================
// Vibehouse Core — router + page renderers.
// Cloud is the source of truth. localStorage is never authoritative.
// ============================================================

const App = {
  user: null,
  waitlist: {},
  tasks: [],
  currentPage: "home",
  searchQuery: "",
  activeFilter: "All",
  backendReady: false,
  _bootDone: false,

  // ---------- utilities ----------
  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  },
  idOf(u) { return u ? String(u.id || u.email || "") : ""; },
  isOAuthReturn() { return /[#?&](access_token|refresh_token|code|error)=/.test(location.hash + location.search); },
  hasStoredSession() {
    try { return Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)); }
    catch (e) { return false; }
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
      bio: profile?.bio || ""
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
  saveUser() {
    // Cache only. Cloud remains source of truth.
    try {
      if (this.user) localStorage.setItem("vh_user", JSON.stringify(this.user));
      else localStorage.removeItem("vh_user");
    } catch (e) {}
  },
  loadLocalState() {
    try {
      const u = localStorage.getItem("vh_user");
      this.user = u ? JSON.parse(u) : null;
      const w = localStorage.getItem("vh_waitlist");
      this.waitlist = w ? JSON.parse(w) : {};
      const t = localStorage.getItem("vh_tasks");
      this.tasks = t ? JSON.parse(t) : [...(window.TASKS_DEFAULT || [])];
    } catch (e) {
      this.user = null;
      this.waitlist = {};
      this.tasks = [...(window.TASKS_DEFAULT || [])];
    }
  },
  saveWaitlist() { try { localStorage.setItem("vh_waitlist", JSON.stringify(this.waitlist)); } catch (e) {} },
  saveTasks()    { try { localStorage.setItem("vh_tasks", JSON.stringify(this.tasks)); } catch (e) {} },

  // ---------- boot ----------
  async init() {
    if (this._bootDone) return;
    this._bootDone = true;

    const oauth = this.isOAuthReturn();
    this.loadLocalState();

    // Release the boot mask immediately. Page never stays blank.
    document.documentElement.classList.remove("booting");

    // Try to init backend + store with a hard cap.
    try {
      await Promise.race([
        this.ensureBackend().then(() => window.Store.init()),
        new Promise(res => setTimeout(res, 3000))
      ]);
    } catch (e) {
      console.warn("[App] Store init timeout");
    }

    // Cloud products REPLACE seed products when available.
    if (window.Store && Array.isArray(window.Store.products) && window.Store.products.length) {
      window.PRODUCTS = window.Store.products;
    }
    if (window.Store && Array.isArray(window.Store.news) && window.Store.news.length) {
      window.NEWS = window.Store.news;
    }

    // Guest/user chrome
    if (this.cloudConfigured() && !oauth && !this.hasStoredSession()) {
      this.user = null;
      localStorage.removeItem("vh_user");
    } else if (!this.user) {
      this.user = this.cachedUser();
    }
    if (!this.tasks.length) this.tasks = [...(window.TASKS_DEFAULT || [])];

    this.bindGlobal();
    this.bindNavigation();

    // Paint immediately with whatever we have
    this.route();

    // Background: reconcile real auth state (never blocks first paint)
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

    const mustWait = oauth || (this.cloudConfigured() && this.hasStoredSession());
    if (mustWait) {
      Promise.race([
        this.reconcile({ silent: true, oauth }),
        new Promise(r => setTimeout(r, 4000))
      ]).then(() => {
        this.route();
        this.pullData(this.idOf(this.user));
      }).catch(() => {});
    } else {
      this.reconcile({ oauth: false }).catch(() => {});
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
            const profile = await window.VibeBackend.getProfile(session.user.id);
            this.user = this.buildUser(session.user, profile);
            await this.loadCloudData(session.user.id);
          } else if (this.user && /^[0-9a-f-]{36}$/i.test(String(this.user.id || ""))) {
            this.user = null;
          }
        }
      }
    } catch (e) { console.warn("[App] syncAuth failed", e); }

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
    try {
      if (window.Store && window.Store._client) dataChanged = await window.Store.reload();
    } catch (e) {}
    if (window.PRODUCTS && window.Store && window.Store.products.length) {
      window.PRODUCTS = window.Store.products;
    }
    const idChanged = before !== this.idOf(this.user);
    const liveData = ["home", "search", "deals", "profile", "leaderboard", "product"].includes(this.currentPage);
    if (idChanged || (dataChanged && liveData)) this.route();
  },

  async loadCloudData(userId) {
    try {
      this.waitlist = await window.VibeBackend.getUserWaitlist(userId);
      const remoteTasks = await window.VibeBackend.fetchTasks(userId);
      if (Array.isArray(remoteTasks)) this.tasks = remoteTasks;
    } catch (e) { console.warn("[App] loadCloudData failed", e); }
  },

  // ---------- ownership — UUID only ----------
  isProductOwner(p) {
    if (!this.user || !p) return false;
    const uid = String(this.user.id || "").toLowerCase();
    const oid = String(p.ownerId || "").toLowerCase();
    return !!(uid && oid && uid === oid);
  },

  // ---------- routing ----------
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

  go(path) {
    if (!path.startsWith("/")) path = "/" + path;
    if (location.pathname + location.search !== path) history.pushState(null, "", path);
    this.route();
    window.scrollTo(0, 0);
  },

  // ---------- global bindings ----------
  bindNavigation() {
    window.addEventListener("popstate", () => this.route());
    document.addEventListener("click", (e) => {
      const g = e.target.closest("[data-go]");
      if (g) { e.preventDefault(); this.go(g.dataset.go); return; }
      const a = e.target.closest("[data-action]");
      if (a && a.dataset.action === "logout") { e.preventDefault(); this.logout(); return; }
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest("a[href]");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#") || link.target === "_blank" || link.hasAttribute("download")) return;
      if (href.startsWith("/") || !href.includes("://")) {
        e.preventDefault();
        this.go(href.startsWith("/") ? href : "/" + href);
      }
    });
  },

  bindGlobal() {
    const searchInput = document.getElementById("globalSearch");
    searchInput?.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        const q = e.target.value.trim();
        if (q) { this.searchQuery = q; this.go("/search"); }
      }
    });
    document.getElementById("btnLogin")?.addEventListener("click", () => this.openAuth("login"));
    document.getElementById("btnSignup")?.addEventListener("click", () => this.openAuth("signup"));
    document.getElementById("btnLogout")?.addEventListener("click", () => this.logout());
    document.getElementById("topLogin")?.addEventListener("click", () => this.openAuth("login"));
    document.getElementById("topSignup")?.addEventListener("click", () => this.openAuth("signup"));

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

  // ---------- auth modal ----------
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
      // Give trigger a moment to write the profile, then read it.
      await new Promise(r => setTimeout(r, 400));
      const profile = await window.VibeBackend.getProfile(user.id);
      this.user = this.buildUser(user, profile, name);
      await this.loadCloudData(user.id);
      this.saveUser();
      this.closeModal();
      this.toast(`Welcome, ${this.user.name}!`, "success");
      this.updateUserChip();
      this.route();
    });
  },

  async logout() {
    try { if (window.VibeBackend) await window.VibeBackend.signOut(); } catch (e) {}
    this.user = null;
    this.waitlist = {};
    this.tasks = [...(window.TASKS_DEFAULT || [])];
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
    const topUser = document.getElementById("topUser");
    const topGuest = document.getElementById("topGuest");

    if (this.user) {
      if (chip) chip.style.display = "flex";
      if (loginBtns) loginBtns.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "inline-flex";
      if (topUser) topUser.style.display = "flex";
      if (topGuest) topGuest.style.display = "none";

      const photo = window.IconEngine ? window.IconEngine.userPhoto(this.user) : this.user.photo;
      const av = chip?.querySelector(".user-avatar");
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
      const nm = chip?.querySelector(".user-name");
      const mt = chip?.querySelector(".user-meta");
      if (nm) nm.textContent = this.user.name;
      if (mt) mt.textContent = `${this.user.tools || 0} tools · ${this.user.karma || 0} karma`;

      const tuAv = document.getElementById("tuAv");
      if (tuAv) tuAv.innerHTML = photo ? `<img src="${this.esc(photo)}" alt="">` : this.esc(this.user.avatar);
      const tuName = document.getElementById("tuName");
      const tuMeta = document.getElementById("tuMeta");
      if (tuName) tuName.textContent = this.user.username || this.user.name;
      if (tuMeta) tuMeta.textContent = `${this.user.tools || 0} tools · ${this.user.followers || 0} followers`;
    } else {
      if (chip) chip.style.display = "none";
      if (loginBtns) loginBtns.style.display = "flex";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (topUser) topUser.style.display = "none";
      if (topGuest) topGuest.style.display = "flex";
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
    const src = window.IconEngine ? window.IconEngine.productLogo(p) : null;
    const color = p.logoColor || "#6c5ce7";
    if (src) return `<div class="${sizeClass} has-img" style="background:${this.esc(color)}"><img src="${this.esc(src)}" alt="${this.esc(p.name)}" loading="lazy"></div>`;
    const mono = this.mono(p.name);
    return `<div class="${sizeClass}" style="background:${this.esc(color)};color:#fff">${this.esc(mono)}</div>`;
  },

  ownerAvatarHtml(p, size = 36) {
    const src = window.IconEngine ? window.IconEngine.ownerAvatar(p) : null;
    const color = p.ownerColor || "#0984e3";
    const letter = (p.owner || "?")[0].toUpperCase();
    if (src) return `<div class="owner-avatar" style="width:${size}px;height:${size}px;background:${this.esc(color)}"><img src="${this.esc(src)}" alt="${this.esc(p.owner)}" loading="lazy"></div>`;
    return `<div class="owner-avatar" style="width:${size}px;height:${size}px;background:${this.esc(color)}">${this.esc(letter)}</div>`;
  },

  formatNum(n) {
    n = Number(n) || 0;
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
    return n.toString();
  },

  currentProducts() {
    return (window.Store && Array.isArray(window.Store.products) && window.Store.products.length)
      ? window.Store.products
      : (window.PRODUCTS || []);
  },

  searchProducts(q) {
    const s = String(q || "").trim().toLowerCase();
    const source = this.currentProducts();
    if (!s) return [...source];
    return source.filter(p =>
      [p.name, p.desc, p.owner].some(v => String(v || "").toLowerCase().includes(s)) ||
      (p.tags || []).some(t => String(t).toLowerCase().includes(s))
    );
  },

  // ---------- HOME ----------
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
        <p class="statement">We run the house. <em>Vibe coders fill it</em> with tools, apps and websites.</p>
        <div class="about-strip">
          <div class="about-item"><div class="about-k">The community</div><p>vibecodersarecool is the community of vibe coders.</p></div>
          <div class="about-item"><div class="about-k">The products</div><p>Tools, apps and websites, each with its own subscription.</p></div>
          <div class="about-item"><div class="about-k">One roof</div><p>One account, one place to pay, one home.</p></div>
        </div>
      </div>
      <div class="action-row">
        <button class="action-btn images" data-go="/generate-images"><span class="icon">🖼</span> Generate images</button>
        <button class="action-btn videos" data-go="/generate-videos"><span class="icon">🎬</span> Generate videos <span class="badge">New</span></button>
      </div>
      <div class="stats-row">
        <div class="stat-chip"><strong>${this.formatNum(window.STATS.tools)}</strong> Tools</div>
        <div class="stat-chip"><strong>${window.STATS.devices}</strong> Devices</div>
        <div class="stat-chip"><strong>${this.formatNum(window.STATS.news)}</strong> News</div>
        <div class="stat-chip"><strong>${this.formatNum(window.STATS.videos)}</strong> Videos</div>
        <div class="stat-chip"><strong>${this.formatNum(window.STATS.models)}</strong> Models</div>
        <div class="stat-chip"><strong>${this.formatNum(window.STATS.companies)}</strong> Companies</div>
        <div class="stat-chip"><strong>${window.STATS.countries}</strong> Countries</div>
      </div>
      <h2 style="margin:40px 0 16px;font-size:18px;font-weight:700">Latest from the feed</h2>
      <div class="feed" id="homeFeed"></div>
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
    let list = [...this.currentProducts()];
    if (this.activeFilter === "Free") list = list.filter(p => p.priceValue === 0);
    else if (this.activeFilter !== "All") list = list.filter(p => p.type === this.activeFilter);
    return list;
  },

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
    container.innerHTML = (window.NEWS || []).map(n => `
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

  // ---------- SEARCH ----------
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

  // ---------- PRODUCT ----------
  renderProduct(el, id) {
    const p = (window.Store.findProduct(id)) || (window.PRODUCTS || []).find(x => x.id === id);
    if (!p) {
      el.innerHTML = `<div class="empty"><h3>Product not found</h3><p><a href="/" style="color:var(--accent)">← Back home</a></p></div>`;
      return;
    }
    const onWaitlist = !!this.waitlist[p.id];
    const ownerPath = p.ownerId ? "/profile/" + encodeURIComponent(p.ownerId) : null;
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
            ${ownerPath ? `<button class="btn btn-ghost" data-go="${this.esc(ownerPath)}">View maker</button>` : ""}
            ${isOwner ? `<button class="btn btn-ghost" id="btnChangeLogo">Change icon</button><input type="file" id="productLogoInput" accept="image/*" style="display:none">` : ""}
            ${p.video ? `<button class="btn btn-ghost" id="btnVideo">Watch demo</button>` : ""}
          </div>
        </div>
      </div>
      <div class="detail-grid">
        <div>
          ${(p.features || []).length ? `<div class="card"><h3>Features</h3><ul style="display:flex;flex-direction:column;gap:8px">${(p.features || []).map(f => `<li style="display:flex;gap:8px;align-items:center"><span style="color:var(--success)">✓</span> ${this.esc(f)}</li>`).join("")}</ul></div>` : ""}
          ${p.intro ? `<div class="card"><h3>Introduction from the maker</h3><p style="font-size:14px;line-height:1.6;color:var(--text-muted)">"${this.esc(p.intro)}"</p></div>` : ""}
          ${(p.tags || []).length ? `<div class="card"><h3>Tags</h3><div style="display:flex;flex-wrap:wrap;gap:8px">${(p.tags || []).map(t => `<span class="feed-tag">${this.esc(t)}</span>`).join("")}</div></div>` : ""}
        </div>
        <div>
          <div class="card">
            <h3>Maker</h3>
            <div class="maker-card">
              ${this.ownerAvatarHtml(p, 48).replace("owner-avatar", "maker-avatar")}
              <div>
                <div style="font-weight:700">${this.esc(p.owner)}</div>
                ${p.ownerRole ? `<div style="font-size:13px;color:var(--text-muted)">${this.esc(p.ownerRole)}</div>` : ""}
              </div>
            </div>
            ${p.ownerBio ? `<p style="margin-top:12px;font-size:13px;color:var(--text-muted)">${this.esc(p.ownerBio)}</p>` : ""}
            ${!isOwner && ownerPath ? `<button class="btn btn-ghost btn-sm" style="margin-top:12px;width:100%;justify-content:center" data-go="${this.esc(ownerPath)}">View full profile</button>` : ""}
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

    // waitlist
    document.getElementById("btnWaitlist")?.addEventListener("click", async () => {
      if (!this.user?.id) { this.openAuth("login"); return; }
      const btn = document.getElementById("btnWaitlist");
      if (btn) btn.disabled = true;
      const joining = !this.waitlist[p.id];
      const result = await window.VibeBackend.toggleWaitlist(p.id, this.user.id, joining);
      if (btn) btn.disabled = false;
      if (!result?.ok) return this.toast(result?.error || "Could not update waitlist", "error");
      this.waitlist[p.id] = joining;
      this.saveWaitlist();
      if (btn) btn.textContent = joining ? "✓ On waitlist" : "Join waitlist";
      this.toast(joining ? `You're on the waitlist for ${p.name}` : "Removed from waitlist", "success");
    });

    // icon upload
    document.getElementById("btnChangeLogo")?.addEventListener("click", () => {
      document.getElementById("productLogoInput")?.click();
    });
    document.getElementById("productLogoInput")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await window.IconEngine.fileToDataUrl(file);
        const res = await window.VibeBackend.uploadProductIcon(p.id, dataUrl);
        if (!res.ok) return this.toast("Upload failed: " + (res.error || "unknown"), "error");
        p.logoUrl = res.url;
        const logoEl = el.querySelector(".detail-logo");
        if (logoEl) logoEl.outerHTML = this.productLogoHtml(p, "detail-logo");
        this.toast("Product icon saved", "success");
      } catch (err) {
        this.toast("Could not process image", "error");
      }
    });

    // video modal
    document.getElementById("btnVideo")?.addEventListener("click", () => {
      if (!p.video) return this.toast("No demo video is available", "error");
      this.openMediaModal("video", p.video, p.name + " demo");
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

  // ---------- PROFILE (extended by profile.js) ----------
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

    const decoded = decodeURIComponent(id || "");
    let makerProducts = [];
    let ownerKey = decoded;

    if (!isMe) {
      // Try UUID first, then username
      makerProducts = window.Store.productsByOwner(decoded);
      if (!makerProducts.length) {
        const m = (window.PRODUCTS || []).find(p => p.ownerUsername === decoded);
        if (m) { makerProducts = [m]; ownerKey = m.ownerId; }
      }
      if (!makerProducts.length) {
        el.innerHTML = `<div class="empty"><h3>Profile not found</h3><a href="/" style="color:var(--accent)">← Home</a></div>`;
        return;
      }
    }

    const maker = makerProducts[0];
    const name = isMe ? this.user.name : (maker?.owner || "Maker");
    const avatar = isMe ? this.user.avatar : (String(maker?.owner || "?")[0].toUpperCase());
    const bio = isMe ? (this.user.bio || "") : (maker?.ownerBio || "");
    const role = isMe ? (this.user.headline || "") : (maker?.ownerRole || "");
    const photo = isMe ? (window.IconEngine.userPhoto(this.user)) : null;
    const username = isMe ? (this.user.username || "") : (maker?.ownerUsername || "");

    el.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="history.back()" style="margin-bottom:20px">← Back</button>
      <div class="profile-header">
        <div class="profile-avatar" id="profileAvatarBox" style="background:linear-gradient(135deg,var(--accent),#a29bfe);${isMe ? "cursor:pointer" : ""}">
          ${photo ? `<img src="${this.esc(photo)}" alt="${this.esc(name)}" id="profilePhotoImg">` : this.esc(avatar)}
          ${isMe ? `<div class="upload-hint">Change photo</div><input type="file" id="profilePhotoInput" accept="image/*">` : ""}
        </div>
        <div style="flex:1;min-width:0">
          <h1 class="page-title" style="margin-bottom:4px">${this.esc(name)}</h1>
          ${username ? `<p style="color:var(--text-muted);margin-bottom:6px">@${this.esc(username)}</p>` : ""}
          ${role ? `<p style="color:var(--text-muted);margin-bottom:8px">${this.esc(role)}</p>` : ""}
          ${bio ? `<p style="font-size:14px;max-width:480px">${this.esc(bio)}</p>` : ""}
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

    if (isMe) {
      // Real tools for me: only MY products by UUID.
      const mine = this.user.id ? window.Store.productsByOwner(this.user.id) : [];
      this.renderProductCards(document.getElementById("profileProducts"), mine);

      // Avatar upload
      const box = document.getElementById("profileAvatarBox");
      const input = document.getElementById("profilePhotoInput");
      box?.addEventListener("click", () => input?.click());
      input?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith("image/")) return this.toast("Please choose an image file", "error");
        try {
          const dataUrl = await window.IconEngine.fileToDataUrl(file);
          const res = await window.VibeBackend.uploadAvatar(this.user.id, dataUrl);
          if (!res.ok) return this.toast("Upload failed: " + (res.error || "unknown"), "error");
          this.user.photo = res.url;
          this.saveUser();
          const img = document.getElementById("profilePhotoImg");
          if (img) img.src = res.url;
          else if (box) box.innerHTML = `<img src="${this.esc(res.url)}" alt="${this.esc(name)}" id="profilePhotoImg"><div class="upload-hint">Change photo</div><input type="file" id="profilePhotoInput" accept="image/*">`;
          this.updateUserChip();
          this.toast("Profile photo saved", "success");
        } catch (err) { this.toast("Could not process image", "error"); }
      });
    } else {
      this.renderProductCards(document.getElementById("profileProducts"), makerProducts);
    }
  },

  // ---------- TASKS ----------
  renderTasks(el) {
    el.innerHTML = `
      <div class="page-header"><h1 class="page-title">Tasks</h1><p class="page-sub">Your personal build board.</p></div>
      <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
        <input type="text" id="newTaskInput" placeholder="Add a new task..." style="flex:1;min-width:200px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:10px 14px">
        <button class="btn btn-primary" id="addTaskBtn">Add task</button>
      </div>
      <div class="task-list" id="taskList"></div>
    `;
    const renderList = () => {
      const list = document.getElementById("taskList");
      if (!list) return;
      if (!this.tasks.length) { list.innerHTML = `<div class="empty"><h3>No tasks yet</h3></div>`; return; }
      list.innerHTML = this.tasks.map(t => `
        <div class="task-item ${t.done ? "done" : ""}" data-id="${this.esc(t.id)}">
          <button class="task-check">${t.done ? "✓" : ""}</button>
          <div style="flex:1"><div class="task-title" style="font-weight:600">${this.esc(t.title)}</div></div>
          <button class="btn btn-ghost btn-sm task-del">Delete</button>
        </div>`).join("");
      list.querySelectorAll(".task-check").forEach(btn => btn.addEventListener("click", async () => {
        const id = btn.closest(".task-item").dataset.id;
        const task = this.tasks.find(t => String(t.id) === id);
        if (!task) return;
        task.done = !task.done;
        this.saveTasks(); renderList();
        if (this.user?.id) await window.VibeBackend.saveTask({ ...task, user_id: this.user.id });
      }));
      list.querySelectorAll(".task-del").forEach(btn => btn.addEventListener("click", async () => {
        const id = btn.closest(".task-item").dataset.id;
        this.tasks = this.tasks.filter(t => String(t.id) !== id);
        this.saveTasks(); renderList();
        if (this.user?.id) await window.VibeBackend.deleteTask(id);
      }));
    };
    renderList();
    const add = async () => {
      const input = document.getElementById("newTaskInput");
      const title = input.value.trim(); if (!title) return;
      const task = { id: "t" + Date.now(), title, done: false, created_at: new Date().toISOString() };
      this.tasks.unshift(task); this.saveTasks(); input.value = ""; renderList();
      if (this.user?.id) await window.VibeBackend.saveTask({ ...task, user_id: this.user.id });
    };
    document.getElementById("addTaskBtn")?.addEventListener("click", add);
    document.getElementById("newTaskInput")?.addEventListener("keydown", e => { if (e.key === "Enter") add(); });
  },

  renderDeals(el) {
    const deals = this.currentProducts().filter(p => p.priceValue === 0);
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Deals</h1><p class="page-sub">Free tools to start with.</p></div><div class="products-grid" id="dealsGrid"></div>`;
    this.renderProductCards(document.getElementById("dealsGrid"), deals);
  },

  renderLeaderboard(el) {
    const ranked = [...this.currentProducts()].sort((a, b) => (b.users || 0) - (a.users || 0));
    el.innerHTML = `
      <div class="page-header"><h1 class="page-title">Leaderboard</h1><p class="page-sub">Most used tools right now.</p></div>
      <div class="feed">${ranked.map((p, i) => `
        <article class="feed-item" style="cursor:pointer" data-go="/ai/${this.esc(encodeURIComponent(p.id))}">
          <div style="font-weight:800;font-size:20px;width:36px;text-align:center;color:var(--text-muted)">#${i + 1}</div>
          ${this.productLogoHtml(p, "feed-logo").replace("product-logo", "feed-logo")}
          <div class="feed-body">
            <div class="feed-title">${this.esc(p.name)}</div>
            <div class="feed-desc">${this.esc(p.desc)}</div>
          </div>
        </article>`).join("")}</div>`;
  },

  renderMiniTools(el) {
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Mini Tools</h1><p class="page-sub">Small utilities.</p></div><div class="empty"><p>Mini tools coming soon.</p></div>`;
  },
  renderCharacters(el) {
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Characters</h1><p class="page-sub">Built-in characters.</p></div><div class="empty"><p>Characters coming soon.</p></div>`;
  },
  renderMap(el) {
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Map</h1><p class="page-sub">Explore maker regions.</p></div><div class="empty"><p>Map coming soon.</p></div>`;
  },
  renderPrompts(el) {
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Prompts</h1><p class="page-sub">Ready-to-use prompts.</p></div><div class="empty"><p>Prompts coming soon.</p></div>`;
  },

  renderLaunch(el) {
    if (!this.user) {
      el.innerHTML = `<div class="page-header"><h1 class="page-title">Launch your product</h1><p class="page-sub">Log in to submit.</p></div>
        <div style="display:flex;gap:10px"><button class="btn btn-primary" id="gLogin">Log in</button><button class="btn btn-ghost" id="gSignup">Sign up</button></div>`;
      document.getElementById("gLogin").onclick = () => this.openAuth("login");
      document.getElementById("gSignup").onclick = () => this.openAuth("signup");
      return;
    }
    el.innerHTML = `
      <div class="page-header"><h1 class="page-title">Launch your product</h1><p class="page-sub">Get in front of builders.</p></div>
      <div class="card" style="max-width:600px">
        <form id="launchForm">
          <div class="field"><label>Product name *</label><input id="launchName" required maxlength="80"></div>
          <div class="field"><label>One-line description *</label><input id="launchDesc" required maxlength="160"></div>
          <div class="field"><label>Long description</label><textarea id="launchLong" rows="4"></textarea></div>
          <div class="field"><label>Category *</label><select id="launchCat" required><option value="">Select...</option><option>SaaS tool</option><option>Mobile app</option><option>Web app</option><option>Website</option><option>Other</option></select></div>
          <div class="field"><label>Website URL *</label><input id="launchUrl" type="url" required placeholder="https://..."></div>
          <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center">Submit</button>
        </form>
        <div id="launchMsg" class="modal-msg"></div>
      </div>`;
    document.getElementById("launchForm").addEventListener("submit", async e => {
      e.preventDefault();
      const btn = e.target.querySelector("button");
      const msg = document.getElementById("launchMsg");
      btn.disabled = true; msg.textContent = "Submitting..."; msg.style.color = "var(--text-muted)";
      const payload = {
        name: document.getElementById("launchName").value.trim(),
        desc: document.getElementById("launchDesc").value.trim(),
        long: document.getElementById("launchLong").value.trim(),
        cat: document.getElementById("launchCat").value,
        url: document.getElementById("launchUrl").value.trim(),
        maker: this.user.name,
        email: this.user.email
      };
      const result = await window.Store.createProduct(payload, this.user.id);
      btn.disabled = false;
      if (!result.ok) { msg.style.color = "var(--danger)"; msg.textContent = result.error; return; }
      msg.style.color = "var(--success)";
      msg.textContent = `✓ "${payload.name}" launched.`;
      this.toast(`Launched: ${payload.name}`, "success");
      setTimeout(() => this.go("/ai/" + result.product.id), 800);
    });
  },

  renderGenerateImages(el) {
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Generate Images</h1><p class="page-sub">Coming soon.</p></div><div class="empty"><p>Connect an image model endpoint to enable.</p></div>`;
  },
  renderGenerateVideos(el) {
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Generate Videos</h1><p class="page-sub">Coming soon.</p></div><div class="empty"><p>Connect a video model endpoint to enable.</p></div>`;
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());

// ============================================================
// Vibehouse Core – Supabase only, single boot spinner, uniform rows
// ============================================================
const App = {
  user: null,
  waitlist: {},
  tasks: [],
  currentPage: "home",
  searchQuery: "",
  activeFilter: "All",
  backendReady: false,
  _bp: null,

  // ---------- helpers ----------
  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  },

  idOf(u) {
    return u ? String(u.id || "") : "";
  },

  isOAuthReturn() {
    return /[#?&](access_token|refresh_token|code|error)=/.test(location.hash + location.search);
  },

  buildUser(su, profile, fallbackName) {
    const meta = su.user_metadata || {};
    const email = su.email || "";
    const name = profile?.full_name || meta.full_name || meta.name || meta.user_name || fallbackName || email.split("@")[0] || "User";
    return {
      id: su.id,
      name,
      email,
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
      this._bp = (window.VibeBackend
        ? Promise.resolve().then(() => window.VibeBackend.init())
        : Promise.resolve(false)
      )
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
      const row = {
        id: su.id,
        email: su.email,
        full_name: name,
        avatar_letter: String(name[0] || "?").toUpperCase(),
        tools_count: 0,
        karma: 0,
        followers: 0
      };
      const { error } = await client.from("profiles").upsert(row, { onConflict: "id", ignoreDuplicates: true });
      if (!error) return await window.VibeBackend.getProfile(su.id);
    } catch (e) {}
    return profile;
  },

  async loadCloudData(userId) {
    try {
      this.waitlist = await window.VibeBackend.getUserWaitlist(userId);
      this.tasks = await window.VibeBackend.fetchTasks(userId);
    } catch (e) {
      console.warn("[Vibehouse] loadCloudData", e);
    }
  },

  // ---------- start-up (single transparent spinner) ----------
  async init() {
    const oauth = this.isOAuthReturn();
    this.bindGlobal();
    this.bindNavigation();

    // Keep boot mask until we know auth state + have first data
    document.documentElement.classList.add("booting");

    await this.ensureBackend();

    if (this.backendReady && window.VibeBackend.onAuthChange) {
      window.VibeBackend.onAuthChange(event => {
        if (event === "SIGNED_OUT" && this.user?.id) {
          this.user = null;
          this.waitlist = {};
          this.tasks = [];
          this.updateUserChip();
          this.route();
        }
      });
    }

    try {
      await Promise.race([
        this.reconcile({ silent: true, oauth }),
        new Promise(r => setTimeout(r, 7000))
      ]);
    } catch (e) {}

    // First paint only after auth + data are known
    this.route();
    document.documentElement.classList.remove("booting");

    // Background live pull
    this.pullData(this.idOf(this.user));
  },

  async syncAuth(opts = {}) {
    const oauth = !!opts.oauth;
    const hadError = /[#?&]error=/.test(location.hash + location.search);
    let confirmed = false;

    try {
      if (window.VibeBackend && this.backendReady) {
        const session = oauth
          ? await window.VibeBackend.waitForSession(5000)
          : await window.VibeBackend.getSession();

        if (session?.user) {
          confirmed = true;
          let profile = await window.VibeBackend.getProfile(session.user.id);
          profile = await this.ensureProfile(session.user, profile);
          this.user = this.buildUser(session.user, profile);
          await this.loadCloudData(session.user.id);
        } else {
          this.user = null;
        }
      }
    } catch (e) {
      console.warn("[Vibehouse] syncAuth", e);
    }

    if (oauth) {
      history.replaceState(null, "", location.pathname);
      if (confirmed && this.user) {
        setTimeout(() => this.toast(`Welcome, ${this.user.name}!`, "success"), 300);
      } else if (hadError) {
        setTimeout(() => this.toast("Sign-in failed. Please try again.", "error"), 300);
      }
    }
  },

  async reconcile(opts = {}) {
    const before = this.idOf(this.user);
    await this.syncAuth(opts);
    this.updateUserChip();
    if (opts.silent) return;
    await this.pullData(before);
  },

  async pullData(before) {
    let dataChanged = false;
    try {
      if (window.VH && VH.pull) dataChanged = await VH.pull();
    } catch (e) {}
    if (window.VH && VH.refreshCounts) VH.refreshCounts();
    const idChanged = before !== this.idOf(this.user);
    const liveData = ["home", "search", "dashboard", "profile", "leaderboard", "product"].includes(this.currentPage);
    if (idChanged || (dataChanged && liveData)) this.route();
  },

  // ---------- navigation ----------
  go(path) {
    if (!path.startsWith("/")) path = "/" + path;
    if (location.pathname + location.search !== path) {
      history.pushState(null, "", path);
    }
    this.route();
    window.scrollTo(0, 0);
  },

  isProductOwner(p) {
    if (!this.user || !p) return false;
    const uid = String(this.user.id || "").toLowerCase();
    const oid = String(p.ownerId || "").toLowerCase();
    return !!(oid && uid === oid);
  },

  parsePath() {
    let path = location.pathname.replace(/\/$/, "") || "/";
    if (path.endsWith("index.html")) path = "/";
    const parts = path.split("/").filter(Boolean).map(s => {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    if (parts.length === 0) return { page: "home", id: null };
    if (parts[0] === "ai" && parts[1]) return { page: "product", id: parts[1] };
    if (parts[0] === "product" && parts[1]) return { page: "product", id: parts[1] };
    if (parts[0] === "profile" && parts[1]) return { page: "profile", id: parts[1] };
    if (parts[0] === "generate-images") return { page: "generate-images", id: null };
    if (parts[0] === "generate-videos") return { page: "generate-videos", id: null };
    if (parts[0] === "dashboard") return { page: "dashboard", id: null };
    if (parts[0] === "contact" || parts[0] === "advertise") return { page: "contact", id: null };
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
      case "dashboard": this.renderDashboard(content); break;
      case "contact": this.renderContact(content); break;
      case "generate-images": this.renderGenerateImages(content); break;
      case "generate-videos": this.renderGenerateVideos(content); break;
      default: this.renderHome(content);
    }
    this.updateUserChip();
  },

  bindNavigation() {
    window.addEventListener("popstate", () => this.route());
    document.addEventListener("click", e => {
      const g = e.target.closest("[data-go]");
      if (g) {
        e.preventDefault();
        this.go(g.dataset.go);
        return;
      }
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
          if (q) {
            this.searchQuery = q;
            this.go("/search");
          }
        }
      });
    }

    document.getElementById("btnLogin")?.addEventListener("click", () => this.openAuth("login"));
    document.getElementById("btnSignup")?.addEventListener("click", () => this.openAuth("signup"));
    document.getElementById("btnLogout")?.addEventListener("click", () => this.logout());
    document.getElementById("topLogin")?.addEventListener("click", () => this.openAuth("login"));
    document.getElementById("topSignup")?.addEventListener("click", () => this.openAuth("signup"));
    document.getElementById("topUser")?.addEventListener("click", () => this.go("/profile/me"));

    const sbBtn = document.getElementById("sidebarToggle");
    const setSb = open => {
      document.body.classList.toggle("sidebar-open", open);
      sbBtn?.setAttribute("aria-expanded", String(open));
      sbBtn?.setAttribute("aria-label", open ? "Collapse sidebar" : "Expand sidebar");
    };
    setSb(false);
    sbBtn?.addEventListener("click", e => {
      e.stopPropagation();
      setSb(!document.body.classList.contains("sidebar-open"));
    });
    document.addEventListener("click", e => {
      if (document.body.classList.contains("sidebar-open") && !e.target.closest("#sidebar")) setSb(false);
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") setSb(false);
    });

    document.getElementById("menuToggle")?.addEventListener("click", () => {
      document.getElementById("sidebar")?.classList.toggle("open");
    });

    document.getElementById("modalOverlay")?.addEventListener("click", e => {
      if (e.target.id === "modalOverlay") this.closeModal();
    });
    document.getElementById("modalClose")?.addEventListener("click", () => this.closeModal());
  },

  // ---------- Auth ----------
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
          <span>${mode === "signup" ? "Sign up" : "Continue"} with Google</span>
        </button>
        <button type="button" class="btn-social" data-provider="github">
          <span>${mode === "signup" ? "Sign up" : "Continue"} with GitHub</span>
        </button>
      </div>
      <div class="auth-divider"><span>or use email</span></div>
      <form id="authForm">
        ${mode === "signup" ? `
          <div class="field">
            <label>Name</label>
            <input type="text" id="authName" placeholder="Your name" required>
          </div>` : ""}
        <div class="field">
          <label>Email</label>
          <input type="email" id="authEmail" placeholder="you@example.com" required>
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" id="authPass" placeholder="••••••••" required minlength="6">
        </div>
        <button type="submit" class="btn btn-primary" id="authSubmit" style="width:100%;justify-content:center;margin-top:8px">
          ${mode === "signup" ? "Create my account" : "Log in"}
        </button>
      </form>
      <div class="modal-msg" id="authMsg"></div>
    `;

    overlay.classList.add("open");

    body.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => this.openAuth(tab.dataset.mode));
    });

    body.querySelectorAll(".btn-social").forEach(btn => {
      btn.addEventListener("click", async () => {
        const msg = document.getElementById("authMsg");
        const fail = t => { msg.textContent = t; msg.style.color = "var(--danger)"; btn.disabled = false; };
        msg.style.color = "var(--text-muted)";
        msg.textContent = "Connecting…";
        btn.disabled = true;
        if (!window.VibeBackend || !this.cloudConfigured()) return fail("Social login isn't set up yet.");
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
      if (!this.backendReady) return fail("Couldn't reach the server.");

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
      this.closeModal();
      this.toast(`Welcome, ${this.user.name}!`, "success");
      this.updateUserChip();
      this.route();
    });
  },

  async logout() {
    try {
      if (window.VibeBackend) await window.VibeBackend.signOut();
    } catch (e) {}
    this.user = null;
    this.waitlist = {};
    this.tasks = [];
    this.toast("Logged out", "success");
    this.updateUserChip();
    this.route();
  },

  closeModal() {
    document.getElementById("modalOverlay")?.classList.remove("open");
  },

  updateUserChip() {
    document.documentElement.setAttribute("data-auth", this.user ? "user" : "guest");
    const chip = document.getElementById("userChip");
    const loginBtns = document.getElementById("authButtons");
    const logoutBtn = document.getElementById("btnLogout");
    const topUser = document.getElementById("topUser");
    const topGuest = document.getElementById("topGuest");

    if (this.user) {
      if (chip) {
        chip.style.display = "flex";
        const av = chip.querySelector(".user-avatar");
        if (av) {
          av.textContent = "";
          if (this.user.photo) {
            const img = document.createElement("img");
            img.src = this.user.photo;
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
      }
      if (loginBtns) loginBtns.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "inline-flex";
      if (topUser) {
        topUser.style.display = "flex";
        const tuAv = document.getElementById("tuAv");
        if (tuAv) {
          tuAv.innerHTML = this.user.photo
            ? `<img src="${this.esc(this.user.photo)}" alt="">`
            : this.esc(this.user.avatar);
        }
        const tuName = document.getElementById("tuName");
        const tuMeta = document.getElementById("tuMeta");
        if (tuName) tuName.textContent = this.user.name;
        if (tuMeta) tuMeta.textContent = `${this.user.tools || 0} tools · ${this.user.followers || 0} followers`;
      }
      if (topGuest) topGuest.style.display = "none";
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
    const src = (window.IconEngine ? IconEngine.productLogo(p) : null) || p.logoUrl;
    const color = p.logoColor || "#6c5ce7";
    if (src) {
      return `<div class="${sizeClass} has-img" style="background:${this.esc(color)}"><img src="${this.esc(src)}" alt="${this.esc(p.name)}" loading="lazy"></div>`;
    }
    const mono = this.mono(p.name);
    return `<div class="${sizeClass}" style="background:${this.esc(color)};color:#fff">${this.esc(mono)}</div>`;
  },

  ownerAvatarHtml(p, size = 36) {
    const src = (window.IconEngine ? IconEngine.ownerAvatar(p) : null) || p.ownerAvatarUrl;
    const color = p.ownerColor || "#0984e3";
    const letter = (p.owner || "?")[0].toUpperCase();
    if (src) {
      return `<div class="owner-avatar" style="width:${size}px;height:${size}px;background:${this.esc(color)}"><img src="${this.esc(src)}" alt="${this.esc(p.owner)}" loading="lazy"></div>`;
    }
    return `<div class="owner-avatar" style="width:${size}px;height:${size}px;background:${this.esc(color)}">${this.esc(letter)}</div>`;
  },

  formatNum(n) {
    n = Number(n) || 0;
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
    return n.toString();
  },

  searchProducts(q) {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return [...PRODUCTS];
    return PRODUCTS.filter(p =>
      [p.name, p.desc, p.owner].some(v => String(v || "").toLowerCase().includes(s)) ||
      (p.tags || []).some(t => String(t).toLowerCase().includes(s))
    );
  },

  getFilteredProducts() {
    let list = [...PRODUCTS];
    if (this.activeFilter === "Free") list = list.filter(p => p.priceValue === 0);
    else if (this.activeFilter !== "All") list = list.filter(p => p.type === this.activeFilter);
    return list;
  },

  // ---------- PAGE RENDERERS ----------
  renderHome(el) {
    const spotlight = PRODUCTS.find(p => p.featured) || PRODUCTS[0];
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

      ${spotlight ? `
      <div class="spotlight" style="margin-top:32px">
        ${this.productLogoHtml(spotlight, "spotlight-logo")}
        <div class="spotlight-info">
          <div class="spotlight-name">${this.esc(spotlight.name)}</div>
          <div class="spotlight-desc">${this.esc(spotlight.desc)}</div>
        </div>
        <span class="spotlight-tag">Trending</span>
        <button class="btn btn-primary btn-sm" data-go="/ai/${this.esc(encodeURIComponent(spotlight.id))}">View →</button>
      </div>` : ""}

      <div class="action-row" style="margin-top:28px">
        <button class="action-btn images" data-go="/generate-images">
          <span class="icon">🖼</span> Generate images
        </button>
        <button class="action-btn videos" data-go="/generate-videos">
          <span class="icon">🎬</span> Generate videos
        </button>
      </div>
    `;

    this.renderProductCards(document.getElementById("homeProducts"), this.getFilteredProducts());

    document.getElementById("homeFilters")?.addEventListener("click", e => {
      const btn = e.target.closest(".filter-chip");
      if (!btn) return;
      this.activeFilter = btn.dataset.f;
      document.querySelectorAll("#homeFilters .filter-chip").forEach(c =>
        c.classList.toggle("active", c.dataset.f === this.activeFilter)
      );
      this.renderProductCards(document.getElementById("homeProducts"), this.getFilteredProducts());
    });
  },

  renderProductCards(container, list) {
    // Delegated to vh-list.js for uniform rows
    if (window.App && App._renderProductCards) {
      return App._renderProductCards(container, list);
    }
    // Fallback simple rows
    if (!container) return;
    if (!list.length) {
      container.innerHTML = `<div class="empty"><h3>No tools match</h3><p>Try a different filter.</p></div>`;
      return;
    }
    container.classList.add("products-list");
    container.innerHTML = list.map(p => `
      <article class="product-card" data-go="/ai/${this.esc(encodeURIComponent(p.id))}">
        <div class="product-top">
          ${this.productLogoHtml(p)}
          <div class="product-meta">
            <div class="product-name">${this.esc(p.name)}</div>
            <div class="product-type">${this.esc(p.type)} · ${this.esc(p.category)}</div>
          </div>
        </div>
        <p class="product-desc">${this.esc(p.desc)}</p>
        <div class="product-footer">
          <div class="product-owner-row">
            ${this.ownerAvatarHtml(p, 32)}
            <div class="product-owner">by <strong>${this.esc(p.owner)}</strong></div>
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
        <p class="page-sub">${q ? `Results for “${this.esc(q)}”` : "Search tools, makers, and more"}</p>
      </div>
      <div class="search-box" style="max-width:100%;margin-bottom:24px">
        <input type="text" id="pageSearch" value="${this.esc(q)}" placeholder="Search tools, makers, categories...">
      </div>
      <div class="products-list" id="searchResults"></div>
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
    // Real implementation is in hub.js + media.js (they override this)
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) {
      el.innerHTML = `<div class="empty"><h3>Product not found</h3><p><a href="/" style="color:var(--accent)">← Back home</a></p></div>`;
      return;
    }
    // Minimal fallback – full version comes from hub/media overrides
    el.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="history.back()" style="margin-bottom:20px">← Back</button>
      <div class="detail-hero">
        ${this.productLogoHtml(p, "detail-logo")}
        <div class="detail-info">
          <h1 class="detail-name">${this.esc(p.name)}</h1>
          <div class="detail-type">${this.esc(p.type)} · ${this.esc(p.category)}</div>
          <p class="detail-desc">${this.esc(p.longDesc || p.desc)}</p>
          <div class="detail-actions"></div>
        </div>
      </div>
    `;
  },

  renderProfile(el, id) {
    // Overridden by profile logic in hub.js / profile extension
    el.innerHTML = `<div class="empty"><h3>Loading profile…</h3></div>`;
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
            renderList();
            if (this.backendReady && this.user?.id) {
              await window.VibeBackend.saveTask({ ...task, user_id: this.user.id });
            }
          }
        });
      });
      list.querySelectorAll(".task-del").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.closest(".task-item").dataset.id;
          this.tasks = this.tasks.filter(t => String(t.id) !== id);
          renderList();
          this.toast("Task deleted", "success");
          if (this.backendReady && this.user?.id) {
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
      const task = {
        id: "t" + Date.now(),
        title,
        done: false,
        due: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        created_at: new Date().toISOString(),
        user_id: this.user?.id
      };
      this.tasks.unshift(task);
      input.value = "";
      renderList();
      this.toast("Task added", "success");
      if (this.backendReady && this.user?.id) {
        await window.VibeBackend.saveTask(task);
      }
    };
    document.getElementById("addTaskBtn")?.addEventListener("click", addTask);
    document.getElementById("newTaskInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter") addTask();
    });
  },

  renderDeals(el) {
    const deals = PRODUCTS.filter(p => p.priceValue === 0 || !p.priceValue);
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Deals</h1>
        <p class="page-sub">Free tools to start with.</p>
      </div>
      <div class="products-list" id="dealsGrid"></div>
    `;
    this.renderProductCards(document.getElementById("dealsGrid"), deals);
  },

  renderLeaderboard(el) {
    const ranked = [...PRODUCTS].sort((a, b) => (b.users || 0) - (a.users || 0));
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Leaderboard</h1>
        <p class="page-sub">Most used tools right now.</p>
      </div>
      <div class="products-list" id="lbList"></div>
    `;
    this.renderProductCards(document.getElementById("lbList"), ranked);
  },

  renderDashboard(el) {
    if (!this.user) {
      el.innerHTML = `
        <div class="page-header"><h1 class="page-title">Dashboard</h1>
        <p class="page-sub">Log in to see your launches.</p></div>
        <div class="vh-actions"><button class="btn btn-primary" id="dLogin">Log in</button></div>`;
      document.getElementById("dLogin").onclick = () => this.openAuth("login");
      return;
    }
    const list = PRODUCTS.filter(p => this.isProductOwner(p));
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Your launches</h1>
        <p class="page-sub">Everything you’ve launched.</p>
      </div>
      <div class="vh-actions" style="margin-bottom:16px">
        <button class="btn btn-primary" data-go="/launch">Launch something</button>
      </div>
      <div class="products-list" id="dashList"></div>
    `;
    this.renderProductCards(document.getElementById("dashList"), list);
  },

  renderContact(el) {
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Contact & Advertise</h1>
        <p class="page-sub">Feature your product or partner with us.</p>
      </div>
      <div class="card">
        <p>Email: <a href="mailto:upcomingtrillioner12@gmail.com" style="color:var(--accent)">upcomingtrillioner12@gmail.com</a></p>
      </div>
    `;
  },

  // Mini tools, characters, map, prompts, generate-* stay lightweight
  renderMiniTools(el) {
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Mini Tools</h1>
      <p class="page-sub">Small utilities that run in your browser.</p></div>
      <div class="empty"><p>Coming soon in the next iteration.</p></div>`;
  },
  renderCharacters(el) {
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Characters</h1>
      <p class="page-sub">Chat with built-in characters.</p></div>
      <div class="empty"><p>Coming soon.</p></div>`;
  },
  renderMap(el) {
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Map</h1>
      <p class="page-sub">Maker regions.</p></div>
      <div class="empty"><p>Coming soon.</p></div>`;
  },
  renderPrompts(el) {
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Prompts</h1>
      <p class="page-sub">Ready-to-use prompts.</p></div>
      <div class="empty"><p>Coming soon.</p></div>`;
  },
  renderGenerateImages(el) {
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Generate Images</h1>
      <p class="page-sub">Connect IMAGE_API_URL in config for real generation.</p></div>`;
  },
  renderGenerateVideos(el) {
    el.innerHTML = `<div class="page-header"><h1 class="page-title">Generate Videos</h1>
      <p class="page-sub">Connect VIDEO_API_URL in config for real generation.</p></div>`;
  },

  // Launch is fully handled by launch.js
  renderLaunch(el) {
    el.innerHTML = `<div class="empty"><h3>Loading launch form…</h3></div>`;
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());

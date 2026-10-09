// ============================================================
// Vibehouse Hub – listings, ownership, stats, dashboard, follows
// + Full product editing + clickable product icon for owners
// ============================================================
(function () {
  const CONTACT = "upcomingtrillioner12@gmail.com";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
  const sb = () => (window.VibeBackend && VibeBackend.isReady()) ? VibeBackend.client() : null;
  const num = n => (App.formatNum ? App.formatNum(n) : n);
  const $id = id => document.getElementById(id);

  const TYPES = {
    webapp: { name: "Web App",    cta: "Open App",         how: "Redirect to your live URL",             label: "Live URL",                       ph: "https://yourapp.com",                 hint: "The page where people open your app." },
    agent:  { name: "AI Agent",   cta: "Try",              how: "Redirect to your service URL",           label: "Service URL",                    ph: "https://youragent.com",               hint: "Where people try or connect to your agent." },
    model:  { name: "AI Model",   cta: "Use Model",        how: "Hugging Face link or API endpoint",      label: "Hugging Face link or API URL",   ph: "https://huggingface.co/you/model",    hint: "A model page or the API docs/endpoint." },
    mobile: { name: "Mobile App", cta: "Get on App Store", how: "Redirect to the App Store",              label: "App Store link",                 ph: "https://apps.apple.com/app/id…",      hint: "Your apps.apple.com link." },
    apk:    { name: "APK",        cta: "Visit Site",       how: "Not hosted here — links to your site",   label: "Your site's download page",      ph: "https://yoursite.com/download",       hint: "We never host APK files." }
  };
  const SEEDMAP = { "Website": "webapp", "Web app": "webapp", "SaaS tool": "webapp", "Mobile app": "mobile", "AI agent": "agent", "AI Agent": "agent", "AI LLM": "model", "APK": "apk" };
  const CATS = ["Productivity", "AI", "Developer Tools", "Finance", "Business", "Team", "Design", "Education", "Entertainment", "Health", "Other"];

  function parse(u) {
    try { return new URL(String(u || "").trim()); } catch (e) { return null; }
  }

  function validate(key, url, url2) {
    const t = TYPES[key];
    if (!t) return "Choose a product type.";
    const u = parse(url);
    if (!u || u.protocol !== "https:") return t.label + " must be a full https:// link.";
    const host = u.hostname.toLowerCase();
    if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/.test(host) || !host.includes(".")) return "That link isn't a public address.";
    if (key === "mobile" && !/(^|\.)(apps|itunes)\.apple\.com$/.test(host)) return "Use your App Store link (apps.apple.com).";
    if (key === "apk" && /\.(apk|aab|xapk|zip|exe|dmg)$/i.test(u.pathname)) return "We don't host APKs — link to the page on your site.";
    if (url2) {
      const g = parse(url2);
      if (key !== "mobile") return "";
      if (!g || g.protocol !== "https:" || g.hostname.toLowerCase() !== "play.google.com") return "Google Play link must be on play.google.com.";
    }
    return "";
  }

  const normUrl = u => {
    const p = parse(u);
    return p ? (p.hostname + p.pathname).toLowerCase().replace(/\/$/, "") : "";
  };

  // ---------- VH global ----------
  const VH = {
    stats: {},
    seen: new Set(),
    get(id) { return Object.assign({ views: 0, clicks: 0 }, this.stats[id]); },
    track(id, field) {
      const s = this.stats[id] = this.get(id);
      s[field]++;
      const c = sb();
      if (c) c.rpc("track_event", { p_id: id, p_kind: field }).then(() => {}, () => {});
    },
    view(id) {
      if (this.seen.has(id)) return;
      this.seen.add(id);
      this.track(id, "views");
    },
    open(id, which) {
      const p = PRODUCTS.find(x => x.id === id);
      if (!p) return;
      const url = which === 2 ? p.url2 : p.url;
      if (!url || validate(p.typeKey, which === 2 ? p.url : url, which === 2 ? url : "")) {
        return App.toast("This link isn't available yet", "error");
      }
      this.track(id, "clicks");
      window.open(url, "_blank", "noopener,noreferrer");
    },
    sig: "",
    async pull() {
      const c = sb();
      if (!c) return false;
      try {
        const [s, l] = await Promise.all([
          c.from("listing_stats").select("*"),
          c.from("listings").select("*").eq("status", "live").order("created_at", { ascending: false })
        ]);
        if (l.error) throw l.error;

        (s.data || []).forEach(r => {
          this.stats[r.id] = { views: Number(r.views) || 0, clicks: Number(r.clicks) || 0 };
        });

        const rows = l.data || [];
        const ids = [...new Set(rows.map(r => r.owner_id).filter(Boolean))];
        const prof = {};
        if (ids.length) {
          const pr = await c.from("public_profiles").select("*").in("id", ids);
          (pr.data || []).forEach(x => { prof[x.id] = x; });
        }

        PRODUCTS.length = 0;
        rows.forEach(r => {
          const p = mk(fromRow(r, prof[r.owner_id]));
          PRODUCTS.push(p);
        });

        const sig = JSON.stringify([rows.length, Object.keys(prof).length]);
        const changed = sig !== this.sig;
        this.sig = sig;
        return changed;
      } catch (e) {
        console.warn("[Vibehouse] pull failed", e);
        return false;
      }
    }
  };
  window.VH = VH;

  function fromRow(r, pr) {
    pr = pr || {};
    const own = App.user && r.owner_id && String(r.owner_id) === String(App.user.id) ? App.user.name : "";
    return {
      ownerUsername: pr.username || "",
      ownerAvatarUrl: pr.avatar_url || null,
      ownerBio: pr.bio || "",
      ownerRole: pr.headline || "",
      ownerWebsite: pr.website || "",
      ownerTwitter: pr.twitter || "",
      id: r.id,
      typeKey: r.type_key || SEEDMAP[r.type] || "webapp",
      name: r.name,
      category: r.category,
      desc: r.description,
      longDesc: r.long_desc,
      url: r.url,
      url2: r.url2,
      cta: r.cta,
      owner: own || pr.full_name || r.owner,
      ownerId: r.owner_id,
      price: r.price,
      pricing: r.pricing,
      logoUrl: r.logo_url,
      twitter: r.twitter,
      created: r.created_at,
      features: r.features || [],
      inputs: r.inputs || [],
      screenshots: r.screenshots || [],
      video: r.video_url || null,
      pricingDetails: r.pricing_details || "",
      version: r.version || "",
      releaseNotes: r.release_notes || "",
      github: r.github || "",
      featured: !!r.featured
    };
  }

  function mk(l) {
    const t = TYPES[l.typeKey] || TYPES.webapp;
    const cta = l.typeKey === "agent" && l.cta === "Connect" ? "Connect" : t.cta;
    const free = !l.pricing || l.pricing === "Free";
    return {
      id: l.id,
      logoColor: IconEngine.colorFrom(l.id),
      ownerColor: IconEngine.colorFrom(l.id + "o"),
      logoUrl: l.logoUrl || null,
      ownerAvatarUrl: l.ownerAvatarUrl || null,
      name: l.name,
      typeKey: l.typeKey,
      type: t.name,
      category: l.category || "Other",
      price: free ? "Free" : (l.price || l.pricing),
      priceValue: free ? 0 : 1,
      desc: l.desc || "",
      longDesc: l.longDesc || l.desc || "",
      owner: l.owner || "Maker",
      ownerId: l.ownerId || "",
      ownerRole: l.ownerRole || "Vibe coder",
      ownerBio: l.ownerBio || "",
      ownerUsername: l.ownerUsername || "",
      ownerWebsite: l.ownerWebsite || "",
      ownerTwitter: l.ownerTwitter || "",
      tags: [t.name.toLowerCase(), (l.category || "").toLowerCase()].filter(Boolean),
      features: l.features || [],
      inputs: l.inputs || [],
      screenshots: l.screenshots || [],
      video: l.video || null,
      pdf: null,
      intro: l.desc || "",
      pricingDetails: l.pricingDetails || "",
      version: l.version || "",
      releaseNotes: l.releaseNotes || "",
      github: l.github || "",
      featured: !!l.featured,
      status: "live",
      waitlist: false,
      users: 0,
      rating: 0,
      launched: (l.created || new Date().toISOString()).slice(0, 10),
      url: l.url || "",
      url2: l.url2 || "",
      cta,
      twitter: l.twitter || "",
      isListing: true
    };
  }

  function merge(p) {
    const i = PRODUCTS.findIndex(x => x.id === p.id);
    if (i >= 0) PRODUCTS[i] = p;
    else PRODUCTS.unshift(p);
  }

  window.VHI = { TYPES, CATS, validate, parse, normUrl, mk, merge, sb, esc };

  // ---------- Product detail (CTA + clickable icon + full edit) ----------
  const origProduct = App.renderProduct.bind(App);
  App.renderProduct = function (el, id) {
    origProduct(el, id);
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    VH.view(id);
    const t = TYPES[p.typeKey] || TYPES.webapp;
    const s = VH.get(id);
    const acts = el.querySelector(".detail-actions");
    if (!acts) return;

    // Make the product logo clickable for the owner
    const logoEl = el.querySelector(".detail-logo");
    if (logoEl && App.isProductOwner(p)) {
      logoEl.style.cursor = "pointer";
      logoEl.title = "Click to change icon";
      logoEl.style.position = "relative";

      // Add subtle overlay hint
      if (!logoEl.querySelector(".logo-edit-hint")) {
        const hint = document.createElement("div");
        hint.className = "logo-edit-hint";
        hint.innerHTML = "Change";
        hint.style.cssText = `
          position:absolute; inset:0; background:rgba(0,0,0,.55);
          display:none; place-items:center; font-size:12px; font-weight:600;
          border-radius:inherit; color:#fff;`;
        logoEl.appendChild(hint);
        logoEl.addEventListener("mouseenter", () => hint.style.display = "grid");
        logoEl.addEventListener("mouseleave", () => hint.style.display = "none");
      }

      // Hidden file input
      let fileInput = document.getElementById("productLogoInput");
      if (!fileInput) {
        fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.id = "productLogoInput";
        fileInput.accept = "image/*";
        fileInput.style.display = "none";
        document.body.appendChild(fileInput);
      }

      logoEl.onclick = () => fileInput.click();

      fileInput.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith("image/")) {
          App.toast("Please choose an image file", "error");
          return;
        }
        try {
          App.toast("Uploading icon…", "success");
          const dataUrl = await IconEngine.fileToDataUrl(file);

          // Upload to storage
          let logoRes = null;
          if (window.VibeBackend) {
            logoRes = await window.VibeBackend.uploadProductLogo(p.id, dataUrl);
          }

          if (logoRes && logoRes.ok && logoRes.url) {
            // Update database
            const c = sb();
            if (c) {
              await c.from("listings").update({ logo_url: logoRes.url }).eq("id", p.id);
            }
            p.logoUrl = logoRes.url;
            p._resolvedLogo = logoRes.url;
          } else {
            // Fallback to data URL (temporary)
            p.logoUrl = dataUrl;
            p._resolvedLogo = dataUrl;
          }

          // Refresh the logo in the hero
          const newLogoHtml = App.productLogoHtml(p, "detail-logo");
          logoEl.outerHTML = newLogoHtml;

          // Re-attach click handler after replace
          App.route(); // simplest reliable refresh
          App.toast("Product icon updated", "success");
        } catch (err) {
          console.error(err);
          App.toast("Could not update icon", "error");
        } finally {
          fileInput.value = "";
        }
      };
    }

    // CTA buttons
    acts.innerHTML = "";
    const mkBtn = (label, which, url, primary) => url
      ? `<button class="btn ${primary ? "btn-primary" : "btn-ghost"}" onclick="VH.open('${esc(id)}',${which})">${esc(label)} ↗</button>`
      : `<button class="btn btn-ghost" disabled title="Link not added yet">${esc(label)}</button>`;

    let html = mkBtn(p.cta || t.cta, 1, p.url, true);
    if (p.typeKey === "mobile" && p.url2) html += mkBtn("Get on Google Play", 2, p.url2, false);

    if (App.isProductOwner(p)) {
      html += `<button class="btn btn-ghost" id="vhEditBtn">Edit product</button>`;
    }

    acts.innerHTML = html;

    const note = !p.url ? "The maker hasn't added a link yet"
      : p.typeKey === "apk" ? "Opens the maker's site. APKs are never hosted here."
      : "Opens in a new tab";

    acts.insertAdjacentHTML("afterend",
      `<p class="vh-note vh-line">${esc(t.name)} · ${esc(note)} · <b>${num(s.views)}</b> views · <b>${num(s.clicks)}</b> opens</p>
       <div id="vhEdit"></div>`
    );

    $id("vhEditBtn")?.addEventListener("click", () => openFullEdit(p));
  };

  // ============================================================
  // FULL PRODUCT EDIT FORM (owner only)
  // ============================================================
  function openFullEdit(p) {
    const t = TYPES[p.typeKey] || TYPES.webapp;
    const overlay = document.getElementById("modalOverlay");
    const body = document.getElementById("modalBody");
    if (!overlay || !body) return;

    const features = (p.features || []).join(", ");
    const inputs = (p.inputs || []).join(", ");

    body.innerHTML = `
      <h2 class="modal-title">Edit product</h2>
      <form id="editProductForm" class="vh-form" style="max-width:100%">
        <div class="field">
          <label>Product name</label>
          <input id="epName" maxlength="80" value="${esc(p.name)}" required>
        </div>
        <div class="field">
          <label>One-liner</label>
          <input id="epDesc" maxlength="160" value="${esc(p.desc)}" required>
        </div>
        <div class="field">
          <label>Full description</label>
          <textarea id="epLong" rows="4" maxlength="4000">${esc(p.longDesc || "")}</textarea>
        </div>

        <div class="field">
          <label>${esc(t.label)}</label>
          <input id="epUrl" type="url" value="${esc(p.url || "")}" placeholder="${esc(t.ph)}">
        </div>
        ${p.typeKey === "mobile" ? `
        <div class="field">
          <label>Google Play link (optional)</label>
          <input id="epUrl2" type="url" value="${esc(p.url2 || "")}">
        </div>` : ""}

        ${p.typeKey === "agent" ? `
        <div class="field">
          <label>Button label</label>
          <select id="epCta">
            <option ${p.cta === "Try" ? "selected" : ""}>Try</option>
            <option ${p.cta === "Connect" ? "selected" : ""}>Connect</option>
          </select>
        </div>` : ""}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field">
            <label>Category</label>
            <select id="epCat">
              ${CATS.map(c => `<option ${p.category === c ? "selected" : ""}>${c}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Pricing model</label>
            <select id="epPricing">
              ${["Free", "Freemium", "Free trial", "Paid"].map(c =>
                `<option ${(p.pricing || (p.priceValue === 0 ? "Free" : "Paid")) === c ? "selected" : ""}>${c}</option>`
              ).join("")}
            </select>
          </div>
        </div>

        <div class="field" id="epPriceWrap" style="display:${(p.priceValue === 0 || p.pricing === "Free") ? "none" : "block"}">
          <label>Price (e.g. ₹499/mo or $12/mo)</label>
          <input id="epPrice" maxlength="40" value="${esc(p.price || "")}">
        </div>

        <div class="field">
          <label>Pricing details (optional)</label>
          <input id="epPD" maxlength="200" value="${esc(p.pricingDetails || "")}">
        </div>

        <div class="field">
          <label>Key features (comma separated)</label>
          <input id="epFeatures" value="${esc(features)}" placeholder="Smart prioritization, AI drafts, Daily digest">
        </div>

        <div class="field">
          <label>Supported inputs (comma separated)</label>
          <input id="epInputs" value="${esc(inputs)}" placeholder="Text, Image, PDF">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field">
            <label>Version (optional)</label>
            <input id="epVer" maxlength="20" value="${esc(p.version || "")}">
          </div>
          <div class="field">
            <label>GitHub (optional)</label>
            <input id="epGit" type="url" value="${esc(p.github || "")}">
          </div>
        </div>

        <div class="field">
          <label>What's new / Release notes (optional)</label>
          <textarea id="epRel" rows="2" maxlength="300">${esc(p.releaseNotes || "")}</textarea>
        </div>

        <div class="field">
          <label>Demo video URL (YouTube / Vimeo / Loom / .mp4)</label>
          <input id="epVideo" type="url" value="${esc(p.video || "")}">
        </div>

        <div class="field">
          <label>Logo URL (or keep current)</label>
          <input id="epLogo" type="url" value="${esc(p.logoUrl || "")}" placeholder="https://.../logo.png">
        </div>

        <p class="vh-note" id="epMsg" style="min-height:1.4em"></p>

        <div style="display:flex;gap:10px;margin-top:8px">
          <button type="submit" class="btn btn-primary" id="epSave" style="flex:1">Save changes</button>
          <button type="button" class="btn btn-ghost" id="epCancel">Cancel</button>
        </div>

        <div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px">
          <button type="button" class="btn btn-ghost" id="epDelete" style="color:var(--danger);width:100%">
            Delete this product
          </button>
        </div>
      </form>
    `;

    overlay.classList.add("open");

    document.getElementById("epPricing").onchange = e => {
      document.getElementById("epPriceWrap").style.display =
        e.target.value === "Free" ? "none" : "block";
    };

    document.getElementById("epCancel").onclick = () => App.closeModal();

    document.getElementById("epDelete").onclick = async () => {
      if (!confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
      const c = sb();
      if (!c) return App.toast("Backend not ready", "error");
      const { error } = await c.from("listings").delete().eq("id", p.id);
      if (error) return App.toast("Could not delete: " + error.message, "error");
      const i = PRODUCTS.findIndex(x => x.id === p.id);
      if (i >= 0) PRODUCTS.splice(i, 1);
      App.closeModal();
      App.toast("Product deleted", "success");
      App.go("/dashboard");
    };

    document.getElementById("editProductForm").onsubmit = async e => {
      e.preventDefault();
      const msg = document.getElementById("epMsg");
      const btn = document.getElementById("epSave");
      btn.disabled = true;
      msg.style.color = "var(--text-muted)";
      msg.textContent = "Saving...";

      const name = document.getElementById("epName").value.trim();
      const desc = document.getElementById("epDesc").value.trim();
      const longDesc = document.getElementById("epLong").value.trim();
      const url = document.getElementById("epUrl").value.trim();
      const url2 = (document.getElementById("epUrl2")?.value || "").trim();
      const cta = document.getElementById("epCta")?.value || t.cta;
      const category = document.getElementById("epCat").value;
      const pricing = document.getElementById("epPricing").value;
      const price = document.getElementById("epPrice").value.trim();
      const pricingDetails = document.getElementById("epPD").value.trim();
      const features = document.getElementById("epFeatures").value
        .split(",").map(s => s.trim()).filter(Boolean);
      const inputs = document.getElementById("epInputs").value
        .split(",").map(s => s.trim()).filter(Boolean);
      const version = document.getElementById("epVer").value.trim();
      const github = document.getElementById("epGit").value.trim();
      const releaseNotes = document.getElementById("epRel").value.trim();
      const video = document.getElementById("epVideo").value.trim();
      const logoUrl = document.getElementById("epLogo").value.trim() || p.logoUrl;

      if (name.length < 2) {
        msg.style.color = "var(--danger)";
        msg.textContent = "Name is too short";
        btn.disabled = false;
        return;
      }
      if (desc.length < 10) {
        msg.style.color = "var(--danger)";
        msg.textContent = "One-liner must be at least 10 characters";
        btn.disabled = false;
        return;
      }

      const err = validate(p.typeKey, url, url2);
      if (err) {
        msg.style.color = "var(--danger)";
        msg.textContent = err;
        btn.disabled = false;
        return;
      }

      const payload = {
        name,
        description: desc,
        long_desc: longDesc,
        url,
        url2: url2 || null,
        cta,
        category,
        pricing,
        price: pricing === "Free" ? "Free" : (price || pricing),
        pricing_details: pricingDetails || null,
        features,
        inputs,
        version: version || null,
        github: github || null,
        release_notes: releaseNotes || null,
        video_url: video || null,
        logo_url: logoUrl || null
      };

      const c = sb();
      if (!c) {
        msg.style.color = "var(--danger)";
        msg.textContent = "Backend not ready";
        btn.disabled = false;
        return;
      }

      const { error } = await c.from("listings").update(payload).eq("id", p.id);
      if (error) {
        msg.style.color = "var(--danger)";
        msg.textContent = "Could not save: " + error.message;
        btn.disabled = false;
        return;
      }

      Object.assign(p, {
        name,
        desc,
        longDesc,
        url,
        url2,
        cta,
        category,
        pricing,
        price: payload.price,
        priceValue: pricing === "Free" ? 0 : 1,
        pricingDetails,
        features,
        inputs,
        version,
        github,
        releaseNotes,
        video,
        logoUrl
      });

      App.closeModal();
      App.toast("Product updated", "success");
      App.route();
    };
  }

  // ---------- Profile (me + others) ----------
  const origProfile = App.renderProfile.bind(App);
  App.renderProfile = async function (el, id) {
    const isMe = id === "me" || (App.user && (id === App.user.id || (App.user.username && id === App.user.username)));

    if (isMe && !App.user) {
      el.innerHTML = `
        <div class="empty" style="padding:80px 20px">
          <h3>Sign in to see your profile</h3>
          <p style="margin:12px 0 24px">Your profile and tools live here once you're logged in.</p>
          <button class="btn btn-primary" id="pfLogin">Log in</button>
          <button class="btn btn-ghost" id="pfSignup" style="margin-left:8px">Sign up</button>
        </div>`;
      document.getElementById("pfLogin").onclick = () => App.openAuth("login");
      document.getElementById("pfSignup").onclick = () => App.openAuth("signup");
      return;
    }

    if (isMe) {
      const draw = async () => {
        const u = App.user;
        const list = PRODUCTS.filter(p => App.isProductOwner(p));
        const photo = u.photo;

        el.innerHTML = `
          <button class="btn btn-ghost btn-sm" onclick="history.back()" style="margin-bottom:20px">← Back</button>
          <div class="profile-header">
            <div class="profile-avatar" id="pfAvatar" style="background:linear-gradient(135deg,var(--accent),#a29bfe);cursor:pointer" title="Change photo">
              ${photo ? `<img src="${esc(photo)}" alt="${esc(u.name)}">` : esc(String(u.avatar || u.name[0] || "?").toUpperCase())}
              <input type="file" id="pfPhoto" accept="image/*" style="display:none">
            </div>
            <div>
              <h1 class="page-title" style="margin-bottom:4px">${esc(u.name)}</h1>
              ${u.username ? `<p style="color:var(--text-muted);margin-bottom:6px">@${esc(u.username)}</p>` : ""}
              ${u.headline ? `<p style="margin-bottom:6px">${esc(u.headline)}</p>` : ""}
              ${u.bio ? `<p style="font-size:14px;max-width:480px;color:var(--text-muted)">${esc(u.bio)}</p>` : ""}
              <button class="btn btn-ghost btn-sm" id="pfEdit" style="margin-top:10px">Edit profile</button>
              <div class="profile-stats">
                <div class="profile-stat"><strong>${list.length}</strong><span>Tools</span></div>
                <div class="profile-stat"><strong>${u.karma || 0}</strong><span>Karma</span></div>
                <div class="profile-stat"><strong>${u.followers || 0}</strong><span>Followers</span></div>
              </div>
            </div>
          </div>
          <h2 style="font-size:18px;font-weight:700;margin-bottom:16px">Your tools</h2>
          <div class="products-list" id="pfProducts"></div>`;

        App.renderProductCards(document.getElementById("pfProducts"), list);

        document.getElementById("pfEdit").onclick = () => openEdit(u, draw);

        const box = document.getElementById("pfAvatar");
        const inp = document.getElementById("pfPhoto");
        box.onclick = () => inp.click();
        inp.onclick = e => e.stopPropagation();
        inp.onchange = async e => {
          const file = e.target.files?.[0];
          if (!file || !file.type.startsWith("image/")) return App.toast("Please choose an image file", "error");
          try {
            const dataUrl = await IconEngine.fileToDataUrl(file);
            const r = await VibeBackend.uploadAvatar(u.id, dataUrl);
            if (r.ok && r.url) {
              App.user.photo = r.url;
              App.updateUserChip();
              draw();
              App.toast("Profile photo updated", "success");
            } else {
              App.toast(r.error || "Upload failed", "error");
            }
          } catch (err) {
            App.toast("Could not process image", "error");
          }
        };
      };
      await draw();
      return;
    }

    // Other maker profile
    const makerProducts = PRODUCTS.filter(p => p.ownerId === id);
    if (!makerProducts.length) {
      el.innerHTML = `<div class="empty"><h3>Profile not found</h3><a href="/" style="color:var(--accent)">← Home</a></div>`;
      return;
    }
    const maker = makerProducts[0];
    const name = maker.owner || "Unknown";
    const photo = maker.ownerAvatarUrl;

    el.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="history.back()" style="margin-bottom:20px">← Back</button>
      <div class="profile-header">
        <div class="profile-avatar" style="background:linear-gradient(135deg,var(--accent),#a29bfe)">
          ${photo ? `<img src="${esc(photo)}" alt="${esc(name)}">` : esc(name[0])}
        </div>
        <div>
          <h1 class="page-title" style="margin-bottom:4px">${esc(name)}</h1>
          <p style="color:var(--text-muted);margin-bottom:8px">${esc(maker.ownerRole || "Vibe Coder")}</p>
          <p style="font-size:14px;max-width:480px">${esc(maker.ownerBio || "")}</p>
          <div class="profile-stats">
            <div class="profile-stat"><strong>${makerProducts.length}</strong><span>Tools</span></div>
          </div>
          <div class="vh-actions" style="margin-top:12px">
            <button class="btn btn-primary" id="vhFollow">Follow</button>
            <span class="vh-note" id="vhFollowers"></span>
          </div>
        </div>
      </div>
      <h2 style="font-size:18px;font-weight:700;margin-bottom:16px">Tools by ${esc(name)}</h2>
      <div class="products-list" id="profileProducts"></div>`;

    App.renderProductCards(document.getElementById("profileProducts"), makerProducts);

    const showFollowers = async () => {
      const n = await VibeBackend.followerCount(id);
      const f = $id("vhFollowers");
      if (f) f.textContent = n + " follower" + (n === 1 ? "" : "s");
    };
    showFollowers();

    $id("vhFollow").onclick = async e => {
      if (!App.user) { App.openAuth("login"); return; }
      const currentlyFollowing = e.target.textContent === "Following";
      const r = await VibeBackend.toggleFollow(App.user.id, id, !currentlyFollowing);
      if (r.ok) {
        e.target.textContent = currentlyFollowing ? "Follow" : "Following";
        e.target.className = "btn " + (currentlyFollowing ? "btn-primary" : "btn-ghost");
        showFollowers();
      }
    };
  };

  function openEdit(profile, rerender) {
    const overlay = document.getElementById("modalOverlay");
    const body = document.getElementById("modalBody");
    if (!overlay || !body) return;
    body.innerHTML = `
      <h2 class="modal-title">Edit profile</h2>
      <form id="epForm">
        <div class="field"><label>Name</label><input id="epName" maxlength="60" value="${esc(profile.name)}" required></div>
        <div class="field"><label>Username</label><input id="epUser" maxlength="30" value="${esc(profile.username || "")}" placeholder="yourname"></div>
        <div class="field"><label>Headline</label><input id="epHead" maxlength="80" value="${esc(profile.headline || "")}" placeholder="Vibe coder building..."></div>
        <div class="field"><label>Bio</label><textarea id="epBio" rows="3" maxlength="300">${esc(profile.bio || "")}</textarea></div>
        <button class="btn btn-primary" id="epSave" style="width:100%;justify-content:center">Save</button>
      </form>
      <div class="modal-msg" id="epMsg"></div>`;
    overlay.classList.add("open");

    document.getElementById("epForm").addEventListener("submit", async e => {
      e.preventDefault();
      const f = {
        full_name: document.getElementById("epName").value.trim(),
        username: document.getElementById("epUser").value.trim().replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_.-]/g, ""),
        headline: document.getElementById("epHead").value.trim(),
        bio: document.getElementById("epBio").value.trim()
      };
      const msg = document.getElementById("epMsg");
      const btn = document.getElementById("epSave");
      btn.disabled = true;
      msg.style.color = "var(--text-muted)";
      msg.textContent = "Saving...";

      const res = await VibeBackend.updateProfile(App.user.id, f);
      if (!res.ok) {
        btn.disabled = false;
        msg.style.color = "var(--danger)";
        msg.textContent = res.error || "Could not save";
        return;
      }
      Object.assign(App.user, {
        name: f.full_name || App.user.name,
        avatar: (f.full_name || App.user.name || "?")[0].toUpperCase(),
        username: f.username,
        headline: f.headline,
        bio: f.bio
      });
      App.updateUserChip();
      App.closeModal();
      App.toast("Profile updated", "success");
      rerender();
    });
  }

  // Sidebar links
  const nav = document.querySelector(".sidebar-nav");
  if (nav) {
    nav.insertAdjacentHTML("beforeend", `
      <a href="/dashboard" class="nav-item" data-page="dashboard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/></svg>
        <span class="nav-label">Dashboard</span>
      </a>
      <a href="/contact" class="nav-item" data-page="contact">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4zM4 7l8 6 8-6"/></svg>
        <span class="nav-label">Contact / Advertise</span>
      </a>`);
  }

  window.VH.refreshCounts = async function () {
    if (!App.user) return;
    App.user.tools = PRODUCTS.filter(p => App.isProductOwner(p)).length;
    const n = await VibeBackend.followerCount(App.user.id);
    if (n != null) App.user.followers = n;
    App.updateUserChip();
  };
})();

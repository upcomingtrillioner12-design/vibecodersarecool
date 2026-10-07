// ============================================================
// Vibehouse Hub — product types, access mechanisms, submissions,
// owner editing, tracked views/clicks, dashboard, contact/advertise.
// Loads after app.js.  Supabase when configured, localStorage otherwise.
//
// Debug notes (what changed vs the previous version):
//  1. Profile "me": removed the duplicate Followers stat.
//  2. Owner name: your own listings always show your current account name
//     (no more "CEO" from an old saved value).
//  3. Edit panel / contact form no longer rely on implicit global element ids.
//  4. Dashboard + "my profile" lists use the regular horizontal row layout.
//  5. Notifications read is wrapped in try/catch (bad JSON can't break the top bar).
// ============================================================
(function () {
  const CONTACT = "upcomingtrillioner12@gmail.com";
  const LS = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sb = () => (window.VibeBackend && VibeBackend.isReady()) ? VibeBackend.client() : null;
  const num = n => (App.formatNum ? App.formatNum(n) : n);
  const $id = id => document.getElementById(id);

  // ---------- Product types → how users reach them ----------
  const TYPES = {
    webapp: { name: "Web App",    cta: "Open App",         how: "Redirect to your live URL",             label: "Live URL",                       ph: "https://yourapp.com",                 hint: "The page where people open your app." },
    agent:  { name: "AI Agent",   cta: "Try",              how: "Redirect to your service URL",           label: "Service URL",                    ph: "https://youragent.com",               hint: "Where people try or connect to your agent. Describe it in the description above." },
    model:  { name: "AI Model",   cta: "Use Model",        how: "Hugging Face link or API endpoint",      label: "Hugging Face link or API URL",   ph: "https://huggingface.co/you/model",    hint: "A model page or the API docs/endpoint people should use." },
    mobile: { name: "Mobile App", cta: "Get on App Store", how: "Redirect to the App Store",              label: "App Store link",                 ph: "https://apps.apple.com/app/id…",      hint: "Your apps.apple.com link. Add a Google Play link too if you have one." },
    apk:    { name: "APK",        cta: "Visit Site",       how: "Not hosted here — links to your site",   label: "Your site's download page",      ph: "https://yoursite.com/download",       hint: "We never host APK files. Link to the page on your own site." }
  };
  const SEEDMAP = { "Website": "webapp", "Web app": "webapp", "SaaS tool": "webapp", "Mobile app": "mobile", "AI agent": "agent", "AI Agent": "agent", "AI LLM": "model", "APK": "apk" };
  const CATS = ["Productivity", "AI", "Developer Tools", "Finance", "Business", "Team", "Design", "Education", "Entertainment", "Health", "Other"];

  function parse(u) { try { return new URL(String(u || "").trim()); } catch (e) { return null; } }
  function validate(key, url, url2) {
    const t = TYPES[key]; if (!t) return "Choose a product type.";
    const u = parse(url);
    if (!u || u.protocol !== "https:") return t.label + " must be a full https:// link.";
    const host = u.hostname.toLowerCase();
    if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/.test(host) || !host.includes(".")) return "That link isn't a public address.";
    if (key === "mobile" && !/(^|\.)(apps|itunes)\.apple\.com$/.test(host)) return "Use your App Store link (apps.apple.com).";
    if (key === "apk" && /\.(apk|aab|xapk|zip|exe|dmg)$/i.test(u.pathname)) return "We don't host APKs — link to the page on your site, not the file itself.";
    if (url2) {
      const g = parse(url2);
      if (key !== "mobile") return "";
      if (!g || g.protocol !== "https:" || g.hostname.toLowerCase() !== "play.google.com") return "Google Play link must be on play.google.com.";
    }
    return "";
  }
  const normUrl = u => { const p = parse(u); return p ? (p.hostname + p.pathname).toLowerCase().replace(/\/$/, "") : ""; };

  // Your own listings always show your current account name
  const isMineById = p => !!(App.user && p && p.ownerId && String(p.ownerId) === String(App.user.id));
  function fixOwnerNames() {
    if (!App.user || !App.user.name) return;
    PRODUCTS.forEach(p => { if (p.isListing && isMineById(p)) p.owner = App.user.name; });
  }

  // ---------- state ----------
  const VH = {
    stats: LS("vh_stats", {}),
    seen: new Set(),
    get(id) { return Object.assign({ views: 0, clicks: 0 }, this.stats[id]); },
    track(id, field) {
      const s = this.stats[id] = this.get(id); s[field]++; save("vh_stats", this.stats);
      const c = sb(); if (c) c.rpc("track_event", { p_id: id, p_kind: field }).then(() => {}, () => {});
    },
    view(id) { if (this.seen.has(id)) return; this.seen.add(id); this.track(id, "views"); },
    open(id, which) {
      const p = PRODUCTS.find(x => x.id === id); if (!p) return;
      const url = which === 2 ? p.url2 : p.url;
      if (!url || validate(p.typeKey, which === 2 ? p.url : url, which === 2 ? url : "")) return App.toast("This link isn't available yet", "error");
      this.track(id, "clicks");
      window.open(url, "_blank", "noopener,noreferrer");
    },
    sig: "",
    async pull() {
      const c = sb(); if (!c) return false;
      try {
        const [s, l] = await Promise.all([c.from("listing_stats").select("*"), c.from("listings").select("*").eq("status", "live").order("created_at", { ascending: false })]);
        if (l.error) throw l.error;
        (s.data || []).forEach(r => { this.stats[r.id] = { views: Number(r.views) || 0, clicks: Number(r.clicks) || 0 }; });
        const rows = l.data || [], ids = [...new Set(rows.map(r => r.owner_id).filter(Boolean))], prof = {};
        if (ids.length) { const pr = await c.from("public_profiles").select("*").in("id", ids); (pr.data || []).forEach(x => { prof[x.id] = x; }); }
        const live = new Set(rows.map(r => r.id)), localIds = new Set(LS("vh_listings", []).map(x => x.id));
        for (let i = PRODUCTS.length - 1; i >= 0; i--) if (PRODUCTS[i].isListing && !live.has(PRODUCTS[i].id) && !localIds.has(PRODUCTS[i].id)) PRODUCTS.splice(i, 1);
        rows.forEach(r => merge(mk(fromRow(r, prof[r.owner_id]))));
        fixOwnerNames();
        const sig = JSON.stringify([rows, prof]); const changed = sig !== this.sig; this.sig = sig;
        save("vh_stats", this.stats); save("vh_live_cache", { rows, prof, sig });
        return changed;
      } catch (e) { console.warn("[Vibehouse] pull failed", e); return false; }
    }
  };
  window.VH = VH;

  function fromRow(r, pr) {
    pr = pr || {};
    const own = App.user && r.owner_id && String(r.owner_id) === String(App.user.id) ? App.user.name : "";
    return { ownerUsername: pr.username || "", ownerAvatarUrl: pr.avatar_url || null, ownerBio: pr.bio || "", ownerRole: pr.headline || "", ownerWebsite: pr.website || "", ownerTwitter: pr.twitter || "", id: r.id, typeKey: r.type_key || SEEDMAP[r.type] || "webapp", name: r.name, category: r.category, desc: r.description, longDesc: r.long_desc,
      url: r.url, url2: r.url2, cta: r.cta, owner: own || pr.full_name || r.owner, ownerId: r.owner_id, price: r.price, pricing: r.pricing, logoUrl: r.logo_url, twitter: r.twitter, created: r.created_at,
      features: r.features || [], inputs: r.inputs || [], screenshots: r.screenshots || [], video: r.video_url || null, pricingDetails: r.pricing_details || "", version: r.version || "", releaseNotes: r.release_notes || "", github: r.github || "", featured: !!r.featured };
  }
  function normListing(l) { // migrate older local format
    if (l.links && !l.url) { l.url = l.links.website || l.links.apk || l.links.agent || l.links.api || ""; }
    if (!l.typeKey) l.typeKey = SEEDMAP[l.type] || "webapp";
    return l;
  }
  function mk(l) {
    const t = TYPES[l.typeKey] || TYPES.webapp;
    const cta = l.typeKey === "agent" && l.cta === "Connect" ? "Connect" : t.cta;
    const free = !l.pricing || l.pricing === "Free";
    return { id: l.id, logoColor: IconEngine.colorFrom(l.id), ownerColor: IconEngine.colorFrom(l.id + "o"), logoUrl: l.logoUrl || null, ownerAvatarUrl: l.ownerAvatarUrl || null,
      name: l.name, typeKey: l.typeKey, type: t.name, category: l.category || "Other", price: free ? "Free" : (l.price || l.pricing), priceValue: free ? 0 : 1,
      desc: l.desc || "", longDesc: l.longDesc || l.desc || "", owner: l.owner || "Maker", ownerId: l.ownerId || "me", ownerRole: l.ownerRole || "Vibe coder", ownerBio: l.ownerBio || "", ownerUsername: l.ownerUsername || "", ownerWebsite: l.ownerWebsite || "", ownerTwitter: l.ownerTwitter || "",
      tags: [t.name.toLowerCase(), (l.category || "").toLowerCase()].filter(Boolean), features: l.features || [], inputs: l.inputs || [], screenshots: l.screenshots || [], video: l.video || null, pdf: null, intro: l.desc || "", pricingDetails: l.pricingDetails || "", version: l.version || "", releaseNotes: l.releaseNotes || "", github: l.github || "", featured: !!l.featured,
      status: "live", waitlist: false, users: 0, rating: 0, launched: (l.created || new Date().toISOString()).slice(0, 10),
      url: l.url || "", url2: l.url2 || "", cta, twitter: l.twitter || "", isListing: true };
  }
  function merge(p) { const i = PRODUCTS.findIndex(x => x.id === p.id); if (i >= 0) PRODUCTS[i] = p; else PRODUCTS.unshift(p); }

  // seeds → new type names; local listings
  PRODUCTS.forEach(p => { if (!p.typeKey) { p.typeKey = SEEDMAP[p.type] || "webapp"; p.type = TYPES[p.typeKey].name; } p.url = p.url || ""; p.url2 = p.url2 || ""; p.cta = TYPES[p.typeKey].cta; });
  LS("vh_listings", []).map(normListing).forEach(l => merge(mk(l)));
  { const _c = LS("vh_live_cache", null); if (_c && _c.rows) { VH.sig = _c.sig || ""; _c.rows.forEach(r => merge(mk(fromRow(r, (_c.prof || {})[r.owner_id])))); } } // paint real listings instantly on refresh

  const mine = () => PRODUCTS.filter(p => p.isListing && App.isProductOwner(p));

  window.VHI = { TYPES, CATS, validate, parse, normUrl, mk, merge, sb, LS, save, esc, refreshCounts: () => refreshCounts() };

  // ---------- product page: the access button lives here only ----------
  const origProduct = App.renderProduct.bind(App);
  App.renderProduct = function (el, id) {
    origProduct(el, id);
    const p = PRODUCTS.find(x => x.id === id); if (!p) return;
    VH.view(id);
    const t = TYPES[p.typeKey], s = VH.get(id), acts = el.querySelector(".detail-actions"); if (!acts) return;
    acts.querySelector("#btnWaitlist")?.remove();
    if (/example\.com/.test(p.video || "")) acts.querySelector("#btnVideo")?.remove();
    const mk2 = (label, which, url, primary) => url
      ? `<button class="btn ${primary ? "btn-primary" : "btn-ghost"}" onclick="VH.open('${esc(id)}',${which})">${esc(label)} ↗</button>`
      : `<button class="btn btn-ghost vh-slot" disabled title="The maker hasn't added this link yet">${esc(label)}</button>`;
    let html = mk2(p.cta || t.cta, 1, p.url, true);
    if (p.typeKey === "mobile" && p.url2) html += mk2("Get on Google Play", 2, p.url2, false);
    acts.insertAdjacentHTML("afterbegin", html);
    if (App.isProductOwner(p) && p.isListing) acts.insertAdjacentHTML("beforeend", `<button class="btn btn-ghost" id="vhEditBtn">Edit links</button>`);
    const note = !p.url ? "The maker hasn't added a link yet"
      : p.typeKey === "apk" ? "Opens the maker's site in a new tab. APKs aren't hosted here, so only install from sources you trust"
      : p.typeKey === "mobile" ? "Opens the store page in a new tab"
      : "Opens in a new tab";
    acts.insertAdjacentHTML("afterend", `<p class="vh-note vh-line">${esc(t.name)} · ${esc(note)} · <b>${num(s.views)}</b> ${s.views === 1 ? "view" : "views"} · <b>${num(s.clicks)}</b> ${s.clicks === 1 ? "open" : "opens"}</p><div id="vhEdit"></div>`);
    if (p.isListing) { // real data only: drop empty/fake blocks on user launches
      el.querySelectorAll(".card").forEach(card => {
        const h3 = (card.querySelector("h3")?.textContent || "").trim();
        if (h3 === "Features" && !(p.features || []).length) card.remove();
        else if (h3 === "Introduction from the maker") card.remove();
        else if (h3 === "Stats") card.innerHTML = `<h3>Stats</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">
          <div><strong style="display:block;font-size:18px">${num(s.views)}</strong> Views</div><div><strong style="display:block;font-size:18px">${num(s.clicks)}</strong> Opens</div>
          <div><strong style="display:block;font-size:18px">${p.launched}</strong> Launched</div><div><strong style="display:block;font-size:18px">${esc(t.name)}</strong> Type</div></div>`;
      });
    }
    $id("vhEditBtn")?.addEventListener("click", () => editPanel(p));
  };

  function editPanel(p) {
    const t = TYPES[p.typeKey], box = $id("vhEdit");
    if (!box) return;
    box.innerHTML = `<div class="vh-form" style="margin-top:12px"><div><label>${esc(t.label)}</label><input id="eUrl" type="url" value="${esc(p.url)}" placeholder="${esc(t.ph)}"></div>
      ${p.typeKey === "mobile" ? `<div><label>Google Play link (optional)</label><input id="eUrl2" type="url" value="${esc(p.url2)}" placeholder="https://play.google.com/store/apps/details?id=…"></div>` : ""}
      ${p.typeKey === "agent" ? `<div><label>Button</label><select id="eCta"><option ${p.cta === "Try" ? "selected" : ""}>Try</option><option ${p.cta === "Connect" ? "selected" : ""}>Connect</option></select></div>` : ""}
      <div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm" id="eSave">Save</button><button class="btn btn-ghost btn-sm" id="eDel">Delete listing</button></div><p class="vh-note" id="eOut"></p></div>`;
    const out = $id("eOut");
    const fail = m => { out.textContent = m; out.style.color = "var(--danger)"; };
    $id("eSave").onclick = async () => {
      const url = $id("eUrl").value.trim(), url2 = ($id("eUrl2")?.value || "").trim(), cta = $id("eCta")?.value || t.cta;
      const err = validate(p.typeKey, url, url2); if (err) return fail(err);
      const c = sb();
      if (c) { const { error } = await c.from("listings").update({ url, url2: url2 || null, cta }).eq("id", p.id); if (error) return fail("Couldn't save: " + error.message); }
      const all = LS("vh_listings", []).map(l => l.id === p.id ? Object.assign(l, { url, url2, cta }) : l); save("vh_listings", all);
      Object.assign(p, { url, url2, cta }); App.toast("Saved", "success"); App.route();
    };
    $id("eDel").onclick = async () => {
      if (!confirm("Delete “" + p.name + "”? This can't be undone.")) return;
      const c = sb(); if (c) { const { error } = await c.from("listings").delete().eq("id", p.id); if (error) return App.toast("Couldn't delete: " + error.message, "error"); }
      save("vh_listings", LS("vh_listings", []).filter(l => l.id !== p.id));
      const i = PRODUCTS.findIndex(x => x.id === p.id); if (i >= 0) PRODUCTS.splice(i, 1);
      App.toast("Deleted", "success"); App.go("/dashboard");
    };
  }

  // ---------- Launch: 3-step builder submission (launch.js replaces this with the 4-step version) ----------
  const PROVIDES = { webapp: "Live URL", agent: "Service URL + description", model: "Hugging Face link or API URL", mobile: "App Store link", apk: "Link to your own site" };
  function renderLaunch(el) {
    if (!App.user) {
      el.innerHTML = `<div class="page-header"><h1 class="page-title">Launch your product</h1><p class="page-sub">Log in to submit a web app, AI agent, AI model, mobile app or APK link.</p></div>
        <div class="vh-actions"><button class="btn btn-primary" id="gLogin">Log in</button><button class="btn btn-ghost" id="gSignup">Sign up</button></div>`;
      $id("gLogin").onclick = () => App.openAuth("login");
      $id("gSignup").onclick = () => App.openAuth("signup");
      return;
    }
    const S = { step: 1, key: null, d: { pricing: "Free", category: CATS[0], cta: "Try", email: App.user.email || "" } };
    const dots = () => `<div class="vh-steps">${["Type", "Details", "Review"].map((n, i) => `<span class="${S.step === i + 1 ? "on" : S.step > i + 1 ? "done" : ""}">${i + 1}. ${n}</span>`).join("")}</div>`;
    const head = sub => `<div class="page-header"><h1 class="page-title">Launch your product</h1><p class="page-sub">${sub}</p></div>${dots()}`;
    const val = id => ($id(id)?.value || "").trim();

    function step1() {
      el.innerHTML = head("What are you launching? Users reach it through the button on your product page.") +
        `<div class="vh-types">${Object.entries(TYPES).map(([k, t]) => `<button type="button" class="vh-type${S.key === k ? " on" : ""}" data-k="${k}"><b>${t.name}</b><span>${t.how}</span><span>You provide: ${PROVIDES[k]}</span><i>Button: “${k === "agent" ? "Try” or “Connect" : t.cta}”</i></button>`).join("")}</div>
        <div class="vh-actions"><button class="btn btn-primary" id="s1Next" ${S.key ? "" : "disabled"}>Continue</button></div>`;
      el.querySelectorAll(".vh-type").forEach(b => b.onclick = () => { S.key = b.dataset.k; step1(); });
      $id("s1Next").onclick = () => { S.step = 2; step2(); };
    }
    function step2(err) {
      const t = TYPES[S.key], d = S.d;
      el.innerHTML = head(t.name + " — " + t.how.toLowerCase() + ".") + `<form id="s2" class="vh-form" style="max-width:600px" novalidate>
        <div><label>Name</label><input id="fName" maxlength="60" value="${esc(d.name || "")}" placeholder="e.g. Invoice Nest"></div>
        <div><label>One-liner</label><input id="fDesc" maxlength="160" value="${esc(d.desc || "")}" placeholder="What it does, in one clear sentence"></div>
        <div><label>${S.key === "agent" ? "Description — what can the agent do?" : "Description (optional)"}</label><textarea id="fLong" rows="4" maxlength="1500">${esc(d.longDesc || "")}</textarea></div>
        <div><label>${t.label}</label><input id="fUrl" type="url" value="${esc(d.url || "")}" placeholder="${esc(t.ph)}"><p class="vh-note">${esc(t.hint)}</p></div>
        ${S.key === "mobile" ? `<div><label>Google Play link (optional)</label><input id="fUrl2" type="url" value="${esc(d.url2 || "")}" placeholder="https://play.google.com/store/apps/details?id=…"></div>` : ""}
        ${S.key === "agent" ? `<div><label>Button</label><select id="fCta"><option ${d.cta === "Try" ? "selected" : ""}>Try</option><option ${d.cta === "Connect" ? "selected" : ""}>Connect</option></select></div>` : ""}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label>Category</label><select id="fCat">${CATS.map(c => `<option ${d.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
          <div><label>Pricing</label><select id="fPricing">${["Free", "Freemium", "Paid"].map(c => `<option ${d.pricing === c ? "selected" : ""}>${c}</option>`).join("")}</select></div></div>
        <div id="fPriceWrap" style="display:${d.pricing === "Free" ? "none" : "block"}"><label>Price (e.g. $12/mo)</label><input id="fPrice" maxlength="30" value="${esc(d.price || "")}"></div>
        <div><label>Logo image URL (optional, https)</label><input id="fLogo" type="url" value="${esc(d.logo || "")}"></div>
        <div><label>Contact email</label><input id="fEmail" type="email" value="${esc(d.email || "")}"></div>
        <p class="vh-note" id="fErr" style="color:var(--danger)">${esc(err || "")}</p>
        <div class="vh-actions" style="margin:0"><button type="button" class="btn btn-ghost" id="s2Back">Back</button><button class="btn btn-primary">Review</button></div></form>`;
      $id("fPricing").onchange = e => { $id("fPriceWrap").style.display = e.target.value === "Free" ? "none" : "block"; };
      $id("s2Back").onclick = () => { collect(); S.step = 1; step1(); };
      $id("s2").onsubmit = e => {
        e.preventDefault(); collect();
        const m = S.d;
        if (m.name.length < 2) return step2("Add a name.");
        if (m.desc.length < 10) return step2("Write a one-liner of at least 10 characters.");
        if (S.key === "agent" && (m.longDesc || "").length < 10) return step2("Describe what the agent does.");
        const er = validate(S.key, m.url, m.url2); if (er) return step2(er);
        if (m.logo && !/^https:\/\//i.test(m.logo)) return step2("Logo must be an https:// image link.");
        if (!/^\S+@\S+\.\S+$/.test(m.email)) return step2("Add a valid contact email.");
        const dup = PRODUCTS.find(p => p.url && normUrl(p.url) === normUrl(m.url));
        if (dup) return step2("This link is already listed as “" + dup.name + "”.");
        S.step = 3; step3();
      };
    }
    function collect() {
      if (!$id("fName")) return;
      Object.assign(S.d, { name: val("fName"), desc: val("fDesc"), longDesc: val("fLong"), url: val("fUrl"), url2: val("fUrl2"), cta: val("fCta") || S.d.cta,
        category: val("fCat"), pricing: val("fPricing"), price: val("fPrice"), logo: val("fLogo"), email: val("fEmail") });
    }
    function step3(err) {
      const t = TYPES[S.key], d = S.d, cta = S.key === "agent" ? d.cta : t.cta, host = (parse(d.url) || {}).hostname || "";
      el.innerHTML = head("Check how it will look, then launch.") + `<div class="vh-panel" style="margin-top:0;max-width:600px"><h3>${esc(d.name)} <span class="vh-badge">${t.name}</span></h3>
        <p class="vh-note" style="margin:4px 0 10px">${esc(d.desc)}</p><div class="vh-actions" style="margin:0 0 8px"><button class="btn btn-primary" type="button" tabindex="-1">${esc(cta)} ↗</button>${S.key === "mobile" && d.url2 ? `<button class="btn btn-ghost" type="button" tabindex="-1">Get on Google Play ↗</button>` : ""}</div>
        <p class="vh-note">The button opens <b>${esc(host)}</b> in a new tab on your product page. ${S.key === "apk" ? "No APK file is hosted here." : ""}</p></div>
        <p class="vh-note" id="gErr" style="color:var(--danger);margin-top:8px">${esc(err || "")}</p>
        <div class="vh-actions"><button class="btn btn-ghost" id="s3Back">Back</button><button class="btn btn-primary" id="s3Go">Launch</button></div>`;
      $id("s3Back").onclick = () => { S.step = 2; step2(); };
      $id("s3Go").onclick = async ev => {
        ev.target.disabled = true;
        const id = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);
        const l = { id, typeKey: S.key, name: d.name, category: d.category, desc: d.desc, longDesc: d.longDesc, url: d.url, url2: d.url2 || "", cta,
          owner: App.user.name, ownerId: App.user.id || "me", ownerEmail: d.email, pricing: d.pricing, price: d.pricing === "Free" ? "Free" : (d.price || d.pricing), logoUrl: d.logo || null, created: new Date().toISOString() };
        const c = sb();
        if (c) {
          const { error } = await c.from("listings").insert([{ id, type_key: S.key, type: t.name, name: l.name, category: l.category, description: l.desc, long_desc: l.longDesc, url: l.url, url2: l.url2 || null, cta,
            owner: l.owner, owner_id: String(l.ownerId), owner_email: d.email, pricing: l.pricing, price: l.price, logo_url: l.logoUrl, status: "live" }]);
          if (error) return step3(error.code === "23505" ? "This link is already listed." : "Couldn't launch: " + error.message);
        } else save("vh_listings", [l, ...LS("vh_listings", [])]);
        try { const o = LS("vh_owned_products", []); o.push(id); save("vh_owned_products", o); } catch (x) {}
        merge(mk(l)); refreshCounts(); App.toast("Launched “" + l.name + "”", "success"); App.go("/ai/" + id);
      };
    }
    step1();
  }
  App.renderLaunch = renderLaunch;

  // ---------- Dashboard & Contact ----------
  const PAGES = {
    dashboard(el) {
      if (!App.user) { el.innerHTML = `<div class="page-header"><h1 class="page-title">Dashboard</h1><p class="page-sub">Log in to see your launches and their numbers.</p></div><div class="vh-actions"><button class="btn btn-primary" id="dLogin">Log in</button></div>`; $id("dLogin").onclick = () => App.openAuth("login"); return; }
      const list = mine(), tot = list.reduce((a, p) => { const s = VH.get(p.id); a.v += s.views; a.c += s.clicks; return a; }, { v: 0, c: 0 });
      el.innerHTML = `<div class="page-header"><h1 class="page-title">Your launches</h1><p class="page-sub">Real views and clicks for everything you've launched.</p></div>
      <div class="vh-grid"><div class="vh-kpi"><b>${list.length}</b><span>Launches</span></div><div class="vh-kpi"><b>${num(tot.v)}</b><span>Views</span></div><div class="vh-kpi"><b>${num(tot.c)}</b><span>Opens</span></div><div class="vh-kpi"><b>${tot.v ? Math.round(tot.c / tot.v * 100) : 0}%</b><span>Click-through</span></div></div>
      <div class="vh-actions" style="margin:0 0 16px"><button class="btn btn-primary" onclick="App.go('/launch')">Launch something</button></div><div class="products-list" id="vhMine"></div>`;
      const g = $id("vhMine");
      if (list.length) App.renderProductCards(g, list); else g.innerHTML = `<div class="vh-panel"><h3>Nothing launched yet</h3><p class="vh-note">Launch a web app, AI agent, AI model, mobile app or APK link and its numbers appear here.</p></div>`;
    },
    contact(el) {
      el.innerHTML = `<div class="page-header"><h1 class="page-title">Contact &amp; Advertise</h1><p class="page-sub">Feature your product, partner with us, or ask anything.</p></div>
      <div class="vh-panel" style="margin-top:0"><h3>Email</h3><p class="vh-note"><a href="mailto:${CONTACT}" style="color:var(--gold)">${CONTACT}</a></p>
      <form id="vhContact" class="vh-form" style="margin-top:12px"><div><label>Your name</label><input id="cName" required></div><div><label>Your email</label><input id="cMail" type="email" required></div>
      <div><label>Topic</label><select id="cTopic"><option>Advertise</option><option>Featured listing</option><option>Partnership</option><option>Support</option></select></div>
      <div><label>Message</label><textarea id="cMsg" rows="4" required></textarea></div><button class="btn btn-primary" style="justify-content:center">Send</button><p class="vh-note" id="cOut"></p></form></div>
      <div class="vh-grid"><div class="vh-kpi"><b>Featured</b><span>Top of the home feed — on request</span></div><div class="vh-kpi"><b>Spotlight</b><span>Home spotlight banner — on request</span></div><div class="vh-kpi"><b>Sponsored</b><span>Search and category slots — on request</span></div></div>`;
      $id("vhContact").onsubmit = async e => {
        e.preventDefault();
        const m = { name: $id("cName").value.trim(), email: $id("cMail").value.trim(), topic: $id("cTopic").value, message: $id("cMsg").value.trim() };
        const c = sb(); if (c) await c.from("contacts").insert([m]).then(() => {}, () => {});
        save("vh_contacts", [...LS("vh_contacts", []), Object.assign({ at: new Date().toISOString() }, m)]);
        $id("cOut").textContent = "Saved. Opening your email app to send it…";
        location.href = `mailto:${CONTACT}?subject=${encodeURIComponent("[" + m.topic + "] " + m.name)}&body=${encodeURIComponent(m.message + "\n\nFrom: " + m.email)}`;
      };
    }
  };

  const origParse = App.parsePath.bind(App);
  App.parsePath = function () {
    const p = location.pathname.split("/").filter(Boolean)[0];
    if (p === "contact" || p === "advertise") return { page: "contact", id: null };
    if (p === "dashboard") return { page: "dashboard", id: null };
    return origParse();
  };
  const origRoute = App.route.bind(App);
  App.route = function () {
    fixOwnerNames(); // your own tools always show your current name
    const { page } = this.parsePath();
    if (!PAGES[page]) return origRoute();
    this.currentPage = page;
    $id("sidebar")?.classList.remove("open");
    document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.page === page));
    PAGES[page]($id("content")); this.updateUserChip();
  };

  // ---------- followers & tool counts (real) ----------
  const follows = () => new Set(LS("vh_follows", []));
  async function followerCount(makerId) {
    const c = sb(); if (!c) return null;
    const { count } = await c.from("follows").select("*", { count: "exact", head: true }).eq("maker_id", String(makerId));
    return count ?? 0;
  }
  async function toggleFollow(makerId) {
    if (!App.user) { App.openAuth("login"); return null; }
    const f = follows(), on = !f.has(makerId);
    on ? f.add(makerId) : f.delete(makerId); save("vh_follows", [...f]);
    const c = sb(); if (c && App.user.id) {
      const q = on ? c.from("follows").insert([{ follower_id: App.user.id, maker_id: String(makerId) }]) : c.from("follows").delete().eq("follower_id", App.user.id).eq("maker_id", String(makerId));
      await q.then(() => {}, () => {});
    }
    return on;
  }
  async function refreshCounts() {
    if (!App.user) return;
    App.user.tools = mine().length;
    const n = await followerCount(App.user.id || "me"); if (n != null) App.user.followers = n;
    App.saveUser && App.saveUser(); App.updateUserChip();
  }
  window.VH.refreshCounts = refreshCounts;

  const origProfile = App.renderProfile.bind(App);
  App.renderProfile = async function (el, id) {
    origProfile(el, id);
    const stats = el.querySelector(".profile-stats");
    if (id === "me") {
      const list = mine(), grid = $id("profileProducts");
      if (grid) {
        grid.classList.remove("products-grid"); grid.classList.add("products-list");
        if (list.length) App.renderProductCards(grid, list); else grid.innerHTML = `<div class="vh-panel"><h3>Nothing launched yet</h3><p class="vh-note">Your launches show up here.</p></div>`;
      }
      // only fix the Tools number: the original profile already draws Karma and Followers (no second Followers stat)
      const first = stats && stats.querySelector(".profile-stat strong");
      if (first) first.textContent = list.length;
      return;
    }
    if (!stats) return;
    const on = follows().has(id);
    stats.insertAdjacentHTML("afterend", `<div class="vh-actions" style="margin-top:10px"><button class="btn ${on ? "btn-ghost" : "btn-primary"}" id="vhFollow">${on ? "Following" : "Follow"}</button><span class="vh-note" id="vhFollowers"></span></div>`);
    const show = async () => { const n = await followerCount(id); const f = $id("vhFollowers"); if (f) f.textContent = n == null ? "" : n + " follower" + (n === 1 ? "" : "s"); };
    show();
    $id("vhFollow").onclick = async e => {
      const r = await toggleFollow(id); if (r == null) return;
      e.target.textContent = r ? "Following" : "Follow"; e.target.className = "btn " + (r ? "btn-ghost" : "btn-primary"); show();
    };
  };

  // sidebar entries
  const ico = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${d}"/></svg>`;
  const nav = document.querySelector(".sidebar-nav");
  if (nav) nav.insertAdjacentHTML("beforeend",
    `<a href="/dashboard" class="nav-item" data-page="dashboard">${ico("M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z")}<span class="nav-label">Dashboard</span></a>
     <a href="/contact" class="nav-item" data-page="contact">${ico("M4 4h16v16H4zM4 7l8 6 8-6")}<span class="nav-label">Contact / Advertise</span></a>`);

  // listings are pulled by App.reconcile() once the Supabase client is ready
})();

// ---- top bar: user, followers, install, bell ----
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const orig = App.updateUserChip.bind(App);
  App.updateUserChip = function () {
    orig();
    const u = this.user, box = $("topUser"), guest = $("topGuest");
    if (!box || !guest) return;
    guest.style.display = u ? "none" : "flex";
    box.style.display = u ? "flex" : "none";
    if (!u) return;
    const photo = u.photo || localStorage.getItem("vh_user_photo");
    $("tuAv").innerHTML = photo ? `<img src="${esc(photo)}" alt="">` : esc(u.avatar || (u.name || "?")[0].toUpperCase());
    $("tuName").textContent = u.name;
    $("tuMeta").textContent = `${u.tools || 0} tools · ${u.followers || 0} followers`;
  };
  $("topUser")?.addEventListener("click", () => App.go("/profile/me"));
  $("topLogin")?.addEventListener("click", () => App.openAuth("login"));
  $("topSignup")?.addEventListener("click", () => App.openAuth("signup"));
  let deferred; window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; });
  $("topInstall")?.addEventListener("click", async () => {
    if (deferred) { deferred.prompt(); deferred = null; }
    else App.toast("Use your browser menu → Install app / Add to Home Screen", "success");
  });
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem("vh_notifs") || "[]"); if (!Array.isArray(notes)) notes = []; } catch (e) { notes = []; }
  if (notes.length && $("bellN")) { $("bellN").textContent = notes.length; $("bellN").style.display = "grid"; }
  $("topBell")?.addEventListener("click", () => App.toast(notes.length ? notes.length + " new notifications" : "No new notifications", "success"));
  App.updateUserChip();
})();

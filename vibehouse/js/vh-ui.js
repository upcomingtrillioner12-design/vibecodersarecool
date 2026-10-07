// ============================================================
// vh-ui.js  -  LOAD LAST (after app.js, hub.js, profile.js, media.js, launch.js)
//
//  1. ONE product layout everywhere: a small, premium horizontal row
//     (Home, Search, Deals, Dashboard, every profile).
//  2. Own tools: same row + real numbers (views / opens / launch date).
//  3. ONE identity: the top bar, the sidebar chip and the profile page all
//     show the same display name, @username, tool count and follower count.
//  4. Login gate: guests only see a log in / sign up screen.
//     (The database enforces the same rule: run supabase-security.sql.)
// Screenshots and the demo video appear only on the product's own page.
// ============================================================
(function () {
  const A = window.App;
  if (!A) { console.warn("[vh-ui] App not found"); return; }
  const esc = s => A.esc(s);
  const $ = id => document.getElementById(id);
  const num = n => (A.formatNum ? A.formatNum(n) : String(n || 0));
  const LSget = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const LSset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const sb = () => (window.VibeBackend && VibeBackend.isReady && VibeBackend.isReady()) ? VibeBackend.client() : null;
  const safeHttps = u => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : ""; } catch (e) { return ""; } };
  // lock a renderer so scripts loaded later can never put an old one back
  const lock = (name, fn) => Object.defineProperty(A, name, { configurable: true, get: () => fn, set: () => {} });

  // ---------- styles ----------
  const css = document.createElement("style");
  css.id = "vx-style";
  css.textContent = `
  .vx-list{display:flex;flex-direction:column;gap:10px}
  .vx-row{display:grid;grid-template-columns:44px minmax(0,1fr) auto auto 14px;align-items:center;gap:14px;min-height:68px;padding:12px 16px;
    border:1px solid var(--border,rgba(255,255,255,.08));background:var(--bg-elevated,rgba(255,255,255,.03));border-radius:14px;cursor:pointer;
    transition:border-color .15s,background .15s,transform .15s}
  .vx-row:hover,.vx-row:focus-visible{border-color:var(--accent,#6c5ce7);background:rgba(108,92,231,.07);transform:translateY(-1px);outline:none}
  .vx-logo{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;overflow:hidden;font-weight:700;color:#fff;font-size:15px}
  .vx-logo img{width:100%;height:100%;object-fit:cover;display:block}
  .vx-main{min-width:0}
  .vx-title{display:flex;align-items:baseline;gap:10px;min-width:0}
  .vx-name{font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vx-type{font-size:12px;color:var(--text-muted,#9aa0b4);white-space:nowrap}
  .vx-desc{font-size:13px;color:var(--text-muted,#9aa0b4);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vx-stats{display:flex;gap:14px;margin-top:5px;font-size:12px;color:var(--text-muted,#9aa0b4)}
  .vx-stats b{color:var(--text,#fff);font-weight:600}
  .vx-price{font-weight:700;font-size:13px;padding:4px 11px;border-radius:999px;background:rgba(255,255,255,.06);white-space:nowrap}
  .vx-price.free{color:var(--success,#00b894);background:rgba(0,184,148,.1)}
  .vx-owner{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-muted,#9aa0b4);max-width:170px;min-width:0}
  .vx-owner strong{color:var(--text,#fff);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vx-go{color:var(--text-muted,#9aa0b4);font-size:20px;line-height:1}
  @media(max-width:720px){.vx-row{grid-template-columns:44px minmax(0,1fr) auto 12px;gap:12px;padding:11px 12px}.vx-owner{display:none}.vx-type{display:none}}
  .vx-empty{border:1px dashed var(--border,rgba(255,255,255,.14));border-radius:14px;padding:30px 20px;text-align:center;color:var(--text-muted,#9aa0b4)}
  .vx-empty h3{margin:0 0 6px;color:var(--text,#fff);font-size:16px}
  .vx-empty .btn{margin-top:14px}
  .vx-prof{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;margin:8px 0 34px}
  .vx-avatar{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;font-size:38px;font-weight:700;color:#fff;overflow:hidden;position:relative;flex:none;
    background:linear-gradient(135deg,var(--accent,#6c5ce7),#a29bfe)}
  .vx-avatar img{width:100%;height:100%;object-fit:cover;display:block}
  .vx-avatar.me{cursor:pointer}
  .vx-chg{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);font-size:11px;text-align:center;padding:5px 0;opacity:0;transition:opacity .15s}
  .vx-avatar.me:hover .vx-chg{opacity:1}
  .vx-pinfo{flex:1;min-width:240px}
  .vx-pname{font-size:28px;font-weight:800;margin:0;line-height:1.15}
  .vx-handle{color:var(--text-muted,#9aa0b4);margin:3px 0 8px;font-size:14px}
  .vx-head{font-weight:600;margin-bottom:6px}
  .vx-bio{font-size:14px;color:var(--text-muted,#9aa0b4);max-width:540px;line-height:1.55}
  .vx-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .vx-links a{font-size:12px;padding:5px 11px;border-radius:999px;border:1px solid var(--border,rgba(255,255,255,.12));color:inherit;text-decoration:none}
  .vx-links a:hover{border-color:var(--accent,#6c5ce7)}
  .vx-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
  .vx-statrow{display:flex;gap:30px;margin-top:20px}
  .vx-stat strong{display:block;font-size:20px}
  .vx-stat span{font-size:12px;color:var(--text-muted,#9aa0b4)}
  .vx-sec{display:flex;align-items:center;justify-content:space-between;margin:0 0 14px}
  .vx-sec h2{font-size:18px;font-weight:700;margin:0}
  .vx-sec h2 small{font-weight:600;font-size:12px;color:var(--text-muted,#9aa0b4);margin-left:8px}
  .vx-gate{max-width:560px;margin:12vh auto 0;text-align:center;padding:0 20px}
  .vx-gate h1{font-size:34px;font-weight:800;margin:0 0 10px}
  .vx-gate p{color:var(--text-muted,#9aa0b4);margin:0 0 24px;line-height:1.6}
  .vx-gate .vx-actions{justify-content:center}
  `;
  document.head.appendChild(css);

  // ---------- helpers ----------
  const isMine = p => !!(A.user && p && p.isListing && A.isProductOwner(p));
  const mineList = () => (window.PRODUCTS || []).filter(isMine);
  const ownerName = p => (isMine(p) && A.user.name) ? A.user.name : (p.owner || "");
  const statOf = p => (window.VH && VH.get) ? VH.get(p.id) : { views: 0, clicks: 0 };
  function priceText(p) {
    const v = p.price !== undefined && p.price !== null && p.price !== "" ? p.price : p.pricing;
    if (v === undefined || v === null || v === "" || v === 0 || p.priceValue === 0 || /^free$/i.test(String(v))) return "Free";
    if (typeof v === "number") return (p.currency === "USD" ? "$" : "₹") + v;
    return String(v);
  }
  const photoOf = u => ((window.IconEngine && IconEngine.userPhoto) ? IconEngine.userPhoto(u) : null) || u.photo || null;

  // ============================================================
  // 1 + 2.  THE product row (used by every list on the site)
  // ============================================================
  function row(p, withStats) {
    const price = priceText(p), s = withStats ? statOf(p) : null, who = ownerName(p);
    return `<article class="vx-row" tabindex="0" role="link" data-go="/ai/${esc(encodeURIComponent(p.id))}">
      ${A.productLogoHtml(p, "vx-logo")}
      <div class="vx-main">
        <div class="vx-title"><span class="vx-name">${esc(p.name)}</span><span class="vx-type">${esc(p.type || "")}${p.category ? " · " + esc(p.category) : ""}</span></div>
        <div class="vx-desc">${esc(p.desc || "")}</div>
        ${s ? `<div class="vx-stats"><span><b>${num(s.views)}</b> views</span><span><b>${num(s.clicks)}</b> opens</span><span>Launched ${esc(p.launched || "")}</span></div>` : ""}
      </div>
      <span class="vx-price${price === "Free" ? " free" : ""}">${esc(price)}</span>
      <div class="vx-owner">${A.ownerAvatarHtml(Object.assign({}, p, { owner: who }), 24)}<strong>${esc(who)}</strong></div>
      <span class="vx-go" aria-hidden="true">›</span>
    </article>`;
  }
  function renderCards(container, list) {
    if (!container) return;
    container.classList.remove("products-grid", "products-list");
    container.classList.add("vx-list");
    if (!list || !list.length) {
      container.innerHTML = `<div class="vx-empty"><h3>No tools yet</h3><p>Nothing to show here.</p></div>`;
      return;
    }
    const withStats = container.id === "vxTools" || container.id === "vhMine";
    container.innerHTML = list.map(p => row(p, withStats && isMine(p))).join("");
    container.onkeydown = e => { if (e.key === "Enter") { const r = e.target.closest && e.target.closest(".vx-row"); if (r && r.dataset.go) A.go(r.dataset.go); } };
  }
  lock("renderProductCards", renderCards);

  // ============================================================
  // 3.  ONE identity: same name / @username / counts everywhere
  // ============================================================
  const prevChip = A.updateUserChip.bind(A);
  A.updateUserChip = function () {
    prevChip();
    const u = this.user; if (!u) return;
    const tools = mineList().length, followers = u.followers || 0;
    const meta = (u.username ? "@" + u.username + " · " : "") + tools + " tool" + (tools === 1 ? "" : "s") + " · " + followers + " follower" + (followers === 1 ? "" : "s");
    const set = (id, t) => { const n = $(id); if (n) n.textContent = t; };
    set("tuName", u.name); set("tuMeta", meta);
    const chip = $("userChip");
    if (chip) {
      const nm = chip.querySelector(".user-name"), mt = chip.querySelector(".user-meta");
      if (nm) nm.textContent = u.name;
      if (mt) mt.textContent = meta;
    }
  };

  async function followerCount(id) {
    const c = sb(); if (!c) return null;
    const { count } = await c.from("follows").select("*", { count: "exact", head: true }).eq("maker_id", String(id));
    return count == null ? 0 : count;
  }
  async function toggleFollow(id) {
    if (!A.user) { A.openAuth("login"); return null; }
    const f = new Set(LSget("vh_follows", [])), on = !f.has(id);
    on ? f.add(id) : f.delete(id); LSset("vh_follows", [...f]);
    const c = sb();
    if (c && A.user.id) {
      const q = on ? c.from("follows").insert([{ follower_id: A.user.id, maker_id: String(id) }])
                   : c.from("follows").delete().eq("follower_id", A.user.id).eq("maker_id", String(id));
      await q.then(() => {}, () => {});
    }
    return on;
  }
  const linksHtml = o => {
    const w = safeHttps(o.website || o.ownerWebsite), t = String(o.twitter || o.ownerTwitter || "").replace(/^@/, "");
    return (w ? `<a href="${esc(w)}" target="_blank" rel="noopener noreferrer">${esc(w.replace(/^https:\/\//, "").replace(/\/$/, ""))} ↗</a>` : "") +
           (/^[A-Za-z0-9_]{1,15}$/.test(t) ? `<a href="https://x.com/${esc(t)}" target="_blank" rel="noopener noreferrer">@${esc(t)} ↗</a>` : "");
  };
  const readFile = file => (window.IconEngine && IconEngine.fileToDataUrl) ? IconEngine.fileToDataUrl(file)
    : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

  function openEdit(u, redraw) {
    const overlay = $("modalOverlay"), body = $("modalBody"); if (!overlay || !body) return;
    body.innerHTML = `<h2 class="modal-title">Edit profile</h2>
      <form id="vxEp" novalidate>
        <div class="field"><label>Display name</label><input id="epName" maxlength="40" value="${esc(u.name)}"></div>
        <div class="field"><label>Username</label><input id="epUser" maxlength="20" value="${esc(u.username || "")}" placeholder="yourname"></div>
        <div class="field"><label>Headline</label><input id="epHead" maxlength="60" value="${esc(u.headline || "")}" placeholder="Indie maker building AI tools"></div>
        <div class="field"><label>Bio</label><textarea id="epBio" rows="3" maxlength="280">${esc(u.bio && u.bio !== "Vibe coder." ? u.bio : "")}</textarea></div>
        <div class="field"><label>Website (https)</label><input id="epWeb" type="url" value="${esc(u.website || "")}" placeholder="https://"></div>
        <div class="field"><label>X / Twitter</label><input id="epTw" maxlength="16" value="${esc(u.twitter || "")}" placeholder="@handle"></div>
        <button class="btn btn-primary" id="epSave" style="width:100%;justify-content:center">Save</button>
      </form><div class="modal-msg" id="epMsg"></div>`;
    overlay.classList.add("open");
    $("vxEp").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = $("epMsg"), btn = $("epSave"), v = id => $(id).value;
      btn.disabled = true; msg.style.color = "var(--text-muted)"; msg.textContent = "Saving…";
      const err = window.VHProfile ? await VHProfile.save({ name: v("epName"), username: v("epUser"), headline: v("epHead"), bio: v("epBio"), website: v("epWeb"), twitter: v("epTw") }) : "Profile service not loaded.";
      if (err) { btn.disabled = false; msg.style.color = "var(--danger)"; msg.textContent = err; return; }
      A.closeModal(); A.toast("Profile saved", "success"); A.updateUserChip(); redraw();
    });
  }

  function profileHtml(o) {
    return `<button class="btn btn-ghost btn-sm" data-back style="margin-bottom:20px">← Back</button>
      <section class="vx-prof">
        <div class="vx-avatar${o.me ? " me" : ""}" id="vxAv" ${o.me ? 'title="Change photo"' : ""}>
          ${o.photo ? `<img src="${esc(o.photo)}" alt="${esc(o.name)}">` : esc(String(o.name || "?")[0].toUpperCase())}
          ${o.me ? `<span class="vx-chg">Change photo</span><input type="file" id="vxPhoto" accept="image/*" style="display:none">` : ""}
        </div>
        <div class="vx-pinfo">
          <h1 class="vx-pname">${esc(o.name)}</h1>
          ${o.username ? `<div class="vx-handle">@${esc(o.username)}</div>` : ""}
          ${o.headline ? `<div class="vx-head">${esc(o.headline)}</div>` : ""}
          ${o.bio ? `<div class="vx-bio">${esc(o.bio)}</div>` : ""}
          ${linksHtml(o) ? `<div class="vx-links">${linksHtml(o)}</div>` : ""}
          <div class="vx-actions">${o.me ? `<button class="btn btn-ghost btn-sm" id="vxEdit">Edit profile</button><button class="btn btn-primary btn-sm" data-go="/launch">Launch a tool</button>` : `<button class="btn ${o.following ? "btn-ghost" : "btn-primary"} btn-sm" id="vxFollow">${o.following ? "Following" : "Follow"}</button>`}</div>
          <div class="vx-statrow">
            <div class="vx-stat"><strong>${o.tools}</strong><span>Tools</span></div>
            ${o.me ? `<div class="vx-stat"><strong>${o.karma || 0}</strong><span>Karma</span></div>` : ""}
            <div class="vx-stat"><strong id="vxFollowers">${o.followers == null ? "–" : o.followers}</strong><span>Followers</span></div>
          </div>
        </div>
      </section>
      <div class="vx-sec"><h2>${o.me ? "Your tools" : "Tools by " + esc(o.name)}<small>${o.tools}</small></h2></div>
      <div class="vx-list" id="vxTools"></div>`;
  }

  function drawMe(el) {
    const u = A.user, list = mineList();
    el.innerHTML = profileHtml({ me: true, name: u.name, username: u.username, headline: u.headline, bio: u.bio && u.bio !== "Vibe coder." ? u.bio : "",
      website: u.website, twitter: u.twitter, photo: photoOf(u), tools: list.length, karma: u.karma, followers: u.followers || 0 });
    const tools = $("vxTools");
    if (list.length) renderCards(tools, list);
    else tools.innerHTML = `<div class="vx-empty"><h3>Nothing launched yet</h3><p>Everything you launch is listed here with its views and opens.</p><button class="btn btn-primary btn-sm" data-go="/launch">Launch your first tool</button></div>`;
    el.querySelector("[data-back]").onclick = () => history.back();
    $("vxEdit").onclick = () => openEdit(u, () => drawMe(el));
    const av = $("vxAv"), inp = $("vxPhoto");
    av.onclick = () => inp.click();
    inp.onclick = e => e.stopPropagation();
    inp.onchange = async e => {
      const file = e.target.files && e.target.files[0];
      if (!file || !file.type.startsWith("image/")) return A.toast("Please choose an image file", "error");
      try {
        const dataUrl = await readFile(file);
        A.user.photo = dataUrl; A.saveUser();
        if (window.VibeBackend && A.user.id) {
          const r = await VibeBackend.uploadAvatar(A.user.id, dataUrl);
          if (r && r.ok && r.url && !r.offline) { A.user.photo = r.url; A.saveUser(); }
          else if (r && r.ok === false) A.toast("Saved on this device only: " + (r.error || "upload failed"), "error");
        }
        A.updateUserChip(); drawMe(el);
      } catch (err) { A.toast("Could not process image", "error"); }
    };
    followerCount(u.id).then(n => {
      if (n == null) return;
      u.followers = n; A.saveUser();
      const f = $("vxFollowers"); if (f) f.textContent = n;
      A.updateUserChip();
    });
  }

  function drawMaker(el, id) {
    const list = (window.PRODUCTS || []).filter(p => String(p.ownerId) === String(id) || (p.ownerUsername && p.ownerUsername === id));
    const m = list[0];
    if (!m) { el.innerHTML = `<div class="vx-empty"><h3>Profile not found</h3><button class="btn btn-ghost btn-sm" data-go="/">← Home</button></div>`; return; }
    const mid = String(m.ownerId), following = new Set(LSget("vh_follows", [])).has(mid);
    el.innerHTML = profileHtml({ me: false, name: m.owner, username: m.ownerUsername, headline: m.ownerRole, bio: m.ownerBio, website: m.ownerWebsite, twitter: m.ownerTwitter,
      photo: m.ownerAvatarUrl, tools: list.length, followers: null, following });
    renderCards($("vxTools"), list);
    el.querySelector("[data-back]").onclick = () => history.back();
    const show = () => followerCount(mid).then(n => { const f = $("vxFollowers"); if (f && n != null) f.textContent = n; });
    show();
    $("vxFollow").onclick = async e => {
      const r = await toggleFollow(mid); if (r == null) return;
      e.target.textContent = r ? "Following" : "Follow"; e.target.className = "btn " + (r ? "btn-ghost" : "btn-primary") + " btn-sm"; show();
    };
  }

  lock("renderProfile", function (el, id) {
    const me = A.user && (id === "me" || String(id) === String(A.user.id) || (A.user.username && id === A.user.username));
    return me ? drawMe(el) : drawMaker(el, id);
  });

  // ============================================================
  // 4.  Login gate: only logged-in users see anything
  // ============================================================
  function gate() {
    const el = $("content"); if (!el) return;
    A.currentPage = "gate";
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    el.innerHTML = `<section class="vx-gate"><h1>Vibe coders are cool.</h1>
      <p>vibecodersarecool is the community platform for vibe coders. Log in or create a free account to browse tools, launch your own and follow makers.</p>
      <div class="vx-actions"><button class="btn btn-primary" id="vxGLogin">Log in</button><button class="btn btn-ghost" id="vxGSignup">Sign up</button></div></section>`;
    $("vxGLogin").onclick = () => A.openAuth("login");
    $("vxGSignup").onclick = () => A.openAuth("signup");
    A.updateUserChip();
  }
  const prevRoute = A.route.bind(A);
  A.route = function () { return A.user ? prevRoute() : gate(); };

  window.__VH_UI = 3; // console check: type  __VH_UI  ->  3
})();

// ============================================================
// Vibehouse Profiles — real, editable, shown across the site.
// Backend: Supabase `profiles` (own row) + `public_profiles` view (everyone).
// Offline: localStorage.  Loads after hub.js.
// ============================================================
(function () {
  const LS = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sb = () => (window.VibeBackend && VibeBackend.isReady()) ? VibeBackend.client() : null;
  const RESERVED = ["me", "admin", "root", "support", "vibehouse", "launch", "search", "deals", "tasks", "prompts", "map", "api", "help", "contact", "dashboard", "profile"];
  const safeHttps = u => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : ""; } catch (e) { return ""; } };

  function validate(f) {
    if (f.name.length < 2 || f.name.length > 40) return "Name must be 2–40 characters.";
    if (!/^[a-z0-9_]{3,20}$/.test(f.username)) return "Username: 3–20 characters, lowercase letters, numbers or _.";
    if (RESERVED.includes(f.username)) return "That username is reserved.";
    if (f.headline.length > 60) return "Headline is max 60 characters.";
    if (f.bio.length > 280) return "Bio is max 280 characters.";
    if (f.website && !safeHttps(f.website)) return "Website must be a full https:// link.";
    if (f.twitter && !/^@?[A-Za-z0-9_]{1,15}$/.test(f.twitter)) return "X / Twitter handle looks wrong.";
    return "";
  }
  const clean = f => ({ name: f.name.trim(), username: f.username.trim().toLowerCase().replace(/^@/, ""), headline: f.headline.trim(), bio: f.bio.trim(),
    website: f.website.trim(), twitter: f.twitter.trim().replace(/^@/, "") });

  // Keep every launch by this user in step with their profile (cards, maker box, profile page)
  function syncOwn() {
    const u = App.user; if (!u) return;
    const photo = u.photo || localStorage.getItem("vh_user_photo") || null;
    PRODUCTS.filter(p => p.isListing && App.isProductOwner(p)).forEach(p => Object.assign(p, {
      owner: u.name, ownerUsername: u.username || "", ownerRole: u.headline || "Vibe coder", ownerBio: u.bio || "",
      ownerWebsite: u.website || "", ownerTwitter: u.twitter || "", ownerAvatarUrl: photo }));
    const all = LS("vh_listings", []); let ch = false;
    all.forEach(l => { if (String(l.ownerId) === String(u.id || "me")) { l.owner = u.name; l.ownerUsername = u.username || ""; ch = true; } });
    if (ch) store("vh_listings", all);
  }

  async function saveProfile(raw) {
    const f = clean(raw), err = validate(f); if (err) return err;
    const u = App.user, c = sb();
    if (c && u.id) {
      const { error } = await c.from("profiles").update({ full_name: f.name, username: f.username, headline: f.headline || null, bio: f.bio || null,
        website: f.website || null, twitter: f.twitter || null, avatar_letter: f.name[0].toUpperCase() }).eq("id", u.id);
      if (error) return error.code === "23505" ? "That username is taken." : "Couldn't save: " + error.message;
      await c.from("listings").update({ owner: f.name }).eq("owner_id", String(u.id)).then(() => {}, () => {});
    }
    Object.assign(u, { name: f.name, username: f.username, headline: f.headline, bio: f.bio || "Vibe coder.", website: f.website, twitter: f.twitter, avatar: f.name[0].toUpperCase() });
    App.saveUser(); syncOwn(); App.updateUserChip();
    return "";
  }

  // Every account gets a real unique @username automatically (editable later)
  async function ensureUsername() {
    const u = App.user; if (!u || u.username) return;
    let base = (u.name || (u.email || "user").split("@")[0]).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 14);
    if (base.length < 3) base = (base + "user").slice(0, 8);
    const c = sb();
    for (let i = 0; i < 5; i++) {
      const cand = i === 0 ? base : base + Math.floor(100 + Math.random() * 9000);
      if (RESERVED.includes(cand)) continue;
      if (c && u.id) {
        const { error } = await c.from("profiles").update({ username: cand }).eq("id", u.id);
        if (error) { if (error.code === "23505") continue; return; }
      }
      u.username = cand; App.saveUser(); App.updateUserChip(); return;
    }
  }

  // ---- hooks ----
  let guard = null;
  const origChip = App.updateUserChip.bind(App);
  App.updateUserChip = function () {
    origChip();
    const u = this.user, n = document.getElementById("tuName");
    if (u && n) n.textContent = u.username || u.name;
    if (u) { syncOwn(); const key = String(u.id || u.email || u.name); if (guard !== key) { guard = key; ensureUsername(); } }
  };
  const origLogout = App.logout.bind(App);
  App.logout = async function () { try { localStorage.removeItem("vh_user_photo"); } catch (e) {} guard = null; return origLogout(); };

  const links = o => {
    const w = safeHttps(o.website), t = (o.twitter || "").replace(/^@/, "");
    return [w ? `<a class="vh-chip" href="${esc(w)}" target="_blank" rel="noopener noreferrer">${esc(w.replace(/^https:\/\//, "").replace(/\/$/, ""))} ↗</a>` : "",
      /^[A-Za-z0-9_]{1,15}$/.test(t) ? `<a class="vh-chip" href="https://x.com/${esc(t)}" target="_blank" rel="noopener noreferrer">@${esc(t)} ↗</a>` : ""].join("");
  };

  const origProfile = App.renderProfile.bind(App);
  App.renderProfile = async function (el, id) {
    const byHandle = PRODUCTS.find(p => p.ownerUsername && p.ownerUsername === id);
    if (byHandle) id = byHandle.ownerId;
    await origProfile(el, id);
    const head = el.querySelector(".profile-header"), stats = el.querySelector(".profile-stats"); if (!head || !stats) return;
    const ps = head.querySelectorAll("h1 ~ p");
    if (id === "me" && App.user) {
      const u = App.user;
      if (ps[0]) ps[0].textContent = u.headline || "Vibe coder";
      if (ps[1]) ps[1].textContent = u.bio || "";
      stats.insertAdjacentHTML("beforebegin", `<div class="vh-actions" style="margin:2px 0 10px"><span class="vh-note">@${esc(u.username || "…")}</span>${links(u)}<button class="btn btn-ghost btn-sm" id="vhEditProfile">Edit profile</button></div><div id="vhProfileEdit"></div>`);
      document.getElementById("vhEditProfile").onclick = () => editForm(u);
    } else {
      const m = PRODUCTS.find(p => String(p.ownerId) === String(id));
      if (m && (m.ownerUsername || m.ownerWebsite || m.ownerTwitter))
        stats.insertAdjacentHTML("beforebegin", `<div class="vh-actions" style="margin:2px 0 10px">${m.ownerUsername ? `<span class="vh-note">@${esc(m.ownerUsername)}</span>` : ""}${links(m)}</div>`);
    }
  };

  function editForm(u) {
    const box = document.getElementById("vhProfileEdit"); if (box.innerHTML) { box.innerHTML = ""; return; }
    box.innerHTML = `<form class="vh-panel vh-form" id="pf" style="max-width:520px;margin:0 0 14px" novalidate>
      <div><label>Display name</label><input id="pName" maxlength="40" value="${esc(u.name)}"></div>
      <div><label>Username</label><input id="pUser" maxlength="20" value="${esc(u.username || "")}" placeholder="yourname"></div>
      <div><label>Headline</label><input id="pHead" maxlength="60" value="${esc(u.headline || "")}" placeholder="e.g. Indie maker building AI tools"></div>
      <div><label>Bio</label><textarea id="pBio" rows="3" maxlength="280">${esc(u.bio === "Vibe coder." ? "" : (u.bio || ""))}</textarea></div>
      <div><label>Website (https)</label><input id="pWeb" type="url" value="${esc(u.website || "")}" placeholder="https://"></div>
      <div><label>X / Twitter</label><input id="pTw" maxlength="16" value="${esc(u.twitter || "")}" placeholder="@handle"></div>
      <p class="vh-note">Click your photo above to change it.</p><p class="vh-note" id="pOut"></p>
      <div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm">Save</button><button type="button" class="btn btn-ghost btn-sm" id="pCancel">Cancel</button></div></form>`;
    document.getElementById("pCancel").onclick = () => { box.innerHTML = ""; };
    document.getElementById("pf").onsubmit = async e => {
      e.preventDefault(); const out = document.getElementById("pOut"); out.style.color = "var(--text-muted)"; out.textContent = "Saving…";
      const v = id => document.getElementById(id).value;
      const err = await saveProfile({ name: v("pName"), username: v("pUser"), headline: v("pHead"), bio: v("pBio"), website: v("pWeb"), twitter: v("pTw") });
      if (err) { out.style.color = "var(--danger)"; out.textContent = err; return; }
      App.toast("Profile saved", "success"); App.renderProfile(document.getElementById("content"), "me");
    };
  }
  window.VHProfile = { save: saveProfile, ensureUsername, syncOwn };
  App.updateUserChip();
})();

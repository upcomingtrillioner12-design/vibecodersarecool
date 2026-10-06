// ============================================================
// vh-fixes.js  -  load AFTER app.js, launch.js and the VHI file
//   <script src="js/vh-fixes.js"></script>
// Fixes:
//  1. Product cards: plain logo + name + type + one-liner + price + owner
//     (no screenshot, no "Demo" badge). Same card is used on Home,
//     Search, Deals and Profile.
//  2. "My profile" (/profile/me): real data from the profiles row,
//     one Followers stat, tools listed as plain cards, working
//     Edit profile + photo upload.
// Other makers' profiles still use the existing renderer.
// ============================================================
(function () {
  const A = window.App;
  if (!A) { console.warn("[vh-fixes] App not found, load this file after app.js"); return; }

  const esc = s => A.esc(s);

  // Price text: "Free", "₹499/mo", "$12/mo". Numbers are shown with ₹ when currency is INR.
  function priceText(p) {
    const v = p.price !== undefined && p.price !== null && p.price !== "" ? p.price : p.pricing;
    if (v === undefined || v === null || v === "" || v === 0 || p.priceValue === 0 || /^free$/i.test(String(v))) return "Free";
    if (typeof v === "number") return (p.currency === "INR" ? "₹" : "$") + v;
    return String(v);
  }

  // ---------- 1. Plain product cards ----------
  A.renderProductCards = function (container, list) {
    if (!container) return;
    if (!list || !list.length) {
      container.innerHTML = `<div class="empty"><h3>No tools yet</h3><p>Nothing to show here.</p></div>`;
      return;
    }
    container.innerHTML = list.map(p => `
      <article class="product-card" data-go="/ai/${esc(encodeURIComponent(p.id))}">
        <div class="product-top">
          ${A.productLogoHtml(p)}
          <div class="product-meta">
            <div class="product-name">${esc(p.name)}</div>
            <div class="product-type">${esc(p.type || "")}${p.category ? " · " + esc(p.category) : ""}</div>
          </div>
        </div>
        <p class="product-desc">${esc(p.desc || "")}</p>
        <div class="product-footer">
          <div class="product-price" style="font-weight:700">${esc(priceText(p))}</div>
          <div class="product-owner-row">
            ${A.ownerAvatarHtml(p, 32)}
            <div class="product-owner">by <strong>${esc(p.owner || "")}</strong></div>
          </div>
        </div>
      </article>`).join("");
  };

  // ---------- 2. My profile ----------
  const previous = A.renderProfile ? A.renderProfile.bind(A) : null;

  function myProducts() {
    const uid = String((A.user && A.user.id) || "");
    return (window.PRODUCTS || []).filter(p => (uid && String(p.ownerId) === uid) || A.isProductOwner(p));
  }

  function readFile(file) {
    if (window.IconEngine && IconEngine.fileToDataUrl) return IconEngine.fileToDataUrl(file);
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  }

  function openEdit(profile, rerender) {
    const overlay = document.getElementById("modalOverlay"), body = document.getElementById("modalBody");
    if (!overlay || !body) return;
    body.innerHTML = `
      <h2 class="modal-title">Edit profile</h2>
      <form id="epForm">
        <div class="field"><label>Name</label><input id="epName" maxlength="60" value="${esc(profile.name)}" required></div>
        <div class="field"><label>Username</label><input id="epUser" maxlength="30" value="${esc(profile.username)}" placeholder="yourname"></div>
        <div class="field"><label>Headline</label><input id="epHead" maxlength="80" value="${esc(profile.headline)}" placeholder="Vibe coder building ..."></div>
        <div class="field"><label>Bio</label><textarea id="epBio" rows="3" maxlength="300">${esc(profile.bio)}</textarea></div>
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
      const msg = document.getElementById("epMsg"), btn = document.getElementById("epSave");
      btn.disabled = true; msg.style.color = "var(--text-muted)"; msg.textContent = "Saving...";
      let res = { ok: true };
      if (window.VibeBackend && A.user && A.user.id) res = await VibeBackend.updateProfile(A.user.id, f);
      if (!res.ok) { btn.disabled = false; msg.style.color = "var(--danger)"; msg.textContent = res.error || "Could not save"; return; }
      Object.assign(A.user, { name: f.full_name || A.user.name, avatar: (f.full_name || A.user.name || "?")[0].toUpperCase(), username: f.username, headline: f.headline, bio: f.bio });
      A.saveUser(); A.updateUserChip(); A.closeModal(); A.toast("Profile updated", "success");
      rerender();
    });
  }

  A.renderProfile = function (el, id) {
    const isMe = id === "me" || (A.user && (id === A.user.id || (A.user.username && id === A.user.username)));
    if (!isMe) return previous ? previous(el, id) : undefined;

    if (!A.user) {
      el.innerHTML = `<div class="empty" style="padding:80px 20px"><h3>Sign in to see your profile</h3>
        <p style="margin:12px 0 24px">Your profile and tools live here once you're logged in.</p>
        <button class="btn btn-primary" id="pfLogin">Log in</button>
        <button class="btn btn-ghost" id="pfSignup" style="margin-left:8px">Sign up</button></div>`;
      document.getElementById("pfLogin").onclick = () => A.openAuth("login");
      document.getElementById("pfSignup").onclick = () => A.openAuth("signup");
      return;
    }

    const draw = () => {
      const u = A.user;
      const profile = { name: u.name || "User", username: u.username || "", headline: u.headline || "", bio: u.bio && u.bio !== "Vibe coder." ? u.bio : "" };
      const photo = (window.IconEngine && IconEngine.userPhoto ? IconEngine.userPhoto(u) : null) || u.photo;
      const list = myProducts();
      el.innerHTML = `
        <button class="btn btn-ghost btn-sm" onclick="history.back()" style="margin-bottom:20px">← Back</button>
        <div class="profile-header">
          <div class="profile-avatar" id="pfAvatar" style="background:linear-gradient(135deg,var(--accent),#a29bfe);cursor:pointer" title="Change photo">
            ${photo ? `<img src="${esc(photo)}" alt="${esc(profile.name)}">` : esc(String(u.avatar || profile.name[0] || "?").toUpperCase())}
            <input type="file" id="pfPhoto" accept="image/*" style="display:none">
          </div>
          <div>
            <h1 class="page-title" style="margin-bottom:4px">${esc(profile.name)}</h1>
            ${profile.username ? `<p style="color:var(--text-muted);margin-bottom:6px">@${esc(profile.username)}</p>` : ""}
            ${profile.headline ? `<p style="margin-bottom:6px">${esc(profile.headline)}</p>` : ""}
            ${profile.bio ? `<p style="font-size:14px;max-width:480px;color:var(--text-muted)">${esc(profile.bio)}</p>` : ""}
            <button class="btn btn-ghost btn-sm" id="pfEdit" style="margin-top:10px">Edit profile</button>
            <div class="profile-stats">
              <div class="profile-stat"><strong>${list.length}</strong><span>Tools</span></div>
              <div class="profile-stat"><strong>${u.karma || 0}</strong><span>Karma</span></div>
              <div class="profile-stat"><strong>${u.followers || 0}</strong><span>Followers</span></div>
            </div>
          </div>
        </div>
        <h2 style="font-size:18px;font-weight:700;margin-bottom:16px">Your tools</h2>
        <div class="products-grid" id="pfProducts"></div>`;
      A.renderProductCards(document.getElementById("pfProducts"), list);

      document.getElementById("pfEdit").onclick = () => openEdit(profile, draw);
      const box = document.getElementById("pfAvatar"), inp = document.getElementById("pfPhoto");
      box.onclick = () => inp.click();
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
          A.updateUserChip(); draw();
        } catch (err) { A.toast("Could not process image", "error"); }
      };
    };

    draw();

    // Refresh from the real profiles row, then repaint only if something changed
    if (window.VibeBackend && VibeBackend.isReady() && A.user.id) {
      VibeBackend.getProfile(A.user.id).then(row => {
        if (!row) return;
        const next = A.buildUser({ id: A.user.id, email: A.user.email, user_metadata: {} }, row);
        const keep = A.user.photo;
        const changed = ["name", "username", "headline", "bio", "karma", "followers"].some(k => next[k] !== A.user[k]);
        if (!changed) return;
        A.user = Object.assign({}, A.user, next, { photo: next.photo || keep });
        A.saveUser(); A.updateUserChip();
        if (A.currentPage === "profile") draw();
      }).catch(() => {});
    }
  };
})();

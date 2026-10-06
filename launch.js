// ============================================================
// Vibehouse Launch — 4-step submission with real uploads.
// Type → Details → Media (logo, screenshots, demo video) → Review.
// Files go to Supabase Storage (bucket: listing-media); offline
// mode keeps compressed images in the browser and needs a video link.
// ============================================================
(function () {
  const { TYPES, CATS, validate, parse, normUrl, mk, merge, sb, LS, save, esc } = window.VHI;
  const INPUTS = ["Text", "Image", "Audio", "Video", "PDF", "Code", "URL", "API"];
  const MAX = { logo: 3 * 1024 * 1024, shot: 8 * 1024 * 1024, video: 50 * 1024 * 1024, shots: 8, features: 10 };
  const PROVIDES = { webapp: "Live URL", agent: "Service URL + description", model: "Hugging Face link or API URL", mobile: "App Store link", apk: "Link to your own site" };
  const IMG = /^image\/(png|jpeg|webp|gif)$/, VID = /^video\/(mp4|webm|quicktime)$/;
  const online = () => !!(App.backendReady && window.VibeBackend && VibeBackend.isReady());
  const mb = n => (n / 1048576).toFixed(0) + " MB";

  // shrink big images before upload / offline storage
  function shrink(file, maxDim, q, asBlob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxDim / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        if (asBlob) c.toBlob(b => b ? res(new File([b], (file.name || "image").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })) : rej(new Error("compress")), "image/jpeg", q);
        else res(c.toDataURL("image/jpeg", q));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("That image couldn't be read.")); };
      img.src = url;
    });
  }

  function renderLaunch(el) {
    if (!App.user) {
      el.innerHTML = `<div class="page-header"><h1 class="page-title">Launch your product</h1><p class="page-sub">Log in to submit a web app, AI agent, AI model, mobile app or APK link, with its demo video and screenshots.</p></div>
        <div class="vh-actions"><button class="btn btn-primary" id="gLogin">Log in</button><button class="btn btn-ghost" id="gSignup">Sign up</button></div>`;
      document.getElementById("gLogin").onclick = () => App.openAuth("login");
      document.getElementById("gSignup").onclick = () => App.openAuth("signup");
      return;
    }
    const S = { step: 1, key: null, logo: null, shots: [], vfile: null,
      d: { pricing: "Free", category: CATS[0], cta: "Try", email: App.user.email || "", features: [], inputs: [] } };
    const dots = () => `<div class="vh-steps">${["Type", "Details", "Media", "Review"].map((n, i) => `<span class="${S.step === i + 1 ? "on" : S.step > i + 1 ? "done" : ""}">${i + 1}. ${n}</span>`).join("")}</div>`;
    const head = sub => `<div class="page-header"><h1 class="page-title">Launch your product</h1><p class="page-sub">${sub}</p></div>${dots()}`;
    const val = id => (document.getElementById(id)?.value || "").trim();
    const go = n => { S.step = n; [0, step1, step2, step3, step4][n](); window.scrollTo(0, 0); };

    function step1() {
      el.innerHTML = head("What are you launching? Users reach it through the button on your product page.") +
        `<div class="vh-types">${Object.entries(TYPES).map(([k, t]) => `<button type="button" class="vh-type${S.key === k ? " on" : ""}" data-k="${k}"><b>${t.name}</b><span>${t.how}</span><span>You provide: ${PROVIDES[k]}</span><i>Button: “${k === "agent" ? "Try” or “Connect" : t.cta}”</i></button>`).join("")}</div>
        <div class="vh-actions"><button class="btn btn-primary" id="s1Next" ${S.key ? "" : "disabled"}>Continue</button></div>`;
      el.querySelectorAll(".vh-type").forEach(b => b.onclick = () => { S.key = b.dataset.k; step1(); });
      document.getElementById("s1Next").onclick = () => go(2);
    }

    const counter = (id, max) => `<span class="vh-count" data-for="${id}">0/${max}</span>`;
    function step2(err) {
      const t = TYPES[S.key], d = S.d;
      el.innerHTML = head(t.name + " — " + t.how.toLowerCase() + ".") + `<form id="s2" class="vh-form xl" novalidate>
        <div><label for="fName">Product name</label><input id="fName" maxlength="60" value="${esc(d.name || "")}" placeholder="e.g. Invoice Nest"></div>
        <div><label for="fDesc">One-liner ${counter("fDesc", 160)}</label><input id="fDesc" maxlength="160" value="${esc(d.desc || "")}" placeholder="What it does, in one clear sentence"></div>
        <div><label for="fLong">Full description ${counter("fLong", 4000)}</label><textarea id="fLong" maxlength="4000" placeholder="Who it's for, what problem it solves, how it works and what makes it different. Write as much as you need.">${esc(d.longDesc || "")}</textarea></div>
        <div><label for="fUrl">${t.label}</label><input id="fUrl" type="url" value="${esc(d.url || "")}" placeholder="${esc(t.ph)}"><p class="vh-note">${esc(t.hint)}</p></div>
        ${S.key === "mobile" ? `<div><label for="fUrl2">Google Play link (optional)</label><input id="fUrl2" type="url" value="${esc(d.url2 || "")}" placeholder="https://play.google.com/store/apps/details?id=…"></div>` : ""}
        ${S.key === "agent" ? `<div><label for="fCta">Button</label><select id="fCta"><option ${d.cta === "Try" ? "selected" : ""}>Try</option><option ${d.cta === "Connect" ? "selected" : ""}>Connect</option></select></div>` : ""}
        <div class="vh-row2"><div><label for="fCat">Category</label><select id="fCat">${CATS.map(c => `<option ${d.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
          <div><label for="fPricing">Pricing model</label><select id="fPricing">${["Free", "Freemium", "Free trial", "Paid"].map(c => `<option ${d.pricing === c ? "selected" : ""}>${c}</option>`).join("")}</select></div></div>
        <div id="fPriceWrap" style="display:${d.pricing === "Free" ? "none" : "block"}"><div class="vh-row2"><div><label for="fPrice">Price (e.g. $12/mo)</label><input id="fPrice" maxlength="30" value="${esc(d.price || "")}"></div>
          <div><label for="fPD">Pricing details (optional)</label><input id="fPD" maxlength="200" value="${esc(d.pricingDetails || "")}" placeholder="e.g. 7-day free trial, cancel anytime"></div></div></div>
        <div><label>Supported inputs</label><div class="vh-chips" id="fInputs">${INPUTS.map(x => `<span class="vh-chip2${d.inputs.includes(x) ? " on" : ""}" data-v="${x}" role="button" tabindex="0">${x}</span>`).join("")}</div></div>
        <div><label for="fFeatInp">Key features (up to ${MAX.features})</label><div class="vh-chips" id="fFeat" style="margin-bottom:8px"></div><input id="fFeatInp" maxlength="30" placeholder="Type a feature and press Enter"></div>
        <div class="vh-row2"><div><label for="fVer">Version (optional)</label><input id="fVer" maxlength="20" value="${esc(d.version || "")}" placeholder="v1.0"></div>
          <div><label for="fGit">GitHub link (optional)</label><input id="fGit" type="url" value="${esc(d.github || "")}" placeholder="https://github.com/you/project"></div></div>
        <div><label for="fRel">What's new in this version (optional) ${counter("fRel", 300)}</label><textarea id="fRel" class="sm" maxlength="300">${esc(d.releaseNotes || "")}</textarea></div>
        <div><label for="fEmail">Contact email</label><input id="fEmail" type="email" value="${esc(d.email || "")}"></div>
        <label class="vh-chip2${d.featured ? " on" : ""}" id="fFeaturedL" style="width:fit-content"><input type="checkbox" id="fFeatured" ${d.featured ? "checked" : ""} style="display:none"> Request a featured launch slot</label>
        <p class="vh-note" id="fErr" style="color:var(--danger)">${esc(err || "")}</p>
        <div class="vh-actions" style="margin:0"><button type="button" class="btn btn-ghost" id="s2Back">Back</button><button class="btn btn-primary">Next: add media</button></div></form>`;
      const upCounts = () => el.querySelectorAll(".vh-count").forEach(c => { const f = document.getElementById(c.dataset.for); if (f) c.textContent = f.value.length + "/" + f.maxLength; });
      el.querySelectorAll("input,textarea").forEach(f => f.addEventListener("input", upCounts)); upCounts();
      document.getElementById("fPricing").onchange = e => { document.getElementById("fPriceWrap").style.display = e.target.value === "Free" ? "none" : "block"; };
      const drawFeat = () => { const box = document.getElementById("fFeat"); box.innerHTML = d.features.map((f, i) => `<span class="vh-chip2 on">${esc(f)} <button type="button" data-i="${i}" aria-label="Remove ${esc(f)}">×</button></span>`).join(""); box.querySelectorAll("button").forEach(b => b.onclick = () => { d.features.splice(+b.dataset.i, 1); drawFeat(); }); };
      drawFeat();
      const addFeat = () => { const i = document.getElementById("fFeatInp"), v = i.value.trim().replace(/,$/, ""); if (v && d.features.length < MAX.features && !d.features.some(x => x.toLowerCase() === v.toLowerCase())) { d.features.push(v); drawFeat(); } i.value = ""; };
      document.getElementById("fFeatInp").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addFeat(); } });
      document.getElementById("fInputs").addEventListener("click", e => { const c = e.target.closest(".vh-chip2"); if (!c) return; const v = c.dataset.v, i = d.inputs.indexOf(v); i >= 0 ? d.inputs.splice(i, 1) : d.inputs.push(v); c.classList.toggle("on"); });
      document.getElementById("fFeaturedL").addEventListener("click", e => { e.preventDefault(); const c = document.getElementById("fFeatured"); c.checked = !c.checked; document.getElementById("fFeaturedL").classList.toggle("on", c.checked); });
      document.getElementById("s2Back").onclick = () => { collect(); go(1); };
      document.getElementById("s2").onsubmit = e => {
        e.preventDefault(); addFeat(); collect(); const m = S.d;
        if (m.name.length < 2) return step2("Add a name.");
        if (m.desc.length < 10) return step2("Write a one-liner of at least 10 characters.");
        if ((m.longDesc || "").length < 40) return step2("Write a full description of at least 40 characters so people understand the product.");
        const er = validate(S.key, m.url, m.url2); if (er) return step2(er);
        if (m.github && !/^https:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+/i.test(m.github)) return step2("GitHub link must look like https://github.com/you/project.");
        if (m.pricing !== "Free" && !m.price) return step2("Add the price, for example $12/mo.");
        if (!/^\S+@\S+\.\S+$/.test(m.email)) return step2("Add a valid contact email.");
        const dup = PRODUCTS.find(p => p.url && normUrl(p.url) === normUrl(m.url)); if (dup) return step2("This link is already listed as “" + dup.name + "”.");
        go(3);
      };
    }
    function collect() {
      if (!document.getElementById("fName")) return;
      Object.assign(S.d, { name: val("fName"), desc: val("fDesc"), longDesc: val("fLong"), url: val("fUrl"), url2: val("fUrl2"), cta: val("fCta") || S.d.cta,
        category: val("fCat"), pricing: val("fPricing"), price: val("fPrice"), pricingDetails: val("fPD"), version: val("fVer"), github: val("fGit"),
        releaseNotes: val("fRel"), email: val("fEmail"), featured: !!document.getElementById("fFeatured")?.checked });
    }

    // ----- media step -----
    function step3(err) {
      const d = S.d, on = online();
      el.innerHTML = head("Show people what it looks like. A logo, screenshots and a demo video are required, and they appear on your product page and card.") + `<form id="s3" class="vh-form xl" novalidate>
        <div><label>Logo (required) <span class="vh-count">PNG, JPG or WebP · up to ${mb(MAX.logo)}</span></label>
          <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div id="logoPrev">${S.logo ? `<img class="vh-logo-prev" src="${esc(S.logo.preview)}" alt="Logo preview">` : ""}</div>
          <button type="button" class="btn btn-ghost" id="logoBtn">${S.logo ? "Change logo" : "Upload logo"}</button><input type="file" id="logoIn" accept="image/png,image/jpeg,image/webp" style="display:none"></div></div>
        <div><label>Screenshots (at least 1, up to ${MAX.shots}) <span class="vh-count">PNG, JPG, WebP or GIF · up to ${mb(MAX.shot)} each</span></label>
          <div class="vh-drop" id="shotDrop" tabindex="0" role="button"><b>Drop screenshots here or click to choose</b><span class="vh-note">Show the main screen first, it becomes the card preview.</span></div>
          <input type="file" id="shotIn" accept="image/png,image/jpeg,image/webp,image/gif" multiple style="display:none"><div class="vh-thumbs" id="shotGrid"></div></div>
        <div><label>Demo video (required)</label>
          <div><label for="fVideo" style="font-weight:400">Paste a YouTube, Vimeo, Loom or direct .mp4 link</label><input id="fVideo" type="url" value="${esc(d.video || "")}" placeholder="https://www.youtube.com/watch?v=…"></div>
          <p class="vh-note" style="margin:10px 0">${on ? `or upload a video file (MP4, WebM or MOV, up to ${mb(MAX.video)}):` : "Video file upload turns on once cloud storage is connected. For now paste a link."}</p>
          ${on ? `<button type="button" class="btn btn-ghost" id="vidBtn">${S.vfile ? "Change video" : "Upload video file"}</button><input type="file" id="vidIn" accept="video/mp4,video/webm,video/quicktime" style="display:none"><div class="vh-thumbs" id="vidGrid"></div>` : ""}</div>
        <p class="vh-note" id="fErr" style="color:var(--danger)">${esc(err || "")}</p>
        <div class="vh-actions" style="margin:0"><button type="button" class="btn btn-ghost" id="s3Back">Back</button><button class="btn btn-primary">Review</button></div></form>`;
      const msg = t => { const e = document.getElementById("fErr"); e.textContent = t || ""; };
      const drawShots = () => {
        const g = document.getElementById("shotGrid");
        g.innerHTML = S.shots.map((s, i) => `<div class="vh-thumb"><img src="${esc(s.preview)}" alt="Screenshot ${i + 1}"><button type="button" data-i="${i}" aria-label="Remove screenshot ${i + 1}">×</button></div>`).join("");
        g.querySelectorAll("button").forEach(b => b.onclick = () => { URL.revokeObjectURL(S.shots[+b.dataset.i].preview); S.shots.splice(+b.dataset.i, 1); drawShots(); });
      };
      const drawVid = () => { const g = document.getElementById("vidGrid"); if (g) g.innerHTML = S.vfile ? `<div class="vh-thumb"><video src="${esc(S.vfile.preview)}" muted></video><button type="button" aria-label="Remove video" id="vidRm">×</button></div>` : ""; document.getElementById("vidRm")?.addEventListener("click", () => { URL.revokeObjectURL(S.vfile.preview); S.vfile = null; drawVid(); document.getElementById("vidBtn").textContent = "Upload video file"; }); };
      drawShots(); drawVid();
      document.getElementById("logoBtn").onclick = () => document.getElementById("logoIn").click();
      document.getElementById("logoIn").onchange = e => { const f = e.target.files[0]; if (!f) return;
        if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return msg("Logo must be a PNG, JPG or WebP image.");
        if (f.size > MAX.logo) return msg("Logo is " + mb(f.size) + ". Keep it under " + mb(MAX.logo) + ".");
        if (S.logo) URL.revokeObjectURL(S.logo.preview); S.logo = { file: f, preview: URL.createObjectURL(f) }; msg("");
        document.getElementById("logoPrev").innerHTML = `<img class="vh-logo-prev" src="${esc(S.logo.preview)}" alt="Logo preview">`; document.getElementById("logoBtn").textContent = "Change logo"; };
      const addShots = files => { for (const f of files) {
        if (S.shots.length >= MAX.shots) return msg("You can add up to " + MAX.shots + " screenshots.");
        if (!IMG.test(f.type)) { msg("“" + f.name + "” isn't a PNG, JPG, WebP or GIF image."); continue; }
        if (f.size > MAX.shot * 3) { msg("“" + f.name + "” is too large (" + mb(f.size) + ")."); continue; }
        S.shots.push({ file: f, preview: URL.createObjectURL(f) }); msg(""); } drawShots(); };
      const drop = document.getElementById("shotDrop"), inp = document.getElementById("shotIn");
      drop.onclick = () => inp.click(); drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } };
      inp.onchange = e => { addShots([...e.target.files]); inp.value = ""; };
      drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); }; drop.ondragleave = () => drop.classList.remove("over");
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); addShots([...e.dataTransfer.files]); };
      document.getElementById("vidBtn")?.addEventListener("click", () => document.getElementById("vidIn").click());
      document.getElementById("vidIn")?.addEventListener("change", e => { const f = e.target.files[0]; if (!f) return;
        if (!VID.test(f.type)) return msg("Video must be MP4, WebM or MOV.");
        if (f.size > MAX.video) return msg("Video is " + mb(f.size) + ". The limit is " + mb(MAX.video) + ", so paste a YouTube or Loom link instead.");
        if (S.vfile) URL.revokeObjectURL(S.vfile.preview); S.vfile = { file: f, preview: URL.createObjectURL(f) }; msg(""); drawVid(); document.getElementById("vidBtn").textContent = "Change video"; });
      document.getElementById("s3Back").onclick = () => { S.d.video = val("fVideo"); go(2); };
      document.getElementById("s3").onsubmit = e => { e.preventDefault(); S.d.video = val("fVideo");
        if (!S.logo) return step3("Upload your logo.");
        if (!S.shots.length) return step3("Add at least one screenshot.");
        if (!S.vfile && !S.d.video) return step3("Add a demo video: paste a link or upload a file.");
        if (S.d.video && !window.VHMedia.embed(S.d.video)) return step3("That video link isn't supported. Use YouTube, Vimeo, Loom or a direct https .mp4/.webm link.");
        go(4); };
    }

    // ----- review + launch -----
    function step4(err) {
      const t = TYPES[S.key], d = S.d, cta = S.key === "agent" ? d.cta : t.cta, host = (parse(d.url) || {}).hostname || "";
      el.innerHTML = head("Check how it will look, then launch.") + `<div class="vh-panel" style="margin-top:0;max-width:760px">
        <div style="display:flex;gap:16px;align-items:center"><img class="vh-logo-prev" src="${esc(S.logo.preview)}" alt=""><div><h3 style="margin:0">${esc(d.name)} <span class="vh-badge">${t.name}</span></h3><p class="vh-note" style="margin:4px 0 0">${esc(d.desc)}</p></div></div>
        <div class="vh-thumbs">${S.shots.map(s => `<div class="vh-thumb"><img src="${esc(s.preview)}" alt=""></div>`).join("")}</div>
        <p class="vh-note" style="margin-top:12px">${esc(d.pricing)}${d.price && d.pricing !== "Free" ? " · " + esc(d.price) : ""} · ${esc(d.category)}${d.features.length ? " · " + d.features.map(esc).join(", ") : ""}</p>
        <p class="vh-note">Demo video: ${S.vfile ? "uploaded file (" + esc(S.vfile.file.name) + ")" : esc(d.video)}</p>
        <div class="vh-actions" style="margin:12px 0 4px"><button class="btn btn-primary" type="button" tabindex="-1">${esc(cta)} ↗</button></div>
        <p class="vh-note">The button opens <b>${esc(host)}</b> in a new tab on your product page.</p>
        <div class="vh-prog" id="prog" style="display:none"><i></i></div><p class="vh-note" id="gStat"></p>
        <p class="vh-note" id="gErr" style="color:var(--danger)">${esc(err || "")}</p></div>
        <div class="vh-actions"><button class="btn btn-ghost" id="s4Back">Back</button><button class="btn btn-primary" id="s4Go">Launch</button></div>`;
      document.getElementById("s4Back").onclick = () => go(3);
      document.getElementById("s4Go").onclick = async ev => {
        const btn = ev.target, stat = document.getElementById("gStat"), bar = document.querySelector("#prog i");
        btn.disabled = true; document.getElementById("prog").style.display = "block"; document.getElementById("gErr").textContent = "";
        const total = 1 + S.shots.length + (S.vfile ? 1 : 0); let done = 0;
        const tick = label => { done++; bar.style.width = Math.round(done / total * 100) + "%"; stat.textContent = label; };
        const uid = String(App.user.id || "me"), on = online();
        const put = async (f, kind) => {
          if (on) { let up = f; if (kind !== "video" && f.size > MAX.shot) up = await shrink(f, 2400, 0.85, true);
            const r = await VibeBackend.uploadMedia(up, uid); if (!r.ok) throw new Error(r.error || "Upload failed"); return r.url; }
          return shrink(f, kind === "logo" ? 256 : 1200, 0.78, false);
        };
        try {
          stat.textContent = "Uploading logo…"; const logoUrl = await put(S.logo.file, "logo"); tick("Logo uploaded");
          const shotUrls = []; for (let i = 0; i < S.shots.length; i++) { stat.textContent = "Uploading screenshot " + (i + 1) + " of " + S.shots.length + "…"; shotUrls.push(await put(S.shots[i].file, "shot")); tick("Screenshot " + (i + 1) + " uploaded"); }
          let video = d.video; if (S.vfile) { stat.textContent = "Uploading video… this can take a minute"; video = await put(S.vfile.file, "video"); tick("Video uploaded"); }
          stat.textContent = "Publishing…";
          const id = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);
          const price = d.pricing === "Free" ? "Free" : (d.price || d.pricing);
          const l = { id, typeKey: S.key, name: d.name, category: d.category, desc: d.desc, longDesc: d.longDesc, url: d.url, url2: d.url2 || "", cta,
            owner: App.user.name, ownerId: App.user.id || "me", ownerEmail: d.email, pricing: d.pricing, price, pricingDetails: d.pricingDetails || "", logoUrl,
            screenshots: shotUrls, video, features: d.features, inputs: d.inputs, version: d.version || "", releaseNotes: d.releaseNotes || "", github: d.github || "", featured: false, created: new Date().toISOString() };
          const c = sb();
          if (c) {
            const { error } = await c.from("listings").insert([{ id, type_key: S.key, type: t.name, name: l.name, category: l.category, description: l.desc, long_desc: l.longDesc, url: l.url, url2: l.url2 || null, cta,
              owner: l.owner, owner_id: String(l.ownerId), owner_email: d.email, pricing: l.pricing, price, pricing_details: l.pricingDetails || null, logo_url: logoUrl,
              screenshots: shotUrls, video_url: video, features: d.features, inputs: d.inputs, version: l.version || null, release_notes: l.releaseNotes || null, github: l.github || null,
              featured_requested: !!d.featured, status: "live" }]);
            if (error) throw new Error(error.code === "23505" ? "This link is already listed." : /column|schema cache/i.test(error.message) ? "The database needs the latest supabase-schema.sql. Run it once in the Supabase SQL editor, then launch again." : error.message);
          } else save("vh_listings", [l, ...LS("vh_listings", [])]);
          try { const o = LS("vh_owned_products", []); o.push(id); save("vh_owned_products", o); } catch (x) {}
          merge(mk(l)); window.VHI.refreshCounts(); App.toast("Launched “" + l.name + "”", "success"); App.go("/ai/" + id);
        } catch (e) { btn.disabled = false; document.getElementById("prog").style.display = "none"; stat.textContent = ""; step4("Couldn't launch: " + (e.message || e)); }
      };
    }
    step1();
  }
  App.renderLaunch = renderLaunch;
})();

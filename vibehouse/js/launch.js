// ============================================================
// Vibehouse Launch – 4-step form, pure backend
// ============================================================
(function () {
  const { TYPES, CATS, validate, parse, normUrl, mk, merge, sb, esc } = window.VHI;
  const INPUTS = ["Text", "Image", "Audio", "Video", "PDF", "Code", "URL", "API"];
  const MAX = { logo: 3 * 1024 * 1024, shot: 8 * 1024 * 1024, video: 50 * 1024 * 1024, shots: 8, features: 10 };
  const PROVIDES = { webapp: "Live URL", agent: "Service URL + description", model: "Hugging Face / API", mobile: "App Store link", apk: "Your site download page" };
  const IMG = /^image\/(png|jpeg|webp|gif)$/;
  const VID = /^video\/(mp4|webm|quicktime)$/;
  const CUR = { INR: "₹", USD: "$" };

  function fmtPrice(cur, raw) {
    const rest = String(raw || "").trim().replace(/^(₹|\$|inr|usd|rs\.?)\s*/i, "");
    return rest ? (CUR[cur] || "₹") + rest : "";
  }

  function shrink(file, maxDim, q, asBlob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        if (asBlob) {
          c.toBlob(b => b ? res(new File([b], (file.name || "image").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })) : rej(new Error("compress")), "image/jpeg", q);
        } else {
          res(c.toDataURL("image/jpeg", q));
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Image unreadable")); };
      img.src = url;
    });
  }

  function renderLaunch(el) {
    if (!App.user) {
      el.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Launch your product</h1>
          <p class="page-sub">Log in to submit a web app, AI agent, AI model, mobile app or APK.</p>
        </div>
        <div class="vh-actions">
          <button class="btn btn-primary" id="gLogin">Log in</button>
          <button class="btn btn-ghost" id="gSignup">Sign up</button>
        </div>`;
      document.getElementById("gLogin").onclick = () => App.openAuth("login");
      document.getElementById("gSignup").onclick = () => App.openAuth("signup");
      return;
    }

    const S = {
      step: 1,
      key: null,
      logo: null,
      shots: [],
      vfile: null,
      d: { pricing: "Free", currency: "INR", category: CATS[0], cta: "Try", email: App.user.email || "", features: [], inputs: [] }
    };

    const dots = () => `<div class="vh-steps">${["Type", "Details", "Media", "Review"].map((n, i) =>
      `<span class="${S.step === i + 1 ? "on" : S.step > i + 1 ? "done" : ""}">${i + 1}. ${n}</span>`
    ).join("")}</div>`;

    const head = sub => `<div class="page-header"><h1 class="page-title">Launch your product</h1><p class="page-sub">${sub}</p></div>${dots()}`;
    const val = id => (document.getElementById(id)?.value || "").trim();
    const go = n => { S.step = n; [null, step1, step2, step3, step4][n](); window.scrollTo(0, 0); };

    function step1() {
      el.innerHTML = head("What are you launching?") +
        `<div class="vh-types">${Object.entries(TYPES).map(([k, t]) =>
          `<button type="button" class="vh-type${S.key === k ? " on" : ""}" data-k="${k}">
            <b>${t.name}</b><span>${t.how}</span>
            <span>You provide: ${PROVIDES[k]}</span>
            <i>Button: “${k === "agent" ? "Try” or “Connect" : t.cta}”</i>
          </button>`
        ).join("")}</div>
        <div class="vh-actions"><button class="btn btn-primary" id="s1Next" ${S.key ? "" : "disabled"}>Continue</button></div>`;
      el.querySelectorAll(".vh-type").forEach(b => b.onclick = () => { S.key = b.dataset.k; step1(); });
      document.getElementById("s1Next").onclick = () => go(2);
    }

    function step2(err) {
      const t = TYPES[S.key];
      const d = S.d;
      el.innerHTML = head(t.name + " — " + t.how.toLowerCase()) + `
        <form id="s2" class="vh-form xl" novalidate>
          <div><label>Product name</label><input id="fName" maxlength="60" value="${esc(d.name || "")}" placeholder="e.g. Invoice Nest"></div>
          <div><label>One-liner</label><input id="fDesc" maxlength="160" value="${esc(d.desc || "")}" placeholder="What it does in one clear sentence"></div>
          <div><label>Full description</label><textarea id="fLong" maxlength="4000" rows="5">${esc(d.longDesc || "")}</textarea></div>
          <div><label>${t.label}</label><input id="fUrl" type="url" value="${esc(d.url || "")}" placeholder="${esc(t.ph)}"><p class="vh-note">${esc(t.hint)}</p></div>
          ${S.key === "mobile" ? `<div><label>Google Play link (optional)</label><input id="fUrl2" type="url" value="${esc(d.url2 || "")}"></div>` : ""}
          ${S.key === "agent" ? `<div><label>Button</label><select id="fCta"><option ${d.cta === "Try" ? "selected" : ""}>Try</option><option ${d.cta === "Connect" ? "selected" : ""}>Connect</option></select></div>` : ""}
          <div class="vh-row2">
            <div><label>Category</label><select id="fCat">${CATS.map(c => `<option ${d.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
            <div><label>Pricing model</label><select id="fPricing">${["Free", "Freemium", "Free trial", "Paid"].map(c => `<option ${d.pricing === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
          </div>
          <div id="fPriceWrap" style="display:${d.pricing === "Free" ? "none" : "block"}">
            <div class="vh-row2">
              <div><label>Price</label>
                <div style="display:flex;gap:8px">
                  <select id="fCur" style="width:120px"><option value="INR" ${d.currency !== "USD" ? "selected" : ""}>₹ INR</option><option value="USD" ${d.currency === "USD" ? "selected" : ""}>$ USD</option></select>
                  <input id="fPrice" maxlength="30" value="${esc(d.price || "")}" placeholder="499/mo" style="flex:1">
                </div>
              </div>
              <div><label>Pricing details (optional)</label><input id="fPD" maxlength="200" value="${esc(d.pricingDetails || "")}"></div>
            </div>
          </div>
          <div><label>Supported inputs</label><div class="vh-chips" id="fInputs">${INPUTS.map(x => `<span class="vh-chip2${d.inputs.includes(x) ? " on" : ""}" data-v="${x}">${x}</span>`).join("")}</div></div>
          <div><label>Key features (up to ${MAX.features})</label><div class="vh-chips" id="fFeat" style="margin-bottom:8px"></div><input id="fFeatInp" maxlength="30" placeholder="Type a feature and press Enter"></div>
          <div class="vh-row2">
            <div><label>Version (optional)</label><input id="fVer" maxlength="20" value="${esc(d.version || "")}"></div>
            <div><label>GitHub (optional)</label><input id="fGit" type="url" value="${esc(d.github || "")}"></div>
          </div>
          <div><label>What's new (optional)</label><textarea id="fRel" class="sm" maxlength="300">${esc(d.releaseNotes || "")}</textarea></div>
          <div><label>Contact email</label><input id="fEmail" type="email" value="${esc(d.email || "")}"></div>
          <p class="vh-note" id="fErr" style="color:var(--danger)">${esc(err || "")}</p>
          <div class="vh-actions" style="margin:0">
            <button type="button" class="btn btn-ghost" id="s2Back">Back</button>
            <button class="btn btn-primary">Next: add media</button>
          </div>
        </form>`;

      document.getElementById("fPricing").onchange = e => {
        document.getElementById("fPriceWrap").style.display = e.target.value === "Free" ? "none" : "block";
      };

      const drawFeat = () => {
        const box = document.getElementById("fFeat");
        box.innerHTML = d.features.map((f, i) =>
          `<span class="vh-chip2 on">${esc(f)} <button type="button" data-i="${i}">×</button></span>`
        ).join("");
        box.querySelectorAll("button").forEach(b => b.onclick = () => {
          d.features.splice(+b.dataset.i, 1);
          drawFeat();
        });
      };
      drawFeat();

      const addFeat = () => {
        const i = document.getElementById("fFeatInp");
        const v = i.value.trim().replace(/,$/, "");
        if (v && d.features.length < MAX.features && !d.features.some(x => x.toLowerCase() === v.toLowerCase())) {
          d.features.push(v);
          drawFeat();
        }
        i.value = "";
      };
      document.getElementById("fFeatInp").addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addFeat(); }
      });

      document.getElementById("fInputs").addEventListener("click", e => {
        const c = e.target.closest(".vh-chip2");
        if (!c) return;
        const v = c.dataset.v;
        const i = d.inputs.indexOf(v);
        i >= 0 ? d.inputs.splice(i, 1) : d.inputs.push(v);
        c.classList.toggle("on");
      });

      document.getElementById("s2Back").onclick = () => { collect(); go(1); };
      document.getElementById("s2").onsubmit = e => {
        e.preventDefault();
        addFeat();
        collect();
        const m = S.d;
        if (m.name.length < 2) return step2("Add a name.");
        if (m.desc.length < 10) return step2("Write a one-liner of at least 10 characters.");
        if ((m.longDesc || "").length < 40) return step2("Write a full description of at least 40 characters.");
        const er = validate(S.key, m.url, m.url2);
        if (er) return step2(er);
        if (m.github && !/^https:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+/i.test(m.github)) return step2("Invalid GitHub link.");
        if (m.pricing !== "Free" && !fmtPrice(m.currency, m.price)) return step2("Add the price.");
        if (!/^\S+@\S+\.\S+$/.test(m.email)) return step2("Add a valid contact email.");
        const dup = PRODUCTS.find(p => p.url && normUrl(p.url) === normUrl(m.url));
        if (dup) return step2(`This link is already listed as “${dup.name}”.`);
        go(3);
      };
    }

    function collect() {
      if (!document.getElementById("fName")) return;
      Object.assign(S.d, {
        name: val("fName"),
        desc: val("fDesc"),
        longDesc: val("fLong"),
        url: val("fUrl"),
        url2: val("fUrl2"),
        cta: val("fCta") || S.d.cta,
        category: val("fCat"),
        pricing: val("fPricing"),
        currency: val("fCur") || S.d.currency,
        price: val("fPrice"),
        pricingDetails: val("fPD"),
        version: val("fVer"),
        github: val("fGit"),
        releaseNotes: val("fRel"),
        email: val("fEmail")
      });
    }

    function step3(err) {
      const d = S.d;
      el.innerHTML = head("Show people what it looks like") + `
        <form id="s3" class="vh-form xl" novalidate>
          <div>
            <label>Logo (required)</label>
            <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
              <div id="logoPrev">${S.logo ? `<img class="vh-logo-prev" src="${esc(S.logo.preview)}" alt="Logo">` : ""}</div>
              <button type="button" class="btn btn-ghost" id="logoBtn">${S.logo ? "Change logo" : "Upload logo"}</button>
              <input type="file" id="logoIn" accept="image/png,image/jpeg,image/webp" style="display:none">
            </div>
          </div>
          <div>
            <label>Screenshots (at least 1, up to ${MAX.shots})</label>
            <div class="vh-drop" id="shotDrop" tabindex="0" role="button">
              <b>Drop screenshots here or click to choose</b>
            </div>
            <input type="file" id="shotIn" accept="image/png,image/jpeg,image/webp,image/gif" multiple style="display:none">
            <div class="vh-thumbs" id="shotGrid"></div>
          </div>
          <div>
            <label>Demo video (required)</label>
            <input id="fVideo" type="url" value="${esc(d.video || "")}" placeholder="YouTube, Vimeo, Loom or direct .mp4 link">
            <p class="vh-note" style="margin:10px 0">or upload a video file (MP4 / WebM / MOV):</p>
            <button type="button" class="btn btn-ghost" id="vidBtn">${S.vfile ? "Change video" : "Upload video file"}</button>
            <input type="file" id="vidIn" accept="video/mp4,video/webm,video/quicktime" style="display:none">
            <div class="vh-thumbs" id="vidGrid"></div>
          </div>
          <p class="vh-note" id="fErr" style="color:var(--danger)">${esc(err || "")}</p>
          <div class="vh-actions" style="margin:0">
            <button type="button" class="btn btn-ghost" id="s3Back">Back</button>
            <button class="btn btn-primary">Review</button>
          </div>
        </form>`;

      const msg = t => { const e = document.getElementById("fErr"); if (e) e.textContent = t || ""; };

      const drawShots = () => {
        const g = document.getElementById("shotGrid");
        g.innerHTML = S.shots.map((s, i) =>
          `<div class="vh-thumb"><img src="${esc(s.preview)}" alt="Screenshot ${i + 1}"><button type="button" data-i="${i}">×</button></div>`
        ).join("");
        g.querySelectorAll("button").forEach(b => b.onclick = () => {
          URL.revokeObjectURL(S.shots[+b.dataset.i].preview);
          S.shots.splice(+b.dataset.i, 1);
          drawShots();
        });
      };
      const drawVid = () => {
        const g = document.getElementById("vidGrid");
        if (g) g.innerHTML = S.vfile
          ? `<div class="vh-thumb"><video src="${esc(S.vfile.preview)}" muted></video><button type="button" id="vidRm">×</button></div>`
          : "";
        document.getElementById("vidRm")?.addEventListener("click", () => {
          URL.revokeObjectURL(S.vfile.preview);
          S.vfile = null;
          drawVid();
          document.getElementById("vidBtn").textContent = "Upload video file";
        });
      };
      drawShots();
      drawVid();

      document.getElementById("logoBtn").onclick = () => document.getElementById("logoIn").click();
      document.getElementById("logoIn").onchange = e => {
        const f = e.target.files[0];
        if (!f) return;
        if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return msg("Logo must be PNG, JPG or WebP.");
        if (f.size > MAX.logo) return msg("Logo too large.");
        if (S.logo) URL.revokeObjectURL(S.logo.preview);
        S.logo = { file: f, preview: URL.createObjectURL(f) };
        msg("");
        document.getElementById("logoPrev").innerHTML = `<img class="vh-logo-prev" src="${esc(S.logo.preview)}" alt="Logo">`;
        document.getElementById("logoBtn").textContent = "Change logo";
      };

      const addShots = files => {
        for (const f of files) {
          if (S.shots.length >= MAX.shots) return msg(`Max ${MAX.shots} screenshots.`);
          if (!IMG.test(f.type)) { msg(`“${f.name}” is not a supported image.`); continue; }
          if (f.size > MAX.shot * 3) { msg(`“${f.name}” is too large.`); continue; }
          S.shots.push({ file: f, preview: URL.createObjectURL(f) });
          msg("");
        }
        drawShots();
      };

      const drop = document.getElementById("shotDrop");
      const inp = document.getElementById("shotIn");
      drop.onclick = () => inp.click();
      inp.onchange = e => { addShots([...e.target.files]); inp.value = ""; };
      drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
      drop.ondragleave = () => drop.classList.remove("over");
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); addShots([...e.dataTransfer.files]); };

      document.getElementById("vidBtn")?.addEventListener("click", () => document.getElementById("vidIn").click());
      document.getElementById("vidIn")?.addEventListener("change", e => {
        const f = e.target.files[0];
        if (!f) return;
        if (!VID.test(f.type)) return msg("Video must be MP4, WebM or MOV.");
        if (f.size > MAX.video) return msg("Video too large – paste a link instead.");
        if (S.vfile) URL.revokeObjectURL(S.vfile.preview);
        S.vfile = { file: f, preview: URL.createObjectURL(f) };
        msg("");
        drawVid();
        document.getElementById("vidBtn").textContent = "Change video";
      });

      document.getElementById("s3Back").onclick = () => { S.d.video = val("fVideo"); go(2); };
      document.getElementById("s3").onsubmit = e => {
        e.preventDefault();
        S.d.video = val("fVideo");
        if (!S.logo) return step3("Upload your logo.");
        if (!S.shots.length) return step3("Add at least one screenshot.");
        if (!S.vfile && !S.d.video) return step3("Add a demo video (link or file).");
        if (S.d.video && !window.VHMedia?.embed(S.d.video)) return step3("Unsupported video link. Use YouTube, Vimeo, Loom or direct .mp4.");
        go(4);
      };
    }

    function step4(err) {
      const t = TYPES[S.key];
      const d = S.d;
      const cta = S.key === "agent" ? d.cta : t.cta;
      const host = (parse(d.url) || {}).hostname || "";
      const shownPrice = d.pricing === "Free" ? "Free" : (fmtPrice(d.currency, d.price) || d.pricing);

      el.innerHTML = head("Check how it will look, then launch.") + `
        <div class="vh-panel" style="margin-top:0;max-width:760px">
          <div style="display:flex;gap:16px;align-items:center">
            <img class="vh-logo-prev" src="${esc(S.logo.preview)}" alt="">
            <div>
              <h3 style="margin:0">${esc(d.name)} <span class="vh-badge">${t.name}</span></h3>
              <p class="vh-note" style="margin:4px 0 0">${esc(d.desc)}</p>
            </div>
          </div>
          <div class="vh-thumbs">${S.shots.map(s => `<div class="vh-thumb"><img src="${esc(s.preview)}" alt=""></div>`).join("")}</div>
          <p class="vh-note" style="margin-top:12px">${esc(d.pricing)}${d.pricing !== "Free" ? " · " + esc(shownPrice) : ""} · ${esc(d.category)}</p>
          <p class="vh-note">Demo: ${S.vfile ? "uploaded file" : esc(d.video)}</p>
          <div class="vh-actions" style="margin:12px 0 4px">
            <button class="btn btn-primary" type="button" tabindex="-1">${esc(cta)} ↗</button>
          </div>
          <p class="vh-note">The button opens <b>${esc(host)}</b> in a new tab.</p>
          <div class="vh-prog" id="prog" style="display:none"><i></i></div>
          <p class="vh-note" id="gStat"></p>
          <p class="vh-note" id="gErr" style="color:var(--danger)">${esc(err || "")}</p>
        </div>
        <div class="vh-actions">
          <button class="btn btn-ghost" id="s4Back">Back</button>
          <button class="btn btn-primary" id="s4Go">Launch</button>
        </div>`;

      document.getElementById("s4Back").onclick = () => go(3);
      document.getElementById("s4Go").onclick = async ev => {
        const btn = ev.target;
        const stat = document.getElementById("gStat");
        const bar = document.querySelector("#prog i");
        btn.disabled = true;
        document.getElementById("prog").style.display = "block";
        document.getElementById("gErr").textContent = "";

        const total = 1 + S.shots.length + (S.vfile ? 1 : 0);
        let done = 0;
        const tick = label => {
          done++;
          bar.style.width = Math.round(done / total * 100) + "%";
          stat.textContent = label;
        };

        const uid = String(App.user.id);
        const put = async (f, kind) => {
          let up = f;
          if (kind !== "video" && f.size > MAX.shot) up = await shrink(f, 2400, 0.85, true);
          const r = await VibeBackend.uploadMedia(up, uid);
          if (!r.ok) throw new Error(r.error || "Upload failed");
          return r.url;
        };

        try {
          stat.textContent = "Uploading logo…";
          const logoUrl = await put(S.logo.file, "logo");
          tick("Logo uploaded");

          const shotUrls = [];
          for (let i = 0; i < S.shots.length; i++) {
            stat.textContent = `Uploading screenshot ${i + 1} of ${S.shots.length}…`;
            shotUrls.push(await put(S.shots[i].file, "shot"));
            tick(`Screenshot ${i + 1} uploaded`);
          }

          let video = d.video;
          if (S.vfile) {
            stat.textContent = "Uploading video…";
            video = await put(S.vfile.file, "video");
            tick("Video uploaded");
          }

          stat.textContent = "Publishing…";
          const id = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);
          const price = d.pricing === "Free" ? "Free" : (fmtPrice(d.currency, d.price) || d.pricing);

          const l = {
            id, typeKey: S.key, name: d.name, category: d.category, desc: d.desc, longDesc: d.longDesc,
            url: d.url, url2: d.url2 || "", cta,
            owner: App.user.name, ownerId: App.user.id, ownerEmail: d.email,
            pricing: d.pricing, price, pricingDetails: d.pricingDetails || "",
            logoUrl, screenshots: shotUrls, video,
            features: d.features, inputs: d.inputs,
            version: d.version || "", releaseNotes: d.releaseNotes || "", github: d.github || "",
            featured: false, created: new Date().toISOString()
          };

          const c = sb();
          if (!c) throw new Error("Backend not ready");

          const { error } = await c.from("listings").insert([{
            id, type_key: S.key, type: t.name, name: l.name, category: l.category,
            description: l.desc, long_desc: l.longDesc, url: l.url, url2: l.url2 || null, cta,
            owner: l.owner, owner_id: String(l.ownerId), owner_email: d.email,
            pricing: l.pricing, price, pricing_details: l.pricingDetails || null,
            logo_url: logoUrl, screenshots: shotUrls, video_url: video,
            features: d.features, inputs: d.inputs,
            version: l.version || null, release_notes: l.releaseNotes || null, github: l.github || null,
            featured_requested: false, status: "live"
          }]);

          if (error) {
            if (error.code === "23505") throw new Error("This link is already listed.");
            throw new Error(error.message);
          }

          merge(mk(l));
          if (window.VH?.refreshCounts) VH.refreshCounts();
          App.toast(`Launched “${l.name}”`, "success");
          App.go("/ai/" + id);
        } catch (e) {
          btn.disabled = false;
          document.getElementById("prog").style.display = "none";
          stat.textContent = "";
          step4("Couldn't launch: " + (e.message || e));
        }
      };
    }

    step1();
  }

  App.renderLaunch = renderLaunch;
})();

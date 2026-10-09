// ============================================================
// Vibehouse Media – videos & screenshots only on product pages
// ============================================================
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
  const realImg = u => typeof u === "string" && (/^https:\/\//i.test(u) || /^data:image\//i.test(u));

  function embed(url) {
    let u;
    try { u = new URL(String(url || "").trim()); } catch (e) { return null; }
    if (u.protocol !== "https:") return null;
    const h = u.hostname.replace(/^www\./, "");
    let m;
    if (h === "youtu.be") m = u.pathname.slice(1);
    else if (h === "youtube.com" || h === "m.youtube.com") {
      m = u.searchParams.get("v") || (u.pathname.match(/^\/(?:embed|shorts)\/([\w-]{6,})/) || [])[1];
    }
    if (m && /^[\w-]{6,15}$/.test(m)) {
      return { kind: "yt", id: m, src: "https://www.youtube-nocookie.com/embed/" + m, thumb: "https://img.youtube.com/vi/" + m + "/hqdefault.jpg" };
    }
    if (h === "vimeo.com" && /^\/\d+/.test(u.pathname)) {
      return { kind: "vimeo", src: "https://player.vimeo.com/video/" + u.pathname.split("/")[1] };
    }
    if (h === "loom.com" && /^\/share\/[\w]+/.test(u.pathname)) {
      return { kind: "loom", src: "https://www.loom.com/embed/" + u.pathname.split("/")[2] };
    }
    if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { kind: "file", src: u.href };
    return null;
  }

  function player(v, title) {
    if (!v) return "";
    const e = embed(v);
    if (!e) return "";
    return e.kind === "file"
      ? `<div class="vh-player"><video src="${esc(e.src)}" controls playsinline preload="metadata"></video></div>`
      : `<div class="vh-player"><iframe src="${esc(e.src)}" title="${esc(title || "Demo")}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
  }

  window.VHMedia = { embed, player, realImg };

  const shots = p => (p.screenshots || []).filter(realImg);

  // Enhance product detail page
  const origProduct = App.renderProduct.bind(App);
  App.renderProduct = function (el, id) {
    origProduct(el, id);
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;

    const hero = el.querySelector(".detail-hero");
    if (!hero) return;

    const ss = shots(p);
    const pv = player(p.video, p.name + " demo");

    let html = "";
    if (pv) html += `<div class="vh-media"><h3>Demo video</h3>${pv}</div>`;
    if (ss.length) {
      html += `<div class="vh-media"><h3>Screenshots</h3>
        <div class="vh-gallery">${ss.map((s, i) =>
          `<img src="${esc(s)}" alt="${esc(p.name)} screenshot ${i + 1}" loading="lazy" data-i="${i}">`
        ).join("")}</div></div>`;
    }

    const facts = [
      p.price && ["Pricing", p.price + (p.pricingDetails ? " — " + p.pricingDetails : "")],
      (p.inputs || []).length && ["Supported inputs", p.inputs.join(", ")],
      p.version && ["Latest version", p.version + (p.releaseNotes ? " · " + p.releaseNotes : "")],
      p.github && ["Source", `<a href="${esc(p.github)}" target="_blank" rel="noopener" style="text-decoration:underline">${esc(p.github.replace(/^https:\/\//, ""))}</a>`]
    ].filter(Boolean);

    const factsHtml = facts.length
      ? `<div class="card"><h3>Details</h3><dl class="vh-facts">${facts.map(f =>
          `<dt>${f[0]}</dt><dd>${f[0] === "Source" ? f[1] : esc(f[1])}</dd>`
        ).join("")}</dl></div>`
      : "";

    hero.insertAdjacentHTML("afterend", html);
    const left = el.querySelector(".detail-grid > div");
    if (left && factsHtml) left.insertAdjacentHTML("afterbegin", factsHtml);

    el.querySelectorAll(".vh-gallery img").forEach(img => {
      img.onclick = () => App.openMediaModal("image", img.src, p.name);
    });
  };

  // Helper for modal
  App.openMediaModal = function (kind, src, title = "Preview") {
    const overlay = document.getElementById("modalOverlay");
    const body = document.getElementById("modalBody");
    if (!overlay || !body) return;
    const safe = App.esc(src);
    const t = App.esc(title);
    body.innerHTML = kind === "video"
      ? `<h2 class="modal-title">${t}</h2><video src="${safe}" controls autoplay playsinline style="width:100%;border-radius:12px;background:#000;max-height:65vh"></video>`
      : `<h2 class="modal-title">${t}</h2><img src="${safe}" alt="${t}" style="width:100%;border-radius:12px">`;
    overlay.classList.add("open");
  };
})();

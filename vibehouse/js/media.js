// ============================================================
// Vibehouse Media — real videos, screenshots and details on
// product pages and cards. Only real media is shown: nothing
// is rendered for missing or placeholder files.
// ============================================================
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const realImg = u => typeof u === "string" && (/^https:\/\//i.test(u) || /^data:image\//i.test(u) || /^\/?assets\//.test(u));

  // YouTube / Vimeo / Loom links become embeds; direct https mp4/webm/mov links play natively
  function embed(url) {
    let u; try { u = new URL(String(url || "").trim()); } catch (e) { return null; }
    if (u.protocol !== "https:") return null;
    const h = u.hostname.replace(/^www\./, "");
    let m;
    if (h === "youtu.be") m = u.pathname.slice(1);
    else if (h === "youtube.com" || h === "m.youtube.com") m = u.searchParams.get("v") || (u.pathname.match(/^\/(?:embed|shorts)\/([\w-]{6,})/) || [])[1];
    if (m && /^[\w-]{6,15}$/.test(m)) return { kind: "yt", id: m, src: "https://www.youtube-nocookie.com/embed/" + m, thumb: "https://img.youtube.com/vi/" + m + "/hqdefault.jpg" };
    if (h === "vimeo.com" && /^\/\d+/.test(u.pathname)) return { kind: "vimeo", src: "https://player.vimeo.com/video/" + u.pathname.split("/")[1] };
    if (h === "loom.com" && /^\/share\/[\w]+/.test(u.pathname)) return { kind: "loom", src: "https://www.loom.com/embed/" + u.pathname.split("/")[2] };
    if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { kind: "file", src: u.href };
    return null;
  }
  function fileSrc(v) { return /^https:\/\//i.test(v) || /^\/?assets\//.test(v) ? (v.startsWith("assets/") ? "/" + v : v) : null; }
  function player(v, title) {
    if (!v) return "";
    const e = embed(v) || (fileSrc(v) ? { kind: "file", src: fileSrc(v) } : null);
    if (!e) return "";
    return e.kind === "file"
      ? `<div class="vh-player"><video src="${esc(e.src)}" controls playsinline preload="metadata"></video></div>`
      : `<div class="vh-player"><iframe src="${esc(e.src)}" title="${esc(title || "Demo video")}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  }
  window.VHMedia = { embed, player, realImg };

  const shots = p => (p.screenshots || []).filter(realImg);

  // ---------- product page ----------
  const origProduct = App.renderProduct.bind(App);
  App.renderProduct = function (el, id) {
    origProduct(el, id);
    const p = PRODUCTS.find(x => x.id === id); if (!p) return;
    const hero = el.querySelector(".detail-hero"); if (!hero) return;
    const ss = shots(p), pv = player(p.video, p.name + " demo");
    let html = "";
    if (pv) html += `<div class="vh-media"><h3>Demo video</h3>${pv}</div>`;
    if (ss.length) html += `<div class="vh-media"><h3>Screenshots</h3><div class="vh-gallery">${ss.map((s, i) => `<img src="${esc(s)}" alt="${esc(p.name)} screenshot ${i + 1}" loading="lazy" data-i="${i}">`).join("")}</div></div>`;
    const facts = [
      p.price && ["Pricing", p.price + (p.pricingDetails ? " — " + p.pricingDetails : "")],
      (p.inputs || []).length && ["Supported inputs", p.inputs.join(", ")],
      p.version && ["Latest version", p.version + (p.releaseNotes ? " · " + p.releaseNotes : "")],
      p.github && ["Source", `<a href="${esc(p.github)}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">${esc(p.github.replace(/^https:\/\//, ""))}</a>`]
    ].filter(Boolean);
    const factsHtml = facts.length ? `<div class="card"><h3>Details</h3><dl class="vh-facts">${facts.map(f => `<dt>${f[0]}</dt><dd>${f[0] === "Source" ? f[1] : esc(f[1])}</dd>`).join("")}</dl></div>` : "";
    hero.insertAdjacentHTML("afterend", html);
    const left = el.querySelector(".detail-grid > div"); if (left && factsHtml) left.insertAdjacentHTML("afterbegin", factsHtml);
    el.querySelectorAll(".vh-gallery img").forEach(img => img.onclick = () => App.openMediaModal("image", img.src, p.name));
    // the maker's video is already inline, so the extra "Watch demo" button would only repeat it
    if (pv) el.querySelector("#btnVideo")?.remove();
  };

  // ---------- cards ----------
  const origCards = App.renderProductCards.bind(App);
  App.renderProductCards = function (container, list) {
    origCards(container, list);
    if (!container || !list || !list.length) return;
    container.querySelectorAll(".product-card").forEach((card, i) => {
      const p = list[i]; if (!p) return;
      const ss = shots(p), e = p.video ? embed(p.video) : null;
      let media = "";
      if (ss[0]) media = `<img src="${esc(ss[0])}" alt="${esc(p.name)} preview" loading="lazy">`;
      else if (e && e.thumb) media = `<img src="${esc(e.thumb)}" alt="${esc(p.name)} video" loading="lazy">`;
      else if (p.video && fileSrc(p.video)) media = `<video src="${esc(e && e.kind === "file" ? e.src : fileSrc(p.video))}#t=0.5" muted preload="metadata" playsinline></video>`;
      if (media) card.insertAdjacentHTML("afterbegin", `<div class="pc-media">${media}${p.video ? '<span class="pc-play">▶ Demo</span>' : ""}</div>`);
      const tags = (p.features || []).slice(0, 4);
      const price = p.price ? `<div class="pc-price">${esc(p.price)}</div>` : "";
      const desc = card.querySelector(".product-desc");
      if (desc) desc.insertAdjacentHTML("afterend", (tags.length ? `<div class="pc-tags">${tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : "") + price);
    });
  };
})();

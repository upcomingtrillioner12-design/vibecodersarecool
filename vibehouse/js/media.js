// ============================================================
// Vibehouse Media — real video + screenshots on product pages.
// ============================================================
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const realImg = u => typeof u === "string" && (/^https:\/\//i.test(u) || /^data:image\//i.test(u));

  // YouTube / Vimeo / Loom / direct file
  function embed(url) {
    let u;
    try { u = new URL(String(url || "").trim()); } catch (e) { return null; }
    if (u.protocol !== "https:") return null;
    const h = u.hostname.replace(/^www\./, "");
    let m;
    if (h === "youtu.be") m = u.pathname.slice(1);
    else if (h === "youtube.com" || h === "m.youtube.com")
      m = u.searchParams.get("v") || (u.pathname.match(/^\/(?:embed|shorts)\/([\w-]{6,})/) || [])[1];
    if (m && /^[\w-]{6,15}$/.test(m))
      return { kind: "yt", src: "https://www.youtube-nocookie.com/embed/" + m };
    if (h === "vimeo.com" && /^\/\d+/.test(u.pathname))
      return { kind: "vimeo", src: "https://player.vimeo.com/video/" + u.pathname.split("/")[1] };
    if (h === "loom.com" && /^\/share\/[\w]+/.test(u.pathname))
      return { kind: "loom", src: "https://www.loom.com/embed/" + u.pathname.split("/")[2] };
    if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname))
      return { kind: "file", src: u.href };
    return null;
  }

  function player(v, title) {
    if (!v) return "";
    const e = embed(v);
    if (!e) return "";
    return e.kind === "file"
      ? `<div class="vh-player"><video src="${esc(e.src)}" controls playsinline preload="metadata"></video></div>`
      : `<div class="vh-player"><iframe src="${esc(e.src)}" title="${esc(title || "Demo video")}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  }

  window.VHMedia = { embed, player, realImg };

  // Extend App.renderProduct to inject media after the hero
  const origProduct = window.App.renderProduct.bind(window.App);
  window.App.renderProduct = function (el, id) {
    origProduct(el, id);
    const p = window.Store.findProduct(id) || (window.PRODUCTS || []).find(x => x.id === id);
    if (!p) return;
    const hero = el.querySelector(".detail-hero");
    if (!hero) return;

    const ss = (p.screenshots || []).filter(realImg);
    const pv = player(p.video, p.name + " demo");

    let html = "";
    if (pv) html += `<div class="vh-media"><h3>Demo video</h3>${pv}</div>`;
    if (ss.length) html += `<div class="vh-media"><h3>Screenshots</h3><div class="vh-gallery">${ss.map((s, i) => `<img src="${esc(s)}" alt="${esc(p.name)} screenshot ${i + 1}" loading="lazy" data-i="${i}">`).join("")}</div></div>`;
    hero.insertAdjacentHTML("afterend", html);

    // Facts card (only real data)
    const facts = [
      p.price && ["Pricing", p.price],
      p.version && ["Version", p.version],
      p.github && ["Source", `<a href="${esc(p.github)}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">${esc(p.github.replace(/^https:\/\//, ""))}</a>`]
    ].filter(Boolean);
    if (facts.length) {
      const left = el.querySelector(".detail-grid > div");
      if (left) left.insertAdjacentHTML("afterbegin",
        `<div class="card"><h3>Details</h3><dl class="vh-facts">${facts.map(f => `<dt>${f[0]}</dt><dd>${f[0] === "Source" ? f[1] : esc(f[1])}</dd>`).join("")}</dl></div>`);
    }

    el.querySelectorAll(".vh-gallery img").forEach(img => {
      img.onclick = () => window.App.openMediaModal("image", img.src, p.name);
    });
    // Remove redundant "Watch demo" button if the video is already inline
    if (pv) el.querySelector("#btnVideo")?.remove();
  };
})();

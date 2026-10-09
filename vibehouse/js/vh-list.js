// ============================================================
// Vibehouse List – clean one-line product rows everywhere
// ============================================================
(function () {
  const css = `
  .vh-rows{display:flex !important;flex-direction:column;gap:0;grid-template-columns:none !important;
    border:1px solid rgba(255,255,255,.07);border-radius:14px;overflow:hidden;background:rgba(255,255,255,.015)}
  .vh-row{display:grid;grid-template-columns:52px minmax(0,1fr) 190px 190px 78px;align-items:center;gap:16px;
    padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.07);cursor:pointer;transition:background .15s;min-height:64px}
  .vh-row:last-child{border-bottom:0}
  .vh-row:hover{background:rgba(255,255,255,.045)}
  .vh-row .vr-logo{width:44px;height:44px}
  .vh-row .vr-logo .product-logo{width:44px;height:44px;border-radius:12px;font-size:15px;margin:0}
  .vh-row .vr-logo .product-logo img{width:100%;height:100%;object-fit:cover;border-radius:inherit}
  .vh-row .vr-main{min-width:0}
  .vh-row .vr-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
  .vh-row .vr-name{font-weight:700;font-size:15px;color:var(--text,#f2f3f7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vh-row .vr-chip{font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.14);
    background:rgba(255,255,255,.06);color:var(--text-muted,#a9adbb);white-space:nowrap}
  .vh-row .vr-chip.demo{color:#a29bfe;border-color:rgba(162,155,254,.35)}
  .vh-row .vr-desc{margin:3px 0 0;font-size:13px;line-height:1.35;color:var(--text-muted,#a9adbb);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vh-row .vr-cat{justify-self:start;max-width:100%;display:inline-flex;align-items:center;font-size:13px;font-weight:600;
    padding:7px 14px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);
    color:var(--text,#f2f3f7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vh-row .vr-owner{display:flex;align-items:center;gap:10px;min-width:0}
  .vh-row .vr-owner .owner-avatar{flex:none;width:32px;height:32px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px}
  .vh-row .vr-owner .owner-avatar img{width:100%;height:100%;object-fit:cover}
  .vh-row .vr-owner-name{font-size:13px;font-weight:700;color:var(--text,#f2f3f7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vh-row .vr-price{justify-self:end;font-size:13px;font-weight:700;color:var(--text,#f2f3f7);white-space:nowrap}
  .vh-row .vr-price.free{color:#55efc4}
  @media (max-width:900px){
    .vh-row{grid-template-columns:48px minmax(0,1fr) auto;gap:12px;padding:12px 14px}
    .vh-row .vr-cat,.vh-row .vr-owner{display:none}
  }`;

  if (!document.getElementById("vh-list-css")) {
    const st = document.createElement("style");
    st.id = "vh-list-css";
    st.textContent = css;
    document.head.appendChild(st);
  }

  // Consistent owner avatar: real photo if uploaded, otherwise a letter
  // avatar whose color is the same for every product by the same owner.
  App.ownerAvatarHtml = function (p, size = 32) {
    const s = size || 32;
    if (p.ownerAvatarUrl) {
      return `<div class="owner-avatar" style="width:${s}px;height:${s}px">
        <img src="${App.esc(p.ownerAvatarUrl)}" alt="${App.esc(p.owner || "")}" loading="lazy">
      </div>`;
    }
    const color = p.ownerColor ||
      (window.IconEngine ? IconEngine.colorFrom((p.ownerId || p.id) + "o") : "#7c6cf0");
    const letter = String(p.owner || "?").charAt(0).toUpperCase();
    return `<div class="owner-avatar" style="width:${s}px;height:${s}px;background:${color}">${App.esc(letter)}</div>`;
  };

  App._renderProductCards = function (container, list) {
    if (!container) return;
    if (!list || !list.length) {
      container.classList.remove("vh-rows");
      container.innerHTML = `<div class="empty"><h3>No tools match</h3><p>Try a different filter.</p></div>`;
      return;
    }
    container.classList.add("vh-rows");
    container.innerHTML = list.map(p => {
      const free = Number(p.priceValue) === 0;
      const price = free ? "Free" : (p.price || "");
      const cat = p.category || p.type || "";
      return `
        <article class="vh-row" data-go="/ai/${App.esc(encodeURIComponent(p.id))}">
          <div class="vr-logo">${App.productLogoHtml(p)}</div>
          <div class="vr-main">
            <div class="vr-title">
              <span class="vr-name">${App.esc(p.name)}</span>
              ${p.type ? `<span class="vr-chip">${App.esc(p.type)}</span>` : ""}
              ${p.video ? `<span class="vr-chip demo">▶ Demo</span>` : ""}
            </div>
            <p class="vr-desc">${App.esc(p.desc)}</p>
          </div>
          <div class="vr-cat">${App.esc(cat)}</div>
          <div class="vr-owner">
            ${App.ownerAvatarHtml(p, 32)}
            <span class="vr-owner-name">${App.esc(p.owner)}</span>
          </div>
          <div class="vr-price ${free ? "free" : ""}">${App.esc(price)}</div>
        </article>`;
    }).join("");
  };

  // Override the main renderer
  App.renderProductCards = App._renderProductCards;
})();

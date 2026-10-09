// ============================================================
// Vibehouse Icon Engine – pure SVG fallbacks
// ============================================================
const IconEngine = {
  _esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  },

  colorFrom(str, palette) {
    const colors = palette || [
      "#6c5ce7", "#00b894", "#0984e3", "#e17055", "#fd79a8",
      "#00cec9", "#fdcb6e", "#a29bfe", "#55efc4", "#74b9ff",
      "#ff7675", "#ffeaa7", "#81ecec", "#fab1a0"
    ];
    let h = 0;
    const s = String(str || "x");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return colors[h % colors.length];
  },

  mono(name) {
    const w = String(name || "?").trim().split(/\s+/);
    const a = (w[0] && w[0][0]) || "?";
    const b = w[1] ? w[1][0] : ((w[0] && w[0][1]) || "");
    return (a + b).toUpperCase();
  },

  _hash(str) {
    let h = 0;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  },

  _validColor(c) {
    return /^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : null;
  },

  shade(hex, percent) {
    if (!this._validColor(hex)) return "#444444";
    const n = parseInt(hex.replace("#", ""), 16);
    let r = (n >> 16) + percent;
    let g = ((n >> 8) & 0xff) + percent;
    let b = (n & 0xff) + percent;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  },

  productSvg(name, bg) {
    const mono = this._esc(this.mono(name));
    const color = this._validColor(bg) || this.colorFrom(name);
    const gid = "g" + String(name || "x").replace(/\W/g, "").slice(0, 12) + Math.abs(this._hash(name));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${color}"/>
          <stop offset="100%" stop-color="${this.shade(color, -25)}"/>
        </linearGradient>
      </defs>
      <circle cx="64" cy="64" r="64" fill="url(#${gid})"/>
      <text x="64" y="76" text-anchor="middle" font-family="system-ui,Archivo,sans-serif"
            font-weight="800" font-size="${mono.length > 1 ? 40 : 48}" fill="#fff">${mono}</text>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  },

  avatarSvg(name, bg) {
    const letter = this._esc(String(name || "?").trim()[0] || "?").toUpperCase();
    const color = this._validColor(bg) || this.colorFrom(name + "avatar");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <circle cx="64" cy="64" r="64" fill="${color}"/>
      <text x="64" y="76" text-anchor="middle" font-family="system-ui,Archivo,sans-serif"
            font-weight="700" font-size="52" fill="#fff">${letter}</text>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  },

  productLogo(p) {
    if (p.logoUrl) return p.logoUrl;
    return this.productSvg(p.name, p.logoColor);
  },

  ownerAvatar(p) {
    if (p.ownerAvatarUrl) return p.ownerAvatarUrl;
    return this.avatarSvg(p.owner, p.ownerColor);
  },

  userPhoto(user) {
    return user?.photo || null;
  },

  async fileToDataUrl(file, maxSize = 400) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("Not an image"));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Read failed"));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let w = img.width, h = img.height;
          const maxDim = 512;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          let quality = 0.85;
          let dataUrl = canvas.toDataURL("image/jpeg", quality);
          while (dataUrl.length > maxSize * 1024 && quality > 0.4) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL("image/jpeg", quality);
          }
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error("Invalid image"));
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
};

// ============================================================
// Vibehouse Profile — edit form + username handling.
// Extends App.renderProfile. Must load before app.js's DOMContentLoaded.
// ============================================================
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const RESERVED = ["me","admin","root","support","vibehouse","launch","search","deals","tasks","prompts","map","api","help","contact","dashboard","profile"];

  function validate(f) {
    if (f.name.length < 2 || f.name.length > 40) return "Name must be 2–40 characters.";
    if (f.username && !/^[a-z0-9_]{3,20}$/.test(f.username)) return "Username: 3–20 chars, a-z, 0-9 or _.";
    if (f.username && RESERVED.includes(f.username)) return "That username is reserved.";
    if ((f.headline || "").length > 60) return "Headline is max 60 characters.";
    if ((f.bio || "").length > 280) return "Bio is max 280 characters.";
    if (f.website && !/^https:\/\//.test(f.website)) return "Website must start with https://";
    if (f.twitter && !/^[A-Za-z0-9_]{1,15}$/.test(f.twitter.replace(/^@/, ""))) return "X handle is invalid.";
    return "";
  }

  const origProfile = App.renderProfile.bind(App);
  App.renderProfile = async function (el, id) {
    await origProfile(el, id);

    const isMe = id === "me";
    if (!isMe || !this.user) return;

    const head = el.querySelector(".profile-header");
    if (!head) return;

    // Insert "Edit profile" button after the stats
    const stats = el.querySelector(".profile-stats");
    if (stats && !el.querySelector("#vhEditProfileBtn")) {
      stats.insertAdjacentHTML("afterend",
        `<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" id="vhEditProfileBtn">Edit profile</button></div><div id="vhProfileEdit"></div>`);
      document.getElementById("vhEditProfileBtn").onclick = () => openEditForm(this.user);
    }
  };

  function openEditForm(u) {
    const box = document.getElementById("vhProfileEdit");
    if (!box) return;
    if (box.innerHTML.trim()) { box.innerHTML = ""; return; }
    box.innerHTML = `
      <form class="card" id="pf" style="max-width:560px" novalidate>
        <div class="field"><label>Display name</label><input id="pName" maxlength="40" value="${esc(u.name)}"></div>
        <div class="field"><label>Username</label><input id="pUser" maxlength="20" value="${esc(u.username || "")}" placeholder="yourname"><small style="color:var(--text-muted)">Shown publicly as @username</small></div>
        <div class="field"><label>Headline</label><input id="pHead" maxlength="60" value="${esc(u.headline || "")}" placeholder="e.g. Indie maker building AI tools"></div>
        <div class="field"><label>Bio</label><textarea id="pBio" rows="3" maxlength="280">${esc(u.bio || "")}</textarea></div>
        <div class="field"><label>Website (https)</label><input id="pWeb" type="url" value="${esc(u.website || "")}" placeholder="https://"></div>
        <div class="field"><label>X / Twitter</label><input id="pTw" maxlength="16" value="${esc(u.twitter || "")}" placeholder="@handle"></div>
        <p class="vh-note" id="pOut" style="color:var(--text-muted)"></p>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" type="submit">Save</button>
          <button class="btn btn-ghost btn-sm" type="button" id="pCancel">Cancel</button>
        </div>
      </form>`;

    document.getElementById("pCancel").onclick = () => { box.innerHTML = ""; };
    document.getElementById("pf").onsubmit = async e => {
      e.preventDefault();
      const out = document.getElementById("pOut");
      out.style.color = "var(--text-muted)";
      out.textContent = "Saving...";

      const v = id => document.getElementById(id).value.trim();
      const f = {
        name: v("pName"),
        username: v("pUser").toLowerCase().replace(/^@/, ""),
        headline: v("pHead"),
        bio: v("pBio"),
        website: v("pWeb"),
        twitter: v("pTw").replace(/^@/, "")
      };
      const err = validate(f);
      if (err) { out.style.color = "var(--danger)"; out.textContent = err; return; }

      const fields = {
        full_name: f.name,
        username: f.username || null,
        headline: f.headline || null,
        bio: f.bio || null,
        website: f.website || null,
        twitter: f.twitter || null,
        avatar_letter: f.name[0].toUpperCase()
      };

      const res = await window.VibeBackend.updateProfile(App.user.id, fields);
      if (!res.ok) {
        out.style.color = "var(--danger)";
        out.textContent = /23505/.test(res.error) ? "That username is taken." : res.error;
        return;
      }

      // Update local cached user
      Object.assign(App.user, {
        name: f.name, username: f.username, headline: f.headline, bio: f.bio,
        website: f.website, twitter: f.twitter, avatar: f.name[0].toUpperCase()
      });
      App.saveUser();
      App.updateUserChip();
      App.toast("Profile saved", "success");
      App.renderProfile(document.getElementById("content"), "me");
    };
  }
})();

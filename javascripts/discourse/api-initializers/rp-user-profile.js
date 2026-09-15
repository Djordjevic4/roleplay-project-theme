import { apiInitializer } from "discourse/lib/api";
import { countUserActions, escapeHtml, fetchJSON, relativeTime } from "../lib/rp-category-cards";

// ---------------------------------------------------------------
// User profile page (IPB-style): cover header with an overlapping
// avatar, plus a left sidebar (Trust Level / Badges / Stats) beside
// the native tabs + activity content. Confirmed via a live install's
// DOM dump — real classes used throughout, no guessing:
//   section.collapsed-info.about[.has-background]
//     div.details > div.primary
//       div.user-profile-avatar (img.avatar, div.avatar-flair)
//       div.primary-textual (div.user-profile-names, .full-name, .bio)
//       section.controls (Admin button, Expand toggle)
//   div.new-user-wrapper
//     section.user-navigation.user-navigation-primary (the tabs)
//     div.new-user-content-wrapper > div.user-content
//
// IPB-only concepts that don't exist in Discourse (Warning Points,
// numeric Reputation, Followers) are intentionally NOT recreated with
// fake numbers — Trust Level (a real Discourse concept) stands in for
// "rank", Likes Received stands in for "reputation", and there's no
// Followers card at all since Discourse has no social-follow system.
// Every number here comes from a real fetch; a failed lookup leaves
// that card empty rather than showing a made-up value.
// ---------------------------------------------------------------

const TRUST_LEVEL_NAMES = ["New", "Basic", "Member", "Regular", "Leader"];

function usernameFromUrl() {
  const match = window.location.pathname.match(/^\/u\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Same sprite-reference technique used everywhere else in this theme
// (rp-category-cards.js, rp-post-layout.js) — no icon library import.
function iconSvg(name) {
  return `<svg class="fa d-icon d-icon-${escapeHtml(name)} svg-icon fa-width-auto svg-string" width="1em" height="1em" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><use href="#${escapeHtml(name)}"></use></svg>`;
}

const profileDataCache = new Map();

function fetchProfileData(username) {
  if (profileDataCache.has(username)) {
    return profileDataCache.get(username);
  }
  const promise = Promise.all([
    fetchJSON(`/u/${encodeURIComponent(username)}.json`).catch(() => null),
    fetchJSON(`/user-badges/${encodeURIComponent(username)}.json`).catch(() => null),
    fetchJSON(`/u/${encodeURIComponent(username)}/summary.json`).catch(() => null),
    countUserActions(username, "4,5"),
    countUserActions(username, "4"),
    countUserActions(username, "2"),
    countUserActions(username, "1"),
  ]).then(([userRes, badgesRes, summaryRes, postCount, topicCount, likesReceived, likesGiven]) => ({
    user: userRes?.user || null,
    badges: badgesRes?.badges || [],
    daysVisited: summaryRes?.user_summary?.days_visited ?? null,
    postCount,
    topicCount,
    likesReceived,
    likesGiven,
  }));
  profileDataCache.set(username, promise);
  return promise;
}

function buildQuickInfoHtml(user) {
  if (!user) {
    return "";
  }
  const parts = [];
  if (user.created_at) {
    const joined = new Date(user.created_at).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    parts.push(`<span>Joined <strong>${escapeHtml(joined)}</strong></span>`);
  }
  if (user.last_seen_at) {
    parts.push(`<span>Last seen <strong>${escapeHtml(relativeTime(user.last_seen_at))}</strong></span>`);
  }
  return parts.length ? `<div class="rp-profile-quickinfo">${parts.join("")}</div>` : "";
}

function badgeImageHtml(badge) {
  if (badge.image_url) {
    return `<img src="${escapeHtml(badge.image_url)}" alt="${escapeHtml(badge.name)}" loading="lazy">`;
  }
  const icon = (badge.icon || "certificate").replace(/^fa[srb]?-/, "");
  return iconSvg(icon);
}

function sidebarHtml(data, username) {
  const level = data.user?.trust_level ?? 0;
  const levelName = TRUST_LEVEL_NAMES[level] ?? "New";
  const dots = [0, 1, 2, 3, 4]
    .map((i) => `<span class="rp-trust-dot${i <= level ? " filled" : ""}"></span>`)
    .join("");

  const badgeItems = (data.badges || [])
    .slice(0, 8)
    .map(
      (b) =>
        `<a class="rp-badge-item" href="/badges/${b.id}/${escapeHtml(b.slug || "")}" title="${escapeHtml(b.description || b.name || "")}">${badgeImageHtml(b)}</a>`
    )
    .join("");

  const statRows = [
    ["Posts", data.postCount],
    ["Topics", data.topicCount],
    ["Likes Received", data.likesReceived],
    ["Likes Given", data.likesGiven],
    ["Days Visited", data.daysVisited],
  ]
    .filter(([, value]) => value != null)
    .map(
      ([label, value]) =>
        `<li><span class="rp-profile-stat-label">${escapeHtml(label)}</span><span class="rp-profile-stat-value">${value}</span></li>`
    )
    .join("");

  return `
    <div class="rp-profile-card rp-profile-trust">
      <div class="rp-profile-card-title">Trust Level</div>
      <div class="rp-trust-name">${escapeHtml(levelName)}</div>
      <div class="rp-trust-dots">${dots}</div>
    </div>
    <div class="rp-profile-card rp-profile-badges">
      <div class="rp-profile-card-title">Badges <a class="rp-profile-card-link" href="/u/${escapeHtml(username)}/badges">View all</a></div>
      <div class="rp-badge-list">${badgeItems || '<div class="rp-profile-empty">No badges yet</div>'}</div>
    </div>
    <div class="rp-profile-card rp-profile-stats">
      <div class="rp-profile-card-title">Stats</div>
      <ul class="rp-profile-stat-list">${statRows || '<li class="rp-profile-empty">No stats yet</li>'}</ul>
    </div>
  `;
}

export default apiInitializer((api) => {
  let renderToken = 0;

  function isProfileRoute() {
    return /^\/u\/[^/]+/.test(window.location.pathname);
  }

  // Discourse's own two siblings (the tabs nav + the tab content) live
  // directly inside .new-user-wrapper — turning that into the 2-column
  // grid and inserting our sidebar as a new first child, wrapping the
  // two original children together so they become the right column,
  // keeps every native tab/route working exactly as before.
  function ensureLayout() {
    const wrapper = document.querySelector(".new-user-wrapper");
    if (!wrapper) {
      return null;
    }
    const existing = wrapper.querySelector(":scope > .rp-profile-sidebar");
    if (existing) {
      return existing;
    }
    const sidebar = document.createElement("div");
    sidebar.className = "rp-profile-sidebar";
    const main = document.createElement("div");
    main.className = "rp-profile-main";
    [...wrapper.children].forEach((child) => main.appendChild(child));
    wrapper.appendChild(sidebar);
    wrapper.appendChild(main);
    return sidebar;
  }

  // Moves the real Admin/Expand controls out from beside the avatar so
  // they can be pinned to the cover's top-right corner independently
  // of the avatar row's own positioning (see common.scss) — a real
  // native element, just relocated, not rebuilt.
  function restructureHeader() {
    const about = document.querySelector(".collapsed-info.about");
    if (!about || about.dataset.rpProfileHeader) {
      return;
    }
    about.dataset.rpProfileHeader = "true";
    const controls = about.querySelector(".primary > .controls");
    if (controls && controls.parentElement !== about) {
      about.appendChild(controls);
    }
  }

  function addQuickInfo(username) {
    const textual = document.querySelector(".collapsed-info.about .primary-textual");
    if (!textual || textual.querySelector(".rp-profile-quickinfo")) {
      return;
    }
    fetchProfileData(username).then((data) => {
      if (!textual.isConnected || textual.querySelector(".rp-profile-quickinfo")) {
        return;
      }
      const html = buildQuickInfoHtml(data.user);
      if (html) {
        textual.insertAdjacentHTML("beforeend", html);
      }
    });
  }

  function populateSidebar(sidebar, username) {
    if (!sidebar || sidebar.dataset.rpUsername === username) {
      return;
    }
    sidebar.dataset.rpUsername = username;
    sidebar.innerHTML = `<div class="rp-profile-card rp-profile-loading">Loading…</div>`;
    const myToken = ++renderToken;
    fetchProfileData(username)
      .then((data) => {
        if (myToken !== renderToken || sidebar.dataset.rpUsername !== username || !sidebar.isConnected) {
          return;
        }
        sidebar.innerHTML = sidebarHtml(data, username);
      })
      .catch(() => {
        if (sidebar.isConnected) {
          sidebar.innerHTML = "";
        }
      });
  }

  function render() {
    if (!isProfileRoute()) {
      return;
    }
    const username = usernameFromUrl();
    if (!username) {
      return;
    }
    restructureHeader();
    addQuickInfo(username);
    populateSidebar(ensureLayout(), username);
  }

  api.onPageChange(() => {
    setTimeout(render, 80);
  });

  // The tabs/content wrapper can still be mounting after onPageChange
  // fires (async route model), so react to DOM changes too — same
  // debounced-MutationObserver pattern used for the post-stream layout
  // in rp-post-layout.js.
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
});

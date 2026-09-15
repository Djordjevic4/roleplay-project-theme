import { apiInitializer } from "discourse/lib/api";
import { countUserActions, escapeHtml, fetchJSON, relativeTime } from "../lib/rp-category-cards";

// ---------------------------------------------------------------
// User profile page (IPB-style): cover header with an overlapping
// avatar, plus a left sidebar (Trust Level / About / Badges / Stats)
// beside the native tabs + activity content. Confirmed via a live
// install's DOM dump — real classes used throughout, no guessing:
//   section.about[.collapsed-info][.has-background]
//     div.details > div.primary
//       div.user-profile-avatar (img.avatar, div.avatar-flair)
//       div.primary-textual (div.user-profile-names, .full-name, .bio)
//       div.secondary (Joined/Last Post/Seen/Trust Level/Email/Groups —
//         only present once "Expand" is clicked)
//       section.controls (Admin button, Expand toggle)
//   div.new-user-wrapper
//     section.user-navigation.user-navigation-primary (the tabs)
//     div.new-user-content-wrapper > div.user-content
//
// Confirmed live: clicking "Expand" removes the "collapsed-info" class
// from section.about (and re-renders .primary, recreating .controls
// inside it) — every selector here targets plain section.about rather
// than section.collapsed-info.about, and restructureHeader()/
// relocateBio() re-check and re-move their elements on every render()
// call instead of running once, so both states keep working.
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

// "head_administrator" -> "Head Administrator" — same technique used
// for the per-post group title in rp-post-layout.js, deliberately
// reading the user's real primary_group_name (a group slug) rather
// than user_title, which is free text an admin can set to anything.
function humanizeGroupName(slug) {
  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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
  const groupName = data.user?.primary_group_name ? humanizeGroupName(data.user.primary_group_name) : "";
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
    <div class="rp-profile-card rp-profile-group"${groupName ? "" : " hidden"}>
      <div class="rp-profile-card-title">Group</div>
      <div class="rp-profile-group-body">
        <span class="rp-profile-group-icon"></span>
        <span class="rp-profile-group-name">${escapeHtml(groupName)}</span>
      </div>
    </div>
    <div class="rp-profile-card rp-profile-trust">
      <div class="rp-profile-card-title">Trust Level</div>
      <div class="rp-trust-name">${escapeHtml(levelName)}</div>
      <div class="rp-trust-dots">${dots}</div>
    </div>
    <div class="rp-profile-card rp-profile-about" hidden>
      <div class="rp-profile-card-title">About</div>
      <div class="rp-profile-about-body"></div>
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
  // native element, just relocated, not rebuilt. Discourse re-renders
  // .primary (and recreates a fresh .controls inside it) when the
  // native "Expand" toggle is clicked, undoing this move — so there's
  // no one-time "already done" guard here; the parentElement check
  // already makes this a no-op once nothing needs moving, so it's
  // cheap to just re-check on every render() call.
  function restructureHeader() {
    const about = document.querySelector("section.about");
    if (!about) {
      return;
    }
    const controls = about.querySelector(".primary > .controls");
    if (controls && controls.parentElement !== about) {
      about.appendChild(controls);
    }
  }

  function addQuickInfo(username) {
    const textual = document.querySelector("section.about .primary-textual");
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

  // The real .bio element (not a text copy, so any links/formatting in
  // it keep working) gets physically moved into the sidebar's About
  // card. Discourse can recreate .primary-textual (and with it, a
  // fresh .bio) on route/expand changes, so — like restructureHeader —
  // this just re-checks and re-moves each render() call instead of
  // running once.
  function relocateBio(sidebar) {
    const slot = sidebar?.querySelector(".rp-profile-about-body");
    if (!slot) {
      return;
    }
    const bio = document.querySelector("section.about .bio");
    const hasText = bio && bio.textContent.trim().length > 0;
    if (hasText && bio.parentElement !== slot) {
      slot.innerHTML = "";
      slot.appendChild(bio);
    }
    const card = sidebar.querySelector(".rp-profile-about");
    if (card) {
      card.hidden = !slot.textContent.trim().length;
    }
  }

  // The real .avatar-flair element (the group icon Discourse already
  // renders on the avatar) is moved — not cloned — into the new Group
  // card above Trust Level, per request: keep the real icon, just show
  // it there instead of overlapping the avatar. Re-checked every
  // render() call for the same reason as relocateBio/restructureHeader
  // (Expand can recreate the avatar).
  function relocateGroupFlair(sidebar) {
    const slot = sidebar?.querySelector(".rp-profile-group-icon");
    if (!slot) {
      return;
    }
    const flair = document.querySelector(".user-profile-avatar .avatar-flair");
    if (flair && flair.parentElement !== slot) {
      slot.innerHTML = "";
      slot.appendChild(flair);
    }
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
    const sidebar = ensureLayout();
    populateSidebar(sidebar, username);
    relocateBio(sidebar);
    relocateGroupFlair(sidebar);
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

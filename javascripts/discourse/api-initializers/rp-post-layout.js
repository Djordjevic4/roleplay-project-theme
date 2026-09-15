import { apiInitializer } from "discourse/lib/api";

// ---------------------------------------------------------------
// Classic forum post layout (Invision/XenForo-style left user panel).
//
// Discourse's own post-stream markup already separates the avatar
// column (.topic-avatar) from the post content (.topic-body) as
// siblings — this reparents the REAL username/title elements (not a
// text copy) into the avatar column so hover-card/profile-link
// behavior stays fully intact, and adds real per-poster stats fetched
// from Discourse's own /u/{username}/summary.json endpoint. Nothing
// here is fabricated: if a lookup fails, that poster's stats are
// simply left blank rather than showing a fake number.
// ---------------------------------------------------------------

// Same technique used for category badges in rp-category-cards.js:
// reference the icon sprite Discourse already loads on every page,
// rather than importing an icon-library module.
function iconSvg(name) {
  return `<svg class="fa d-icon d-icon-${name} svg-icon fa-width-auto svg-string rp-post-stat-icon" width="1em" height="1em" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><use href="#${name}"></use></svg>`;
}

const statsCache = new Map();

function fetchUserStats(username) {
  if (statsCache.has(username)) {
    return statsCache.get(username);
  }
  const promise = fetch(`/u/${encodeURIComponent(username)}/summary.json`, {
    headers: { Accept: "application/json" },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const summary = d?.user_summary;
      if (!summary) {
        return null;
      }
      return {
        postCount: summary.post_count ?? null,
        likesReceived: summary.likes_received ?? null,
      };
    })
    .catch(() => null);
  statsCache.set(username, promise);
  return promise;
}

function enhancePost(article) {
  if (article.dataset.rpPostEnhanced) {
    return;
  }
  const avatarCol = article.querySelector(".topic-avatar");
  const namesEl = article.querySelector(".names");
  if (!avatarCol || !namesEl) {
    return;
  }
  article.dataset.rpPostEnhanced = "true";

  const wrap = document.createElement("div");
  wrap.className = "rp-post-user-info";

  // Move the real elements (not a text clone) so username-click /
  // hover-card behavior keeps working exactly as before.
  wrap.appendChild(namesEl);
  const titleEl = article.querySelector(".user-title");
  if (titleEl) {
    wrap.appendChild(titleEl);
  }

  const statsEl = document.createElement("div");
  statsEl.className = "rp-post-user-stats";
  wrap.appendChild(statsEl);

  avatarCol.appendChild(wrap);

  // Move the "..." (show more actions) trigger up into the top bar
  // next to the post date — it normally lives in the bottom action
  // bar, and a pure-CSS reorder can't relocate an element into a
  // different parent. Best-effort across a few possible class names
  // since this wasn't confirmed against a live DOM dump; a silent
  // no-op if none match, so nothing breaks either way. Note: clicking
  // it still reveals the extra actions it normally would, just in
  // their original spot at the bottom — only the trigger button moves.
  const postInfos = article.querySelector(".post-infos");
  const moreActionsBtn = article.querySelector(
    ".show-more-actions, .post-action-menu__show-more, .double-button .show-more, .post-menu-area .show-more"
  );
  if (postInfos && moreActionsBtn) {
    let actionsSlot = postInfos.querySelector(".rp-post-topbar-actions");
    if (!actionsSlot) {
      actionsSlot = document.createElement("span");
      actionsSlot.className = "rp-post-topbar-actions";
      postInfos.appendChild(actionsSlot);
    }
    actionsSlot.appendChild(moreActionsBtn);
  }

  const username = namesEl.querySelector("a")?.textContent?.trim();
  if (!username) {
    return;
  }
  fetchUserStats(username).then((stats) => {
    if (!stats || statsEl.isConnected === false) {
      return;
    }
    const parts = [];
    if (stats.postCount != null) {
      parts.push(
        `<div class="rp-post-stat">${iconSvg("message")}<span class="rp-post-stat-value">${stats.postCount}</span> posts</div>`
      );
    }
    if (stats.likesReceived != null) {
      parts.push(
        `<div class="rp-post-stat">${iconSvg("heart")}<span class="rp-post-stat-value">${stats.likesReceived}</span> likes</div>`
      );
    }
    statsEl.innerHTML = parts.join("");
  });
}

export default apiInitializer((api) => {
  function enhanceAll() {
    document.querySelectorAll(".topic-post").forEach(enhancePost);
  }

  api.onPageChange(() => {
    setTimeout(enhanceAll, 120);
  });

  // Posts stream in progressively while scrolling a long topic, so
  // react to DOM changes too, not just full page changes.
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(enhanceAll, 100);
  });
  observer.observe(document.body, { childList: true, subtree: true });
});

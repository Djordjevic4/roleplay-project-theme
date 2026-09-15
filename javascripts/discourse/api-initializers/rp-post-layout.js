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

// "head_administrator" -> "Head Administrator"
function humanizeGroupName(slug) {
  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function currentTopicIdFromUrl() {
  const match = window.location.pathname.match(/^\/t\/[^/]+\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// Confirmed via a live install's /t/{id}.json response: each post in
// post_stream carries the poster's real primary_group_name (a group
// slug, e.g. "head_administrator") — deliberately used instead of
// user_title, which is free-text an admin can set to anything and
// isn't necessarily tied to the user's actual group membership.
const groupNameCache = new Map();

function fetchTopicGroupNames(topicId) {
  if (groupNameCache.has(topicId)) {
    return groupNameCache.get(topicId);
  }
  const promise = fetch(`/t/${topicId}.json`, {
    headers: { Accept: "application/json" },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const map = new Map();
      (d?.post_stream?.posts || []).forEach((p) => {
        if (p.username && p.primary_group_name && !map.has(p.username)) {
          map.set(p.username, humanizeGroupName(p.primary_group_name));
        }
      });
      return map;
    })
    .catch(() => new Map());
  groupNameCache.set(topicId, promise);
  return promise;
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

  // .post-infos (the date bar) turned out not to already sit inside
  // .topic-body as assumed — it was rendering as its own separate
  // strip above the whole avatar+content row, with a gap above the
  // avatar. Force it to be the first child of .topic-body regardless
  // of wherever it actually starts out, so the date bar always ends
  // up as the top edge of the content column specifically (not
  // spanning above the avatar too).
  const topicBody = article.querySelector(".topic-body");
  const postInfos = article.querySelector(".post-infos");
  if (topicBody && postInfos && topicBody.firstElementChild !== postInfos) {
    topicBody.insertBefore(postInfos, topicBody.firstChild);
  }

  // .post-menu-area (like/reply/flag/etc.) turned out to be nested
  // inside .regular.contents (the cooked-text wrapper) rather than a
  // sibling of it — confirmed via getBoundingClientRect/offsetParent
  // on a live install: it was resolving its position: absolute against
  // .regular.contents (sized to the text, hence following the text's
  // height) instead of .row (the full card, sized to fill the space
  // beside the avatar). Move it to be a direct child of .row so its
  // position: absolute (see common.scss) reliably anchors to the
  // actual card, not the text block.
  const row = article.querySelector(".row");
  const menuArea = article.querySelector(".post-menu-area");
  if (row && menuArea && menuArea.parentElement !== row) {
    row.appendChild(menuArea);
  }

  const wrap = document.createElement("div");
  wrap.className = "rp-post-user-info";

  // Move the real .names element (not a text clone) so username-click
  // / hover-card behavior keeps working exactly as before.
  wrap.appendChild(namesEl);

  const groupTitleEl = document.createElement("div");
  groupTitleEl.className = "rp-post-group-title";
  wrap.appendChild(groupTitleEl);

  const statsEl = document.createElement("div");
  statsEl.className = "rp-post-user-stats";
  wrap.appendChild(statsEl);

  avatarCol.appendChild(wrap);

  const username = namesEl.querySelector("a")?.textContent?.trim();
  if (!username) {
    return;
  }

  const topicId = currentTopicIdFromUrl();
  if (topicId) {
    fetchTopicGroupNames(topicId).then((map) => {
      const groupName = map.get(username);
      if (groupName && groupTitleEl.isConnected) {
        groupTitleEl.textContent = groupName;
      }
    });
  }

  fetchUserStats(username).then((stats) => {
    if (!stats || statsEl.isConnected === false) {
      return;
    }
    // Icon + number only, no trailing "posts"/"likes" word — matches
    // the reference design exactly. "comments" is used for the post
    // count instead of "message" because "message" isn't in
    // Discourse's preloaded icon sprite on this install (it silently
    // rendered nothing), while "comments" is already confirmed working
    // elsewhere in this theme (the FORUMS nav item).
    const parts = [];
    if (stats.postCount != null) {
      parts.push(
        `<div class="rp-post-stat">${iconSvg("comments")}<span class="rp-post-stat-value">${stats.postCount}</span></div>`
      );
    }
    if (stats.likesReceived != null) {
      parts.push(
        `<div class="rp-post-stat">${iconSvg("heart")}<span class="rp-post-stat-value">${stats.likesReceived}</span></div>`
      );
    }
    statsEl.innerHTML = parts.join("");
  });
}

// Discourse only renders flag/bookmark/delete/etc. into the DOM once
// the "..." (button.more-actions) trigger is actually clicked — it's
// not just CSS-hidden behind it. Since common.scss hides that trigger
// so it's never visible, we click it here programmatically (a
// synthetic .click() fires the same handler a real click would,
// regardless of the button's CSS display) so those actions get
// rendered and can then be forced always-visible via CSS. Confirmed
// class name from a live install: button.more-actions.
function expandPostActions(article) {
  if (article.dataset.rpActionsExpanded) {
    return;
  }
  const trigger = article.querySelector("button.more-actions, .show-more-actions");
  if (!trigger) {
    return;
  }
  article.dataset.rpActionsExpanded = "true";
  trigger.click();
}

export default apiInitializer((api) => {
  function enhanceAll() {
    document.querySelectorAll(".topic-post").forEach((article) => {
      enhancePost(article);
      expandPostActions(article);
    });
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

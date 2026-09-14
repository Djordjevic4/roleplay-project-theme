import { apiInitializer } from "discourse/lib/api";

// ---------------------------------------------------------------
// Fully custom category cards for the categories index ("Forums")
// page. We deliberately do NOT rely on Discourse's native category
// list markup (its exact DOM/classes vary a lot depending on the
// site's "desktop category page style" setting, which is outside
// this theme's control) — instead we fetch category + latest-topic
// data straight from Discourse's public, stable JSON endpoints and
// render our own cards. If that fetch ever fails, the native list is
// shown again untouched so the page never ends up empty.
// ---------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function relativeTime(dateStr) {
  if (!dateStr) {
    return "";
  }
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function avatarHtml(avatarTemplate, size) {
  if (!avatarTemplate) {
    return "";
  }
  const src = escapeHtml(avatarTemplate.replace("{size}", size));
  return `<img class="rp-cat-avatar" src="${src}" width="${size}" height="${size}" loading="lazy">`;
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function loadLatestTopic(categoryId) {
  try {
    const data = await fetchJSON(`/c/${categoryId}.json`);
    const topic = data.topic_list?.topics?.[0];
    if (!topic) {
      return null;
    }
    const posterId = topic.posters?.[0]?.user_id;
    const user = data.users?.find((u) => u.id === posterId);
    return {
      title: topic.title,
      url: `/t/${topic.slug}/${topic.id}`,
      username: user?.username || "",
      avatarTemplate: user?.avatar_template || "",
      bumpedAt: topic.bumped_at,
    };
  } catch (e) {
    return null;
  }
}

async function loadCategoryData() {
  const data = await fetchJSON("/categories.json");
  const categories = data.category_list.categories;
  return Promise.all(
    categories.map(async (cat) => ({
      ...cat,
      rpLatest: await loadLatestTopic(cat.id),
    }))
  );
}

function badgeHtml(cat) {
  const color = cat.color ? `#${cat.color}` : "#1685FF";
  const textColor = cat.text_color ? `#${cat.text_color}` : "#fff";
  const logoUrl = cat.uploaded_logo?.url;
  if (logoUrl) {
    return `<span class="rp-cat-badge rp-cat-badge-image" style="background:${color}">
        <img src="${escapeHtml(logoUrl)}" alt="" width="20" height="20">
      </span>`;
  }
  const inner = escapeHtml((cat.name || "?").charAt(0).toUpperCase());
  return `<span class="rp-cat-badge" style="background:${color};color:${textColor}">${inner}</span>`;
}

function rowHtml(cat) {
  const latest = cat.rpLatest;
  const latestHtml = latest
    ? `<a class="rp-cat-latest" href="${escapeHtml(latest.url)}">
        ${avatarHtml(latest.avatarTemplate, 36)}
        <span class="rp-cat-latest-info">
          <span class="rp-cat-latest-title">${escapeHtml(latest.title)}</span>
          <span class="rp-cat-latest-meta"><span class="rp-cat-latest-user">${escapeHtml(
            latest.username
          )}</span> · ${escapeHtml(relativeTime(latest.bumpedAt))}</span>
        </span>
      </a>`
    : `<span class="rp-cat-latest rp-cat-latest-empty">No topics yet</span>`;

  return `<div class="rp-cat-row" data-category-id="${cat.id}">
      <a class="rp-cat-main" href="/c/${escapeHtml(cat.slug)}/${cat.id}">
        ${badgeHtml(cat)}
        <span class="rp-cat-text">
          <span class="rp-cat-name">${escapeHtml(cat.name)}</span>
          <span class="rp-cat-desc">${escapeHtml(cat.description_text)}</span>
        </span>
      </a>
      <span class="rp-cat-count">
        <span class="rp-cat-count-number">${cat.topic_count ?? 0}</span>
        posts
      </span>
      ${latestHtml}
    </div>`;
}

function sectionHtml(parent, children) {
  const rows = children.map(rowHtml).join("");
  return `<div class="rp-cat-section">
      <div class="rp-cat-section-header">${escapeHtml(parent.name)}</div>
      <div class="rp-cat-section-body">${rows}</div>
    </div>`;
}

function looseSectionHtml(cats) {
  return `<div class="rp-cat-section"><div class="rp-cat-section-body">${cats
    .map(rowHtml)
    .join("")}</div></div>`;
}

function buildHtml(categories) {
  const byParent = new Map();
  const top = [];
  categories.forEach((c) => {
    if (c.parent_category_id) {
      if (!byParent.has(c.parent_category_id)) {
        byParent.set(c.parent_category_id, []);
      }
      byParent.get(c.parent_category_id).push(c);
    } else {
      top.push(c);
    }
  });
  top.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // Categories without children are grouped together into ONE shared
  // block (rows separated only by a thin border, no per-category card)
  // rather than each getting its own section — otherwise a flat,
  // ungrouped category list (no "Announcements"/"Community" parents
  // configured) renders as a stack of isolated cards with big gaps.
  let html = "";
  let loose = [];
  const flushLoose = () => {
    if (loose.length) {
      html += looseSectionHtml(loose);
      loose = [];
    }
  };

  top.forEach((cat) => {
    const children = byParent.get(cat.id);
    if (children && children.length) {
      flushLoose();
      html += sectionHtml(cat, children);
    } else {
      loose.push(cat);
    }
  });
  flushLoose();

  return html;
}

function isCategoriesIndexRoute(router) {
  const name = router.currentRouteName || "";
  return name.startsWith("discovery.categories");
}

export default apiInitializer((api) => {
  let renderToken = 0;

  async function render() {
    const router = api.container.lookup("service:router");
    if (!isCategoriesIndexRoute(router)) {
      return;
    }

    // #main-outlet is one of the oldest, most stable ids in Discourse —
    // used directly rather than guessing at #list-area/.category-list,
    // whose presence turned out to depend on the site's native list
    // style and left native title/hero/"latest" elements untouched
    // (and mis-positioned) alongside our cards.
    const anchor = document.getElementById("main-outlet");
    if (!anchor) {
      return;
    }

    const myToken = ++renderToken;

    let page = anchor.querySelector(":scope > .rp-forums-page");
    // Never touch our own other connectors — .rp-topbar and .rp-sidebar
    // turned out to render as children of #main-outlet on this install
    // (not as separate siblings, as originally assumed), so a blanket
    // "hide everything native" pass was hiding them too.
    const nativeChildren = Array.from(anchor.children).filter(
      (el) =>
        el !== page &&
        !el.classList.contains("rp-topbar") &&
        !el.classList.contains("rp-sidebar")
    );
    nativeChildren.forEach((el) => (el.style.display = "none"));

    if (!page) {
      page = document.createElement("div");
      page.className = "rp-forums-page";
      anchor.appendChild(page);
    }
    page.innerHTML = `
      <div class="rp-forums-header">
        <h1>Forums</h1>
        <a class="rp-new-topic-btn" href="/new-topic">+ Start new topic</a>
      </div>
      <div class="rp-cat-sections"><div class="rp-cat-loading">Loading categories…</div></div>
    `;

    try {
      const categories = await loadCategoryData();
      if (myToken !== renderToken) {
        return; // navigated away while fetching
      }
      page.querySelector(".rp-cat-sections").innerHTML = buildHtml(categories);
    } catch (e) {
      if (myToken !== renderToken) {
        return;
      }
      // Fall back to whatever Discourse natively rendered rather than
      // leaving a blank page.
      page.remove();
      nativeChildren.forEach((el) => (el.style.display = ""));
    }
  }

  api.onPageChange(() => {
    setTimeout(render, 60);
  });
});

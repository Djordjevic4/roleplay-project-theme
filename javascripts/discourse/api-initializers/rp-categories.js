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

  return top
    .map((cat) => {
      const children = byParent.get(cat.id);
      if (children && children.length) {
        return sectionHtml(cat, children);
      }
      return `<div class="rp-cat-section"><div class="rp-cat-section-body">${rowHtml(cat)}</div></div>`;
    })
    .join("");
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

    const anchor =
      document.querySelector("#list-area") ||
      document.querySelector(".category-list")?.parentElement ||
      document.getElementById("main-outlet");
    if (!anchor) {
      return;
    }

    const myToken = ++renderToken;

    document
      .querySelectorAll(
        ".category-list, .categories-boxes, .categories-and-top-topics, .subcategories-with-featured-topics"
      )
      .forEach((el) => (el.style.display = "none"));

    let container = document.querySelector(".rp-cat-sections");
    if (!container) {
      container = document.createElement("div");
      container.className = "rp-cat-sections";
      anchor.appendChild(container);
    }
    container.innerHTML = `<div class="rp-cat-loading">Loading categories…</div>`;

    try {
      const categories = await loadCategoryData();
      if (myToken !== renderToken) {
        return; // navigated away while fetching
      }
      container.innerHTML = buildHtml(categories);
    } catch (e) {
      if (myToken !== renderToken) {
        return;
      }
      container.remove();
      // Fall back to the native list rather than leaving a blank page.
      document.querySelectorAll(".category-list").forEach((el) => (el.style.display = ""));
    }
  }

  api.onPageChange(() => {
    setTimeout(render, 60);
  });
});

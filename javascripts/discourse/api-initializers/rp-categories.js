import { apiInitializer } from "discourse/lib/api";
import {
  getSiteCategories,
  loadLatestTopic,
  sectionHtml,
} from "../lib/rp-category-cards";

// ---------------------------------------------------------------
// Fully custom category cards for the categories index ("Forums")
// page. We deliberately do NOT rely on Discourse's native category
// list markup (its exact DOM/classes vary a lot depending on the
// site's "desktop category page style" setting, which is outside
// this theme's control) — instead we read category data straight from
// Discourse's own `site.categories` service (see rp-category-cards.js)
// and render our own cards. If that ever fails, the native list is
// shown again untouched so the page never ends up empty.
// ---------------------------------------------------------------

async function loadCategoryData(api) {
  const categories = getSiteCategories(api);
  return Promise.all(
    categories.map(async (cat) => ({
      ...cat,
      rpLatest: await loadLatestTopic(cat.id),
    }))
  );
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
  byParent.forEach((children) => children.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));

  // Categories without children are grouped together into ONE shared
  // block (rows separated only by a thin border, no per-category card)
  // rather than each getting its own section — otherwise a flat,
  // ungrouped category list (no "Announcements"/"Community" parents
  // configured) renders as a stack of isolated cards with big gaps.
  let html = "";
  let loose = [];
  const flushLoose = () => {
    if (loose.length) {
      html += sectionHtml(settings.loose_categories_label, loose);
      loose = [];
    }
  };

  top.forEach((cat) => {
    const children = byParent.get(cat.id);
    if (children && children.length) {
      flushLoose();
      html += sectionHtml(cat.name, children);
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
      const categories = await loadCategoryData(api);
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

  function cleanupIfNotIndex() {
    const router = api.container.lookup("service:router");
    if (isCategoriesIndexRoute(router)) {
      return;
    }
    // Ember's outlet re-render doesn't know about elements we appended
    // manually, so a stale .rp-forums-page from a previous visit to
    // the categories index would otherwise stay stuck on top of
    // whatever route we've navigated to since.
    renderToken++; // invalidate any in-flight fetch from the old page
    document.querySelectorAll(".rp-forums-page").forEach((el) => el.remove());
  }

  api.onPageChange(() => {
    setTimeout(() => {
      cleanupIfNotIndex();
      render();
    }, 60);
  });
});

import { apiInitializer } from "discourse/lib/api";
import {
  escapeHtml,
  getSiteCategories,
  loadLatestTopic,
  mapWithConcurrency,
  sectionHtml,
} from "../lib/rp-category-cards";

// ---------------------------------------------------------------
// Individual category pages (e.g. "Server Announcements"): confirmed
// via a live install's rendered HTML that <section class="category-heading">
// exists but renders completely empty (no title/description shown at
// all — likely because this site doesn't have the relevant "show
// category definition" behavior active), and there is no native
// "Subforums" element anywhere in the page for a category that has
// subcategories. Both are built here instead, from the same
// site.categories data used on the main categories index.
// ---------------------------------------------------------------

function isCategoryShowRoute(router) {
  const name = router.currentRouteName || "";
  return name.startsWith("discovery.category") && !name.startsWith("discovery.categories");
}

function currentCategoryIdFromUrl() {
  const match = window.location.pathname.match(/^\/c\/(?:.+\/)?(\d+)(?:\/|$)/);
  return match ? parseInt(match[1], 10) : null;
}

function headerHtml(cat) {
  return `
    <div class="rp-category-header">
      <div class="rp-category-header-text">
        <h1>${escapeHtml(cat.name)}</h1>
        ${cat.description_text ? `<p>${escapeHtml(cat.description_text)}</p>` : ""}
      </div>
      <div class="rp-category-header-actions"></div>
    </div>
  `;
}

export default apiInitializer((api) => {
  let renderToken = 0;

  function cleanup() {
    document.querySelectorAll(".rp-category-header, .rp-subforums-section").forEach((el) => el.remove());
  }

  async function render() {
    const router = api.container.lookup("service:router");
    const myToken = ++renderToken;
    cleanup();

    if (!isCategoryShowRoute(router)) {
      return;
    }

    const categoryId = currentCategoryIdFromUrl();
    if (!categoryId) {
      return;
    }

    const categories = getSiteCategories(api);
    const current = categories.find((c) => c.id === categoryId);
    if (!current || myToken !== renderToken) {
      return;
    }

    const heading = document.querySelector(".category-heading");
    if (heading) {
      heading.insertAdjacentHTML("beforeend", headerHtml(current));
      // Move the real native "New Topic" button and the follow/
      // notification-level button into our header's action slot
      // (reparenting keeps their Ember-bound click behavior fully
      // intact — same technique used for the sidebar layout grid in
      // rp-init.js). New Topic first (primary action), Follow second.
      const actionsSlot = heading.querySelector(".rp-category-header-actions");
      const newTopicBtn =
        document.querySelector(".topic-create-button__combo") ||
        document.getElementById("create-topic");
      const followBtn = document.querySelector(".notifications-tracking-trigger");
      if (actionsSlot && newTopicBtn) {
        actionsSlot.appendChild(newTopicBtn);
      }
      if (actionsSlot && followBtn) {
        actionsSlot.appendChild(followBtn);
      }
    }

    const children = categories
      .filter((c) => c.parent_category_id === current.id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    if (!children.length) {
      return;
    }

    const withLatest = await mapWithConcurrency(children, 4, async (c) => ({
      ...c,
      rpLatest: await loadLatestTopic(c.id),
    }));
    if (myToken !== renderToken) {
      return; // navigated away while fetching
    }

    const listArea = document.getElementById("list-area");
    if (listArea && !document.querySelector(".rp-subforums-section")) {
      listArea.insertAdjacentHTML(
        "afterbegin",
        `<div class="rp-subforums-section">${sectionHtml("Subforums", withLatest)}</div>`
      );
    }
  }

  api.onPageChange(() => {
    setTimeout(render, 60);
  });
});

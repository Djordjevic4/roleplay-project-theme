import { apiInitializer } from "discourse/lib/api";

// On the categories index, any category that itself has subcategories
// (e.g. "Announcements", "Community" in the reference design) is
// rendered as a bare section-header bar instead of a normal clickable
// row with its own description/topic-count/latest-topic columns —
// matching the reference screenshot, using only real category data.
// This only matters as a fallback: rp-categories.js normally replaces
// the native category list entirely, but if that fetch/render fails
// for any reason the native list is shown again and still benefits
// from this treatment.
function markParentRows(api) {
  const site =
    api.container.lookup("service:site") || api.container.lookup("site:main");
  const categories = site && site.categories;
  if (!categories || !categories.length) {
    return;
  }

  categories.forEach((cat) => {
    const hasChildren = categories.some((c) => c.parent_category_id === cat.id);
    const row = document.querySelector(
      `.category-list tr[data-category-id="${cat.id}"]`
    );
    if (!row) {
      return;
    }
    row.classList.toggle("rp-parent-heading", hasChildren);
    if (hasChildren) {
      row.dataset.categoryName = cat.name;
    }
  });
}

function isCategoriesIndexRoute(router) {
  const name = router?.currentRouteName || "";
  return name.startsWith("discovery.categories");
}

// rp-sidebar.js also tries to hide itself reactively via a router
// event, but that turned out not to fire reliably for every kind of
// client-side transition on this install (confirmed: .rp-sidebar was
// still found in the DOM, still occupying flex space, on a category
// page after an in-app link click). api.onPageChange is the mechanism
// already proven reliable elsewhere in this theme (rp-categories.js,
// rp-category-header.js both depend on it working every time), so it
// authoritatively controls visibility here too — a plain style toggle
// that doesn't depend on the connector's own internal state.
function updateSidebarVisibility(api) {
  const router = api.container.lookup("service:router");
  const shouldShow = isCategoriesIndexRoute(router);
  document.querySelectorAll(".rp-sidebar").forEach((el) => {
    el.style.display = shouldShow ? "" : "none";
  });
}

// Same reasoning as updateSidebarVisibility above: the banner
// (above-main-container outlet, see rp-topbar.js) stays mounted across
// client-side transitions too, so its own shouldRender can't react to
// route changes on its own. Only show it on the categories index.
function updateBannerVisibility(api) {
  const router = api.container.lookup("service:router");
  const shouldShow = isCategoriesIndexRoute(router);
  document.querySelectorAll(".rp-banner").forEach((el) => {
    el.style.display = shouldShow ? "" : "none";
  });
}

// Forces the real 2-column layout (main content + right sidebar).
//
// Computed-style inspection on a live install revealed #main-outlet's
// real ancestor, #main-outlet-wrapper (class "wrap"), is a CSS *grid*
// container — not flex, as earlier versions of this file assumed.
// Wrapping #main-outlet in an extra flex <div> disrupted the native
// grid's row placement (the wrapper div didn't carry whatever
// grid-row/column assignment Discourse's own CSS gives #main-outlet),
// which is what caused the sidebar to overlap the main content instead
// of sitting beside it.
//
// This version does not introduce any wrapping element at all: it
// only moves .rp-sidebar to be a direct sibling of #main-outlet inside
// the *existing* #main-outlet-wrapper grid, and toggles a class on
// that wrapper to explicitly define a 2-column grid template only
// while the sidebar should be visible — otherwise the wrapper is left
// completely alone, so #main-outlet keeps whatever native single-
// column grid placement already works correctly.
function ensureLayoutGrid() {
  const mainOutlet = document.getElementById("main-outlet");
  const wrapper = document.getElementById("main-outlet-wrapper");
  if (!mainOutlet || !wrapper) {
    return;
  }

  const sidebar = document.querySelector(".rp-sidebar");
  const sidebarVisible = !!sidebar && getComputedStyle(sidebar).display !== "none";

  if (!sidebarVisible) {
    wrapper.classList.remove("rp-has-sidebar");
    return;
  }

  wrapper.classList.add("rp-has-sidebar");
  if (sidebar.parentElement !== wrapper) {
    wrapper.appendChild(sidebar);
  }
}

export default apiInitializer((api) => {
  api.onPageChange(() => {
    setTimeout(() => {
      updateSidebarVisibility(api);
      updateBannerVisibility(api);
      ensureLayoutGrid();
      markParentRows(api);
    }, 80);
  });

  // Extra safety net: react to arbitrary DOM changes too, not just
  // page-change events, in case something else mutates the DOM around
  // #main-outlet/.rp-sidebar between navigations. ensureLayoutGrid()
  // is cheap and a no-op once state already matches, so this is safe.
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(ensureLayoutGrid, 30);
  });
  observer.observe(document.body, { childList: true, subtree: true });
});

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

// Forces the real 2-column layout (main content + right sidebar) by
// physically moving #main-outlet and the sidebar's own root element
// into a wrapper we create and fully control. This is deliberately NOT
// based on guessing which Discourse-internal element wraps both of
// them (that assumption proved wrong on at least one live install) —
// #main-outlet's id is one of the oldest, most stable anchors in
// Discourse, so anchoring off it directly is far more reliable.
function ensureLayoutGrid() {
  const mainOutlet = document.getElementById("main-outlet");
  if (!mainOutlet) {
    return;
  }
  const sidebar = document.querySelector(".rp-sidebar");
  let row = document.getElementById("rp-layout-row");

  if (!sidebar) {
    // Sidebar widgets are disabled or not yet mounted: unwrap if we
    // previously wrapped, so #main-outlet returns to its normal flow.
    if (row) {
      row.parentNode.insertBefore(mainOutlet, row);
      row.remove();
    }
    return;
  }

  if (!row) {
    row = document.createElement("div");
    row.id = "rp-layout-row";
    mainOutlet.parentNode.insertBefore(row, mainOutlet);
  }
  if (mainOutlet.parentElement !== row) {
    row.appendChild(mainOutlet);
  }
  if (sidebar.parentElement !== row) {
    row.appendChild(sidebar);
  }
}

export default apiInitializer((api) => {
  api.onPageChange(() => {
    setTimeout(() => {
      updateSidebarVisibility(api);
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

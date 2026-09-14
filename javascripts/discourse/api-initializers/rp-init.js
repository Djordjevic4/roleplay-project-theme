import { apiInitializer } from "discourse/lib/api";

// On the categories index, any category that itself has subcategories
// (e.g. "Announcements", "Community" in the reference design) is
// rendered as a bare section-header bar instead of a normal clickable
// row with its own description/topic-count/latest-topic columns —
// matching the reference screenshot, using only real category data.
export default apiInitializer((api) => {
  function markParentRows() {
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

  api.onPageChange(() => {
    setTimeout(markParentRows, 80);
  });
});

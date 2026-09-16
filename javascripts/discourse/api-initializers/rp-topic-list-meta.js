import { apiInitializer } from "discourse/lib/api";
import { escapeHtml, fetchCategoryTopicData, groupColorFor } from "../lib/rp-category-cards";

// ---------------------------------------------------------------
// Category topic-list rows: adds "Author, Date" under the topic title
// (the topic's real starting poster, colored by their real group —
// same system used elsewhere — plus the topic's real creation date).
// Discourse's own row markup has an empty .link-bottom-line div ready
// for exactly this, confirmed via a live DOM dump. Reuses
// fetchCategoryTopicData() (same cached walk already powering the
// category cards' post counts) rather than adding a new fetch.
// ---------------------------------------------------------------

function categoryIdFromUrl() {
  const match = window.location.pathname.match(/^\/c\/(?:.+\/)?(\d+)(?:\/|$)/);
  return match ? parseInt(match[1], 10) : null;
}

function formatDate(iso) {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

async function enhanceRows() {
  const categoryId = categoryIdFromUrl();
  if (!categoryId) {
    return;
  }

  const rows = document.querySelectorAll("tr.topic-list-item[data-topic-id]");
  if (!rows.length) {
    return;
  }

  const data = await fetchCategoryTopicData(categoryId);
  const topicMeta = data.topicMeta;
  if (!topicMeta) {
    return;
  }

  rows.forEach((row) => {
    if (row.dataset.rpMetaEnhanced) {
      return;
    }
    const topicId = parseInt(row.dataset.topicId, 10);
    const meta = topicMeta.get(topicId);
    if (!meta || !meta.username) {
      return;
    }
    const bottomLine = row.querySelector(".link-bottom-line");
    if (!bottomLine) {
      return;
    }
    row.dataset.rpMetaEnhanced = "true";

    const color = groupColorFor(meta.primaryGroupName);
    const style = color ? ` style="color:${color}"` : "";
    const line = document.createElement("div");
    line.className = "rp-topic-op-line";
    line.innerHTML = `<a class="rp-topic-op" href="/u/${escapeHtml(meta.username)}"${style}>${escapeHtml(meta.username)}</a>, ${escapeHtml(formatDate(meta.createdAt))}`;
    bottomLine.insertBefore(line, bottomLine.firstChild);
  });
}

export default apiInitializer((api) => {
  api.onPageChange(() => {
    setTimeout(enhanceRows, 120);
  });

  // The topic list can load more rows via infinite scroll.
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(enhanceRows, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });
});

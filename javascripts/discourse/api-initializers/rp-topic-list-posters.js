import { apiInitializer } from "discourse/lib/api";
import { groupColorFor } from "../lib/rp-category-cards";

// ---------------------------------------------------------------
// Category topic-list "Posters" column: confirmed live that
// Discourse already marks the most-recent poster's avatar link with
// both a .latest class AND a real group-{slug} class (e.g.
// "group-head_administrator") — this adds a visible, colored username
// label next to that avatar (the reference design's "avatar + colored
// name" look) by reading that same real class Discourse already
// provides, rather than fetching anything extra.
// ---------------------------------------------------------------

function enhanceRow(link) {
  if (link.dataset.rpEnhanced) {
    return;
  }
  const username = link.getAttribute("data-user-card");
  if (!username) {
    return;
  }
  link.dataset.rpEnhanced = "true";

  const groupClass = [...link.classList].find((c) => c.startsWith("group-"));
  const slug = groupClass ? groupClass.slice("group-".length) : null;
  const color = groupColorFor(slug);

  const label = document.createElement("span");
  label.className = "rp-topic-poster-name";
  label.textContent = username;
  if (color) {
    label.style.color = color;
  }
  link.appendChild(label);
}

function enhanceAll() {
  document.querySelectorAll("td.posters a.latest[data-user-card]").forEach(enhanceRow);
}

export default apiInitializer((api) => {
  api.onPageChange(() => {
    setTimeout(enhanceAll, 80);
  });

  // The topic list can load more rows via infinite scroll, so react
  // to DOM changes too, not just full page changes — same pattern
  // used for the post-stream layout in rp-post-layout.js.
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(enhanceAll, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
});

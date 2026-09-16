import { apiInitializer } from "discourse/lib/api";
import {
  escapeHtml,
  fetchJSON,
  groupColorFor,
  humanizeGroupName,
  mapWithConcurrency,
} from "../lib/rp-category-cards";

// ---------------------------------------------------------------
// Staff Directory — replaces the native /about page's content
// entirely (its "Our Admins"/"Our Moderators" sections are built
// from Discourse's automatic admin/moderator flags, not this site's
// real staff-tier groups) with sections built from staff_directory_
// groups (settings.yml), each populated with that group's REAL
// members via /groups/{slug}/members.json. A group with zero members
// is skipped rather than shown empty — nothing here is fabricated.
// ---------------------------------------------------------------

function isAboutRoute(router) {
  return router.currentRouteName === "about";
}

function slugList(str) {
  return String(str ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Reported live: sections would randomly go missing on reload,
// sometimes one group, sometimes another, sometimes both showing.
// Same root cause as the earlier "No topics yet" category-card bug —
// firing all group-member requests in parallel (Promise.all below,
// previously) could get some throttled by Discourse's own rate
// limiting, and a throttled request was being silently cached as "0
// members" forever. Fixed the same way: retry once on failure, and
// cap how many of these run at once (see mapWithConcurrency below).
const membersCache = new Map();

async function fetchGroupMembers(slug, attempt = 0) {
  if (membersCache.has(slug)) {
    return membersCache.get(slug);
  }
  try {
    const data = await fetchJSON(`/groups/${encodeURIComponent(slug)}/members.json?limit=100`);
    const members = data.members || [];
    membersCache.set(slug, members);
    return members;
  } catch (e) {
    if (attempt < 1) {
      await sleep(400 + Math.random() * 400);
      return fetchGroupMembers(slug, attempt + 1);
    }
    return []; // not cached — next render() call gets a fresh attempt
  }
}

function memberHtml(member, slug) {
  const color = groupColorFor(slug);
  const nameStyle = color ? ` style="color:${color}"` : "";
  const avatar = member.avatar_template
    ? `<img class="rp-staff-avatar" src="${escapeHtml(member.avatar_template.replace("{size}", "90"))}" width="90" height="90" loading="lazy">`
    : `<div class="rp-staff-avatar rp-staff-avatar-fallback">${escapeHtml((member.username || "?").charAt(0).toUpperCase())}</div>`;

  return `
    <div class="rp-staff-member">
      <a href="/u/${escapeHtml(member.username)}">${avatar}</a>
      <a class="rp-staff-name" href="/u/${escapeHtml(member.username)}"${nameStyle}>${escapeHtml(member.username)}</a>
      <a class="rp-staff-message" href="/new-message?username=${escapeHtml(member.username)}">
        <svg class="fa d-icon d-icon-envelope svg-icon fa-width-auto svg-string" width="1em" height="1em" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><use href="#envelope"></use></svg>
        Message
      </a>
    </div>
  `;
}

async function buildSectionsHtml() {
  const slugs = slugList(settings.staff_directory_groups);
  const membersBySlug = await mapWithConcurrency(slugs, 3, (slug) => fetchGroupMembers(slug));

  return slugs
    .map((slug, i) => ({ slug, members: membersBySlug[i] }))
    .filter(({ members }) => members.length > 0)
    .map(
      ({ slug, members }) => `
        <div class="rp-staff-section">
          <div class="rp-staff-section-title">${escapeHtml(humanizeGroupName(slug))}</div>
          <div class="rp-staff-grid">${members.map((m) => memberHtml(m, slug)).join("")}</div>
        </div>
      `
    )
    .join("");
}

export default apiInitializer((api) => {
  let renderToken = 0;

  function cleanup() {
    document.querySelectorAll(".rp-staff-page").forEach((el) => el.remove());
  }

  async function render() {
    const router = api.container.lookup("service:router");
    if (!isAboutRoute(router)) {
      cleanup();
      return;
    }

    const anchor = document.getElementById("main-outlet");
    if (!anchor) {
      return;
    }

    const myToken = ++renderToken;

    let page = anchor.querySelector(":scope > .rp-staff-page");
    const nativeChildren = Array.from(anchor.children).filter((el) => el !== page);
    nativeChildren.forEach((el) => (el.style.display = "none"));

    if (!page) {
      page = document.createElement("div");
      page.className = "rp-staff-page";
      anchor.appendChild(page);
    }
    page.innerHTML = `
      <div class="rp-staff-header">
        <h1>Staff Directory</h1>
      </div>
      <div class="rp-staff-sections"><div class="rp-staff-loading">Loading…</div></div>
    `;

    try {
      const html = await buildSectionsHtml();
      if (myToken !== renderToken) {
        return; // navigated away while fetching
      }
      page.querySelector(".rp-staff-sections").innerHTML =
        html || `<div class="rp-staff-empty">No staff to show yet.</div>`;
    } catch (e) {
      if (myToken !== renderToken) {
        return;
      }
      // Fall back to the native page rather than leaving this blank.
      page.remove();
      nativeChildren.forEach((el) => (el.style.display = ""));
    }
  }

  api.onPageChange(() => {
    setTimeout(render, 60);
  });
});

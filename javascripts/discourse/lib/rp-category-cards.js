// Shared rendering helpers used by both rp-categories.js (the main
// "Forums" category cards) and rp-category-header.js (the per-category
// title/description banner + Subforums panel), so both surfaces render
// categories identically without duplicating the markup/logic.

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function slugList(str) {
  return String(str ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// "head_administrator" -> "Head Administrator" — shared by the
// per-post group title (rp-post-layout.js) and the staff directory
// (rp-staff-directory.js) so both format group slugs identically.
export function humanizeGroupName(slug) {
  return String(slug ?? "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Shared group-tier coloring: which groups count as "red" or "yellow"
// is configured via settings.yml (group_color_red_slugs /
// group_color_yellow_slugs) rather than hardcoded, so the site admin
// can add/remove groups without a code change. Returns a CSS color
// value (a var() reference) or null if the group isn't in either
// list, so callers can fall back to their own default styling.
export function groupColorFor(groupSlug) {
  if (!groupSlug) {
    return null;
  }
  const slug = String(groupSlug).toLowerCase();
  if (slugList(settings.group_color_red_slugs).includes(slug)) {
    return "var(--rp-group-red)";
  }
  if (slugList(settings.group_color_yellow_slugs).includes(slug)) {
    return "var(--rp-group-yellow)";
  }
  return null;
}

export function relativeTime(dateStr) {
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

export function avatarHtml(avatarTemplate, size) {
  if (!avatarTemplate) {
    return "";
  }
  const src = escapeHtml(avatarTemplate.replace("{size}", size));
  return `<img class="rp-cat-avatar" src="${src}" width="${size}" height="${size}" loading="lazy">`;
}

export async function fetchJSON(url) {
  // cache: "no-store" so a category's latest-topic lookup can never
  // serve a stale browser-cached response from before a new topic was
  // created (reported as a real category with a real topic still
  // showing "No topics yet" on the Forums index).
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Discourse's own cached counters (Category#post_count,
// UserStat#post_count from /u/{username}/summary.json) both turned out
// to be unreliable in practice — confirmed live on this install, a
// user with 1 topic + 5 real replies still showed post_count: 2. The
// fix that worked: count real UserAction rows instead of trusting a
// cached column. /user_actions.json accepts a comma-separated `filter`
// of action types (confirmed live) — 4 = started a topic, 5 = replied,
// 2 = was_liked — so this paginates through it and returns a literal
// count of matching rows, with a retry on failure. Shared by the post
// stat boxes (rp-post-layout.js) and the user profile page
// (rp-user-profile.js) so both use the exact same real-count logic.
const USER_ACTIONS_MAX_PAGES = 20;

export async function countUserActions(username, filterCodes, attempt = 0) {
  let total = 0;
  let offset = 0;
  let pages = 0;

  try {
    while (pages < USER_ACTIONS_MAX_PAGES) {
      const data = await fetchJSON(
        `/user_actions.json?username=${encodeURIComponent(username)}&filter=${filterCodes}&offset=${offset}`
      );
      const actions = data.user_actions || [];
      total += actions.length;
      if (!actions.length) {
        break;
      }
      offset += actions.length;
      pages += 1;
    }
    return total;
  } catch (e) {
    if (attempt < 1) {
      await sleep(400 + Math.random() * 400);
      return countUserActions(username, filterCodes, attempt + 1);
    }
    return null;
  }
}

// Confirmed live: topic.posters[0] is NOT reliably the most recent
// poster — a topic's posters array can list the Original Poster
// first, which showed the topic's original author as the category
// card's "latest reply" instead of whoever actually replied last.
// Discourse tags the real most-recent poster via a `extras` string
// that includes "latest" (e.g. "latest single") — that's the one to
// use, falling back to posters[0] only if none carry that flag.
function latestPosterId(topic) {
  const posters = topic.posters || [];
  const latest = posters.find((p) => p.extras && p.extras.includes("latest"));
  return (latest || posters[0])?.user_id;
}

// Fetches recent activity across the WHOLE site in one request and
// groups it by category, instead of one request per category — much
// faster (1 request instead of N) and effectively immune to Discourse's
// own rate limiting on its JSON endpoints (firing a fetch per category
// at once was intermittently getting some throttled, which silently
// looked like "no topics" for an otherwise perfectly normal category),
// since there's only ever one request in flight here. Categories with
// genuinely older activity than fits on this one page won't be covered
// — callers fall back to fetchCategoryTopicData() for any category id
// missing from the returned map.
export async function fetchGlobalLatestTopics() {
  const map = new Map();
  try {
    const data = await fetchJSON("/latest.json?order=activity&per_page=100");
    const users = data.users || [];
    (data.topic_list?.topics || []).forEach((topic) => {
      const categoryId = topic.category_id;
      if (categoryId == null || map.has(categoryId)) {
        return; // topics are already ordered by activity, so the
        // first one seen per category is the most recent
      }
      const posterId = latestPosterId(topic);
      const user = users.find((u) => u.id === posterId);
      map.set(categoryId, {
        title: topic.title,
        url: `/t/${topic.slug}/${topic.id}`,
        username: user?.username || "",
        avatarTemplate: user?.avatar_template || "",
        primaryGroupName: user?.primary_group_name || null,
        bumpedAt: topic.bumped_at,
      });
    });
  } catch (e) {
    // Empty map: callers fall back to fetchCategoryTopicData() per category.
  }
  return map;
}

// Discourse's own `post_count` field on a category (from
// site.categories / /c/{id}/show.json) turned out not to be a
// reliable "total posts in this category" number in practice — it's a
// counter column that isn't always kept in sync in real time. The user
// wants a literal count: every topic-starting post PLUS every reply,
// across every topic in the category. The only way to get a genuinely
// fresh, correct number is to walk the category's own topic list (which
// Discourse paginates via topic_list.more_topics_url) and sum each
// topic's own posts_count (a Topic field that DOES include the OP —
// confirmed reliable, since it's what Discourse itself uses to render
// the "replies" column). Capped at a generous number of pages so one
// huge category can't turn into an unbounded fetch loop, and cached
// briefly per category so re-rendering (e.g. navigating back and forth)
// doesn't re-walk the whole category every time.
const topicDataCache = new Map(); // categoryId -> { total, latest, ts }
const TOPIC_DATA_CACHE_MS = 3 * 60 * 1000;
const POST_COUNT_MAX_PAGES = 25;

function latestFromTopic(topic, users) {
  if (!topic) {
    return null;
  }
  const posterId = latestPosterId(topic);
  const user = users.find((u) => u.id === posterId);
  return {
    title: topic.title,
    url: `/t/${topic.slug}/${topic.id}`,
    username: user?.username || "",
    avatarTemplate: user?.avatar_template || "",
    primaryGroupName: user?.primary_group_name || null,
    bumpedAt: topic.bumped_at,
  };
}

// Walks a category's own (paginated) topic list once, in one pass,
// producing BOTH the true total post count (sum of every topic's own
// posts_count, which already includes that topic's first post plus
// every reply — exactly "every single post" the user asked for) AND a
// latest-topic fallback (page 1's first topic) for categories not
// covered by the sitewide fetchGlobalLatestTopics() batch. Doing both
// from a single walk — instead of a separate /c/{id}.json request for
// "latest topic" AND another one for "post count", as an earlier
// version of this did — halves the number of concurrent requests this
// makes per page load, which matters because Discourse's own rate
// limiting was the confirmed cause of earlier intermittent "No topics
// yet" bugs; doubling request volume risked bringing that back, and in
// practice was silently turning post counts into 0 for categories that
// got throttled with no retry to recover.
export async function fetchCategoryTopicData(categoryId, attempt = 0) {
  const cached = topicDataCache.get(categoryId);
  if (cached && Date.now() - cached.ts < TOPIC_DATA_CACHE_MS) {
    return cached;
  }

  let total = 0;
  let latest = null;
  let url = `/c/${categoryId}.json`;
  let pages = 0;

  try {
    while (url && pages < POST_COUNT_MAX_PAGES) {
      const data = await fetchJSON(url);
      const topics = data.topic_list?.topics || [];
      if (pages === 0) {
        latest = latestFromTopic(topics[0], data.users || []);
      }
      topics.forEach((topic) => {
        total += topic.posts_count ?? 1;
      });
      url = data.topic_list?.more_topics_url || null;
      pages += 1;
      if (!topics.length) {
        break;
      }
    }
    const result = { total, latest, ts: Date.now() };
    topicDataCache.set(categoryId, result);
    return result;
  } catch (e) {
    if (attempt < 1) {
      await sleep(400 + Math.random() * 400);
      return fetchCategoryTopicData(categoryId, attempt + 1);
    }
    // Keep serving a stale cached value rather than flashing to 0/"No
    // topics yet" if a later refresh fails (e.g. rate limiting).
    return cached || { total: null, latest: null, ts: 0 };
  }
}

// Runs `fn` over `items` with at most `limit` requests in flight at
// once, instead of firing every request simultaneously (Promise.all)
// — the likely trigger for the rate-limiting above.
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// Category objects coming from Discourse's `site.categories` are Ember
// model instances, not plain JSON — object-spreading them isn't
// reliable, so pick fields out explicitly. A couple of fields are read
// with a snake_case/camelCase fallback since Discourse hasn't been
// fully consistent about that across its Category model over time.
export function toPlainCategory(cat) {
  return {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    color: cat.color,
    text_color: cat.text_color ?? cat.textColor,
    description_text: cat.description_text ?? cat.descriptionText ?? "",
    topic_count: cat.topic_count ?? cat.topicCount ?? 0,
    post_count: cat.post_count ?? cat.postCount ?? 0,
    parent_category_id: cat.parent_category_id ?? cat.parentCategoryId ?? null,
    position: cat.position,
    uploaded_logo: cat.uploaded_logo ?? cat.uploadedLogo,
    // Confirmed via a live install's /c/{id}/show.json response: a
    // category's chosen badge style lives in style_type ("icon" /
    // "emoji" / "square"), with the actual icon name in `icon` and the
    // emoji short name in `emoji` (both fields exist regardless of
    // which style is currently active, so style_type is what decides
    // which one to use).
    style_type: cat.style_type ?? cat.styleType,
    icon: cat.icon,
    emoji: cat.emoji,
  };
}

export function getSiteCategories(api) {
  const site =
    api.container.lookup("service:site") || api.container.lookup("site:main");
  return ((site && site.categories) || []).map(toPlainCategory);
}

// Renders a FontAwesome icon the same way Discourse's own category
// badges do — a plain <svg><use href="#name"></use></svg> referencing
// the icon sprite Discourse already loads on every page — so no icon
// library import is needed here at all (this file builds raw HTML
// strings, not templates).
function faIconSvg(name) {
  const safe = escapeHtml(name);
  return `<svg class="fa d-icon d-icon-${safe} svg-icon fa-width-auto svg-string" width="1em" height="1em" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><use href="#${safe}"></use></svg>`;
}

// Confirmed emoji URL pattern from a live install's rendered HTML:
// /images/emoji/{set}/{name}.png. The emoji set ("twitter" here) is a
// site setting (Admin → Settings → emoji set) — hardcoded since this
// theme is built for one specific site, not as a public marketplace
// theme; update this if that site setting is ever changed.
function emojiImg(name) {
  const safe = escapeHtml(name);
  return `<img class="emoji" src="/images/emoji/twitter/${safe}.png" width="20" height="20" alt="${safe}">`;
}

export function badgeHtml(cat) {
  const color = cat.color ? `#${cat.color}` : "#1685FF";
  const textColor = cat.text_color ? `#${cat.text_color}` : "#fff";
  const logoUrl = cat.uploaded_logo?.url;
  if (logoUrl) {
    return `<span class="rp-cat-badge rp-cat-badge-image" style="background:${color}">
        <img src="${escapeHtml(logoUrl)}" alt="" width="20" height="20">
      </span>`;
  }

  let inner;
  if (cat.style_type === "icon" && cat.icon) {
    inner = faIconSvg(cat.icon);
  } else if (cat.style_type === "emoji" && cat.emoji) {
    inner = emojiImg(cat.emoji);
  } else {
    inner = escapeHtml((cat.name || "?").charAt(0).toUpperCase());
  }

  return `<span class="rp-cat-badge" style="background:${color};color:${textColor}">${inner}</span>`;
}

export function rowHtml(cat) {
  const latest = cat.rpLatest;
  const userColor = latest ? groupColorFor(latest.primaryGroupName) : null;
  const userStyle = userColor ? ` style="color:${userColor}"` : "";
  const latestHtml = latest
    ? `<a class="rp-cat-latest" href="${escapeHtml(latest.url)}">
        ${avatarHtml(latest.avatarTemplate, 36)}
        <span class="rp-cat-latest-info">
          <span class="rp-cat-latest-title">${escapeHtml(latest.title)}</span>
          <span class="rp-cat-latest-meta"><span class="rp-cat-latest-user"${userStyle}>${escapeHtml(
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
        <span class="rp-cat-count-number">${cat.rpPostCount ?? cat.post_count ?? cat.topic_count ?? 0}</span>
        posts
      </span>
      ${latestHtml}
    </div>`;
}

export function sectionHtml(label, children) {
  const rows = children.map(rowHtml).join("");
  return `<div class="rp-cat-section">
      <div class="rp-cat-section-header">${escapeHtml(label)}</div>
      <div class="rp-cat-section-body">${rows}</div>
    </div>`;
}

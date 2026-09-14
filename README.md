# Roleplay Project — Discourse theme

A dark FiveM/GTA roleplay community theme built with native Discourse theme
APIs (plugin-outlet connectors + `apiInitializer`, no core edits).

## Folder structure

```
roleplay-project-theme/
├── about.json
├── settings.yml
├── common/
│   └── common.scss
└── javascripts/discourse/
    ├── api-initializers/
    │   └── rp-init.js                 # marks parent categories as section headers
    └── connectors/
        ├── home-logo-contents-before/
        │   ├── rp-brand.js
        │   └── rp-brand.hbs           # custom logo mark + "Roleplay"/"Project"
        ├── header-icons/
        │   ├── rp-nav.js
        │   └── rp-nav.hbs             # UCP / Forums / Staff / Events / Shop / Thread Builder
        └── above-main-container/
            ├── rp-topbar.js / .hbs    # Home link + search trigger bar
            └── rp-sidebar.js / .hbs   # Server Status / Time / Weather widgets
```

## Installation

1. Zip the `roleplay-project-theme` folder (zip the *contents*, so `about.json`
   is at the root of the archive), or push it to a public/private git repo.
2. In Discourse: **Admin → Customize → Themes → Install** → "From a local
   file" (upload the zip) or "From a git repository" (paste the repo URL).
3. Set it as the **default theme** for your users, or let people select it
   manually if you keep your current theme as default.
4. Open **Admin → Customize → Themes → Roleplay Project → Settings** and
   configure the values in the next section.

### One required core setting

For the category list to render as the row-based table this theme restyles
(icon + name + description on the left, topic count in the middle, latest
topic on the right), set the site setting:

- **Admin → Settings → desktop category page style** → choose the plain
  **"categories"** table-style option (not "boxes").

### Recommended category setup (to match the screenshots exactly)

- Create parent categories **Announcements** and **Community** (no need to
  put topics directly in them) — the theme automatically renders any
  category that has subcategories as a bare section-header bar, using real
  category data (see `rp-init.js`).
- Create their subcategories: **Server Announcements**, **Patch Notes**,
  **Scheduled Maintenance** under Announcements; **Introductions**,
  **General Discussion**, **Suggestions** under Community.
- Set **Category Style** (Admin → Settings → category style) to **"icon"**
  and pick a FontAwesome icon + color per category in each category's
  settings — this is what renders the round icon badge next to the name.

## Theme settings reference

| Setting | Purpose |
|---|---|
| `brand_name_primary` / `brand_name_secondary` | "Roleplay" / "Project" text in the header |
| `brand_home_url` | Where the logo links to |
| `brand_icon` | FontAwesome icon name used if no logo image is uploaded |
| `brand_logo` | Optional logo image upload (overrides the icon) |
| `primary_color` / `primary_color_hover` | Accent blue used everywhere (buttons, links, icon badges) |
| `forums_url` | FORUMS nav link target (default `/categories`) |
| `ucp_url`, `staff_url`, `events_url`, `shop_url`, `thread_builder_url` | The other 5 header nav links |
| `show_custom_header_nav` | Turn off the custom nav bar entirely (escape hatch) |
| `show_custom_search_bar` | Turn off the custom Home+Search bar (escape hatch) |
| `show_sidebar_widgets` | Master switch for the whole right sidebar |
| `show_server_status` / `show_server_time` / `show_server_weather` | Toggle each widget individually |
| `server_status_api_url` | See "Connecting your APIs" below |
| `server_name`, `server_ip`, `server_platform_label`, `server_max_players` | Static fallback values for the Status widget |
| `server_status_fallback_state`, `server_status_fallback_players` | What to show when no API is configured |
| `server_time_api_url`, `server_time_utc_offset`, `server_time_zone_label` | See below |
| `server_weather_api_url`, `server_weather_location_label` | See below |
| `server_weather_mock_*` | Fallback/preview values shown when no weather API is configured |

## Connecting your APIs

Each widget polls its `*_api_url` setting on an interval and falls back
automatically (silently, no broken UI) if the URL is blank or the request
fails. All requests are plain client-side `fetch()` calls (CORS must be
enabled on your API for the browser origin your forum runs on).

**Server Status** (`server_status_api_url`, polled every 30s) — expected JSON:
```json
{ "online": true, "players": 128, "maxPlayers": 1000 }
```

**Server Time** (`server_time_api_url`, polled every 15s) — expected JSON:
```json
{ "hour": 9, "minute": 25, "second": 31, "isDay": true, "date": "2026-09-14T09:25:31Z", "tz": "BST" }
```
If left blank, the widget falls back to the visitor's browser clock offset
by `server_time_utc_offset` hours (a plain client-side clock, clearly not a
live FiveM time feed — wire up the API when you have one).

**Server Weather** (`server_weather_api_url`, polled every 10 min) — expected JSON:
```json
{
  "tempF": 82, "tempC": 28, "condition": "Overcast skies",
  "icon": "cloudy", "highF": 101, "lowF": 64, "windMph": 8, "humidity": 49,
  "hourly": [{ "label": "10am", "icon": "cloudy", "tempF": 86 }, ...]
}
```
`icon` accepts: `sunny`/`clear`, `cloudy`, `rain`, `storm`, `snow`, `clear-night`.
If left blank, the widget shows the `server_weather_mock_*` settings values
so the layout previews correctly — it is never presented as live data.

## Limitations / things to verify after install

Since this theme was built in a filesystem-only environment with no live
Discourse instance to render against, a few structural CSS selectors are
based on well-established (but not 100%-version-guaranteed) Discourse
markup:

- The category-list table restyling targets `.category-list`, `tr`, and
  column position (`:nth-child`) as a resilient fallback alongside known
  class names (`.category-title-link`, `.category-description`,
  `.badge-category`, `.latest-topic-title`, `.last-posters`). If your
  Discourse version's markup differs, spacing/columns should still mostly
  line up (rows are restyled by structural position too), but open
  devtools and compare against the screenshot after install.
- The "parent category → section header" behavior depends on category rows
  carrying a `data-category-id` attribute (long-standing in Discourse) and
  the `service:site` category list. If a future version changes this, the
  parent category simply renders as a normal row instead of a bare header
  — a graceful, non-breaking fallback.
- Native breadcrumbs on category pages are restyled in place rather than
  moved into the custom Home/Search bar, so category pages show both the
  custom bar and the native breadcrumb trail immediately below it.
- The header's center nav is positioned with `position: absolute; left:
  50%` inside `.d-header`, so it visually centers regardless of exactly
  where the `header-icons` outlet mounts in the DOM.
- The right sidebar uses the CSS `:has()` selector to lay out
  `#main-outlet-wrapper` as a flex row only when the sidebar is present.
  This is supported in all current evergreen browsers; on the rare browser
  without it, the sidebar simply stacks below the content instead of
  beside it (progressive enhancement, not broken).
- "UCP", "Staff", "Events", "Shop", "Thread Builder" are custom links you
  provide — Discourse has no native equivalent for these, so they're
  plain configurable URLs, not deep Discourse features.
- I could not run this inside an actual Discourse app in this environment
  (no Ruby/Discourse install available), so I validated `about.json` and
  `settings.yml` for syntax correctness and hand-reviewed the JS/HBS/SCSS
  against Discourse's documented theme APIs, but final visual QA on a real
  install is still recommended.

## What was implemented vs. the screenshot

- ✅ Header: dark bar, split-color brand text, 6-item center nav with icons,
  FORUMS dropdown, native right-side user/notification/message icons kept
  functional and restyled.
- ✅ Secondary bar: Home link + dark search field that opens Discourse's
  real search.
- ✅ Two-column layout (~78/22 split, 18px gap), responsive stacking.
- ✅ "Forums" title + blue "+ New Topic" button (native button, restyled).
- ✅ Category sections as dark panels with header bars for parent
  categories, rows with icon/name/description, topic count, and latest
  topic (avatar, title, user, time) — all real Discourse data.
- ✅ Category detail page (subforums panel + topic list) restyled to match.
- ✅ Server Status / Server Time / Server Weather sidebar widgets with a
  documented, swappable API layer and safe fallbacks.
- ⚠️ Nav icons are semantic FontAwesome choices (id-card, comments,
  user-shield, calendar-days, cart-shopping, layer-group) rather than
  pixel-identical copies of the screenshot's icons, which were too small/
  ambiguous to identify exactly.

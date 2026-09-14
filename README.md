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
    │   ├── rp-init.js                 # forces the 2-column layout grid + fallback parent-header marking
    │   └── rp-categories.js           # replaces the native category list with custom cards (own JSON fetch)
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

### No core "category page style" setting required

Earlier versions of this theme restyled whatever Discourse's native category
list rendered, which meant the result depended on the site's **desktop
category page style** setting matching what the CSS expected. That setting
is no longer relevant: `rp-categories.js` fetches category + latest-topic
data directly from Discourse's own `/categories.json` and `/c/{id}.json`
public JSON endpoints and renders the theme's own cards, so the result looks
identical no matter which native list style your site has configured. If
that fetch ever fails for any reason, the native list is shown again
untouched rather than leaving a blank page.

### Recommended category setup (to match the screenshots exactly)

- Create parent categories **Announcements** and **Community** (no need to
  put topics directly in them) — any category that has subcategories
  automatically renders as a bare section-header bar with its children as
  full rows beneath it, using real category data.
- Create their subcategories: **Server Announcements**, **Patch Notes**,
  **Scheduled Maintenance** under Announcements; **Introductions**,
  **General Discussion**, **Suggestions** under Community.
- Category badges use each category's own configured **color** (Admin →
  Categories → [category] → color) as a circular badge with the category's
  first letter — no icon-style site setting required.

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

This theme was built and syntax-checked in a filesystem-only environment
with no live Discourse instance to render against, so a few things are
worth verifying on your actual install:

- The **2-column layout** is enforced by `rp-init.js`, which physically
  moves `#main-outlet` and `.rp-sidebar` into a wrapper (`#rp-layout-row`)
  it creates and controls itself — this was changed from an earlier
  approach that assumed a specific native Discourse wrapper element, which
  turned out to be wrong on a live install and produced a broken layout.
  Anchoring on `#main-outlet`'s id (one of the most stable ids in Discourse)
  instead of a guessed wrapper class is deliberately more conservative.
- The **category cards** on the categories index are rendered entirely by
  `rp-categories.js` from `/categories.json` + `/c/{id}.json`, independent
  of the site's native list style/markup. This trades a small amount of
  extra network calls (one per category, to fetch its latest topic) for
  being immune to Discourse markup/version differences. If your forum has
  many categories (dozens+), consider this before relying on it as-is.
- The per-category topic list page (e.g. "Server Announcements") still uses
  the native Discourse topic list, restyled via CSS class names
  (`.topic-list`, `.category-list` for the "Subforums" box) — those class
  names are the same educated-guess-but-unverified kind as before. If they
  don't match on your version, that specific page degrades to a mostly
  unstyled dark list rather than breaking.
- Native breadcrumbs on category pages are restyled in place rather than
  moved into the custom Home/Search bar, so category pages show both the
  custom bar and the native breadcrumb trail immediately below it.
- `.discovery-hero` and `.navigation-container` (the welcome banner and the
  Categories/Latest tab switcher) are hidden by class name as given — if a
  future Discourse version renames either, they'd simply reappear rather
  than something breaking.
- The header's center nav is positioned with `position: absolute; left:
  50%` inside `.d-header`, so it visually centers regardless of exactly
  where the `header-icons` outlet mounts in the DOM.
- "UCP", "Staff", "Events", "Shop", "Thread Builder" are custom links you
  provide — Discourse has no native equivalent for these, so they're
  plain configurable URLs, not deep Discourse features.
- I could not run this inside an actual Discourse app in this environment
  (no Ruby/Discourse install available), so please hard-refresh and check
  the browser console after every update — that's how we caught and fixed
  the last two rounds of bugs (a `this`-binding error and two deprecated
  template APIs) quickly.

## What was implemented vs. the screenshot

- ✅ Header: dark bar, split-color brand text, 6-item center nav with icons,
  FORUMS dropdown, native right-side user/notification/message icons kept
  functional and restyled.
- ✅ Secondary bar: Home link + dark search field that opens Discourse's
  real search.
- ✅ Two-column layout (~78/22 split, 18px gap), responsive stacking.
- ✅ "Forums" title + blue "+ New Topic" button (native button, restyled).
- ✅ Category sections as dark panels (`#161b22` bg, `#21262d` border,
  `8px` radius) with header bars for parent categories, rows with
  icon/name/description, topic count, and latest topic (avatar, title,
  user, time) — rendered from real Discourse data via the public JSON API,
  independent of the site's native list style.
- ✅ Category detail page (subforums panel + topic list) restyled to match.
- ✅ Server Status / Server Time / Server Weather sidebar widgets with a
  documented, swappable API layer and safe fallbacks.
- ✅ Native "welcome back" hero banner and Categories/Latest tab switcher
  hidden to match the reference (which has neither).
- ⚠️ Nav icons are semantic FontAwesome choices (id-card, comments,
  user-shield, calendar-days, cart-shopping, layer-group) rather than
  pixel-identical copies of the screenshot's icons, which were too small/
  ambiguous to identify exactly.

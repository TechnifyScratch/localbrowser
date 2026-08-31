# Local

Local is a deliberately small, local-first browser for macOS. It uses Electron's Chromium engine for real web compatibility while keeping Local-owned browser state on the Mac.

Local 0.18 opens with a short, motion-sensitive wordmark sequence: the black Local mark resolves into Local’s warm-to-violet-to-blue accent before the browser surface fades in. The sequence keeps webpage views detached until it completes so restored websites cannot cover the launch presentation. Extension pin controls use explicit upright pinned and crossed-out unpinned symbols rather than rotating one ambiguous icon.

## Run it

Requirements: macOS, Node.js 20 or newer, and npm.

```bash
npm install
npm run dev
```

Build the production app resources and type-check the complete project:

```bash
npm run build
```

Create a macOS DMG in `release/`:

```bash
npm run package
```

Architecture-specific packages are also available:

```bash
npm run package:arm64
npm run package:x64
npm run package:universal
```

## Updates and GitHub Releases

Local includes a consent-based macOS updater. Automatic checks are off by default, checks go directly from the Mac to GitHub Releases, update downloads require confirmation, and installation requires a second confirmation. The updater does not receive browser history, searches, tabs, bookmarks, or a Local account identifier.

Developer ID-signed builds use the normal in-place relaunch flow. Unsigned builds instead download the matching DMG to the Mac’s Downloads folder, verify its SHA-512 digest against `latest-mac.yml`, and offer to open it. The user still replaces Local in Applications manually, and this fallback does not bypass or weaken Gatekeeper.

Updates are published from [TechnifyScratch/localbrowser](https://github.com/TechnifyScratch/localbrowser). Public releases should include these five artifacts, which the packaging command generates together:

```text
Local-<version>-<arch>.dmg
Local-<version>-<arch>.dmg.blockmap
Local-<version>-<arch>-mac.zip
Local-<version>-<arch>-mac.zip.blockmap
latest-mac.yml
```

Normal packaging never uploads anything:

```bash
npm run package:arm64
```

Publish a tagged release with a GitHub token that can write releases:

```bash
GH_TOKEN=your_token npm run release:arm64
```

Increment the version in `package.json` before each release. Existing installations will then discover the newer GitHub Release from Settings → Updates. Unsigned installations fetch the DMG; signed installations use the ZIP for in-place updates. Keep every generated update artifact attached to the release.

The unsigned development DMG can be opened locally. Public distribution requires an Apple Developer ID Application certificate plus notarization credentials. `electron-builder` will use the standard signing environment variables when they are supplied. The bundle ID is `com.local.browser`, the product name is `Local`, and the installed bundle is `Local.app`.

## Privacy model

Local has no application backend, accounts, analytics, telemetry SDK, ad SDK, cloud database, or sync service. Its settings, history, bookmarks, and session list are stored in a permission-restricted JSON file under Electron's macOS application-data directory. Cookies, cache, and other website storage live in Chromium's on-device `persist:local` partition. When enabled or manually requested, update checks communicate with GitHub Releases and therefore expose ordinary network metadata such as the IP address and user agent to GitHub; no Local browsing data is included.

Collections and homepage preferences use that same local JSON store. Today is derived locally from recent history and bookmarks, removes duplicate URLs, and deliberately excludes search-result pages. Its image previews are small screenshots captured locally from pages while the user is already viewing them; they are capped and stored on the Mac with history. Opening a new tab does not fetch a feed, upload history, or call a recommendation service.

Local’s basic All view can request DuckDuckGo’s public HTML results directly from the Mac and render sanitized result text in Local’s own interface. Search queries still leave the device and are sent to the named provider; they never pass through a Local server.

Images use Wikimedia Commons' anonymous public API and work without an account, API key, Local backend, or paid service. Local requests matching files directly from the Mac and shows the creator and license metadata returned by Commons. This is a freely licensed/public-media catalog, not a complete whole-web image index. Opening a result goes to its Commons description page so full attribution and reuse terms remain available.

Selecting an image opens a Local-owned preview panel rather than immediately leaving the results page. The panel supports previous/next keyboard navigation, Escape to close, a larger preview, local bookmarking, and a direct link to the canonical Commons source page.

Videos, News, Forums, and Shopping require no account or API key. Videos read the public, server-rendered YouTube results page without executing its scripts and fall back to anonymous Wikimedia Commons video search if that page is unavailable. News reads Google News's public RSS feed. Forums uses anonymous, key-free Stack Exchange search and selects Stack Overflow or Super User based on the query. Shopping is assembled entirely on-device as direct searches across several major retailers, so current products, prices, shipping, and availability are shown only after the user chooses a store. Missing metadata stays missing rather than being fabricated.

These are lightweight public-source verticals, not licensed commercial search indexes. Coverage can therefore be less complete than a paid structured-search service, and public page markup may change. Queries leave the Mac for the provider named beneath each result set but never pass through a Local server. The Shopping tab does not make a network request until the user opens a retailer.

The All view includes an optional-looking but always local Overview assembled with deterministic extractive scoring from the returned result snippets. It does not call an AI API, download a model, invent facts, or claim to be generative AI. Its contributing result sources and an accuracy caveat are shown directly in the interface.

For searches whose top Wikidata entity is explicitly classified as a human, Local can show a compact person panel. It requests the public Wikipedia and Wikidata APIs directly from the Mac, shows only returned descriptions, introductory text, imagery, and structured facts, and links to the source article. Local does not infer whether someone is a person, invent missing facts, or send this data through a Local service. This means an All search may send its query to both the named web-search provider and Wikimedia.

Tabs can be pinned, reordered within pinned or regular sections, duplicated, closed in groups, and reopened from an in-memory recently-closed list. Dragging an inactive web tab onto the active web tab opens both in an instant two-pane split; either pane can take focus and toolbar commands follow the focused pane. The split opens and closes with bounds-only motion—page opacity is never animated. Pinned state and tab order are included in optional local session restoration; the temporary split arrangement is not restored after restart.

When a page exposes a favicon, Local attempts to normalize it to a small PNG while that page is open and stores it with bookmarks for the bookmarks bar. Formats macOS cannot decode fall back to the website-provided favicon URL, which means showing that saved icon may make an ordinary direct request to that website or its asset host. Favicons are never proxied through or uploaded to a Local server.

The toolbar’s puzzle-piece button opens an anchored extension popover above webpage content. AdBlocker can be pinned beside it for direct access, and both pin state and protection state persist locally. “Manage extensions” opens the full page at `local://extensions`. There is no marketplace or remote extension catalog.

Local 0.17 includes one built-in extension, AdBlocker. It is enabled by default and can be paused from its toolbar panel or `local://extensions`. A compiled ad, privacy, and annoyance ruleset ships inside the application, so Local does not contact a filter-list service during browser startup or send visited URLs to a Local server. Network rules cancel matching ad and tracking subresources before they load. Cosmetic rules and bundled filter-list scriptlets remove many leftover ad containers and cookie notices. The switch is stored in Local’s on-device settings; reload existing pages after changing it.

AdBlocker uses the MPL-2.0 `@ghostery/adblocker` engine and an offline snapshot generated from its documented full preset, including EasyList, EasyPrivacy, cookie-notice lists, Peter Lowe’s list, and selected [uBlock Origin](https://github.com/gorhill/uBlock) lists. It is not presented as the official uBlock Origin extension: Electron supports only a subset of Chrome extension APIs, and the official extension itself is GPL-3.0. Local adds a document-start YouTube cleanup layer for dynamic first-party ad surfaces that ordinary network rules miss. YouTube changes its delivery frequently, so Local still does not claim permanent or complete YouTube ad blocking. Notices ship beside the engine in `adblocker-NOTICE.txt`; rules update with Local rather than through a background list service.

Tab context and overview menus are native Electron/macOS menus rather than webpage-layer popovers. This keeps them above Chromium webpage content regardless of the active site's stacking contexts or embedded browser view.

Private windows use a unique, in-memory-style non-persistent Chromium partition. Local does not add their pages to history or session restore, and it clears that partition when the private window closes.

Privacy defaults include:

- incoming and outgoing third-party cookie suppression, configurable in Settings (first-party cookies remain available for logins and carts);
- Global Privacy Control (`Sec-GPC: 1`) and Do Not Track (`DNT: 1`) request signals;
- removal of a conservative list of common campaign parameters during top-level navigation;
- explicit prompts for camera, microphone, notifications, and location;
- disabled Chromium features for translation, media routing, component updates, optimization hints, and domain reliability reporting;
- no Node.js access or Local preload APIs in web pages.

## Important limitations

Local cannot make browsing traffic local. Websites, search providers, CDNs, DNS resolvers, downloads, and embedded resources communicate with their respective servers. Private mode only means Local avoids retaining that window's session; it does not hide activity from websites, an ISP, an employer, a school, device administrators, or network administrators.

Electron bundles Chromium. Although Local disables several unneeded background services, Chromium is a large evolving dependency and this project does not claim to have eliminated every possible Chromium-originated network request. Third-party cookie suppression is implemented at the request and response-header layers; it is intentionally conservative and is not a complete anti-fingerprinting system. First-party cookies remain enabled because blocking all cookies would break sign-in, carts, and many ordinary sites.

Downloads use Chromium's normal local download flow. Certificate validation and the operating system's network stack remain in effect. The update client and GitHub release workflow are implemented; unsigned builds use a verified-DMG fallback, while seamless in-place macOS updates still require Developer ID signing and Apple notarization. A full history/bookmarks UI and universal-binary release automation remain production follow-ups rather than hidden claims in V1.

## Structure

```text
src/
  main/       window lifecycle, commands, tabs, permissions, downloads
  preload/    narrow validated bridge for Local's own UI
  renderer/   React interface, pages, components, and styles
  privacy/    address resolution and request privacy rules
  storage/    (persistence is currently centralized in main/storage.ts)
  shared/     IPC-facing types
build/        icon, entitlements, and packaging resources
```

Web pages are treated as untrusted: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no remote module, no web-page preload, a narrow IPC surface, protocol checks, and a restrictive CSP for Local's own renderer.

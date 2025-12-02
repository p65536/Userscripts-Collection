# Changelog

## [2.0.0] - 2025-12-03
- **New Features**
  - Added a new **Settings Menu** (accessible via the script manager) to customize preferences directly within the UI.
  - Users can now configure "custom filename templates", toggle the "Open in New Tab" button, and enable "Show on Hover" mode.
- **Fixes**
  - Fixed a critical issue where download buttons disappeared following a major RedGIFs site layout update.
  - Updated detection logic to correctly identify videos in the new Grid and Preview layouts.
  - Improved filtering to prevent buttons from incorrectly appearing on ads or live camera elements.
- **Core Changes**
  - Implemented a robust `ConfigManager` to handle setting storage and validation safely.
  - Enhanced security by hardening DOM creation utilities and adding support for strict Content Security Policies (CSP).
  - Refactored the internal logging system for better error reporting and debugging.

## [1.9.0] - 2025-11-26
- **Feat: Improved "Open in New Tab" button behavior.**
  - The button is now a standard link (`<a>` tag), restoring native browser behaviors.
  - You can now use **Middle-Click** or **Ctrl+Click** to open videos in a background tab without switching focus.
- **Feat: Added customization options (User Settings).**
  - **Hover Mode:** Added a `showOnlyOnHover` setting to hide buttons by default and only show them when hovering over the video.
  - **Toggle Button:** Added an option to completely disable the "Open in New Tab" button if you only want the download function.
  - *(Note: These settings are configurable by editing the script code directly).*

## [1.8.0] - 2025-11-21
- **Feat: Added customizable filename templates.**
  - Users can now customize the naming convention for downloaded videos by editing the `FILENAME_TEMPLATE` variable in the script.
  - Supports placeholders `{user}`, `{date}`, and `{id}` (Default: `{user}_{date}_{id}`).
  - Includes smart sanitization to ensure filenames remain clean (e.g., no double underscores) even if some video metadata is missing.
  - **Note:** Since this configuration is defined within the script, updating the script will reset the template to the default. You will need to re-apply your custom format after each update.

## [1.7.0] - 2025-11-19
- **Feat: Implemented dynamic, metadata-rich filenames.**
  - The downloaded filename format has been updated from a static `{id}-hd.mp4` to a dynamic `{userName}_{date}_{id}` format.
  - This allows for better organization and sorting of downloaded files.
- **Feat: Enabled dynamic file extension detection.**
  - Removed the hardcoded `.mp4` extension.
  - The script now safely extracts the actual file extension from the source URL, ensuring the saved file always has the correct type.

## [1.6.0] - 2025-11-16
- **Feat: Added download button directly to video thumbnails.**
  - A download button (identical in function to the preview button) is now added to all video tiles in grid/feed views.
  - This allows for one-click downloading without needing to open the video preview first.
- **Feat: Improved download error reporting.**
  - Error messages are now more specific. The script will distinguish between:
    - **404 Not Found** (e.g., video was deleted)
    - **403 Forbidden** (e.g., access was denied)
    - **Other Errors** (e.g., network failure or site update)

## [1.5.0] - 2025-11-08
- **Refactor: Changed API interception method from `XHR/Fetch` to `JSON.parse`.**
  - This is a major internal refactor to improve **resilience** against future site updates (e.g., changes to their internal API structure, or moves to gRPC/WebSocket).
  - The script is now less likely to break when the site updates its network request methods, as it monitors the data *after* it has been fetched.
- **Perf: Simplified DOM initialization logic.**
  - Removed a redundant "safety net" scan (`querySelectorAll`) during page load. Testing confirmed the primary `Sentinel` (CSS animation observer) is fully reliable for detecting existing elements.
- **Chore: Internal code cleanup and documentation.**
  - Improved JSDoc comments, type definitions, and encapsulated API logic within the `ApiManager` for better maintainability.

## [1.4.2] - 2025-11-07
- **Feat: Added blocking for in-feed "Boosted" ads.**
  - Hides the ad containers that contain `.metaInfo_isBoosted`.

## [1.4.1] - 2025-11-06
- **Feat: Expanded annoyance blocking for in-feed modules.**
  - Added new CSS rules to `AnnoyanceManager` to hide suggested/promotional content blocks that appear within the video feeds.
  - These rules apply across desktop and mobile, covering the "For You", "Trending", and "Niches" pages.
  - **Hides the following modules:**
    - "Suggested Niches" / "Trending Niches"
    - "Suggested Creators" / "Trending Creators"
    - "Onlyfans creators" (mobile feed)
    - "Niches you might also like" (on niche-specific pages)

## [1.4.0] - 2025-11-03
- **Feat: Introduced `AnnoyanceManager` to block site ads and clutter.**
  - This version adds a dedicated module for managing annoyances, moving all logic out of the main style definitions.
- **Feat: Added new ad/annoyance blocking rules:**
  - Hides the top information banner (`.InformationBar`).
  - Hides in-feed "Trending" panels and other injections (`.injection`).
  - Hides the external site buttons in the main header (Cams and Live) (`.topNav .aTab`).
  - Hides the desktop ad sidebar (`.OnlyFansCreatorsSidebar`) using `visibility: hidden` to prevent the main feed layout from shifting.
- **Fix: Improved blocking for in-feed video ads (`.GifPreview.VisibleOnly`).**
  - The old CSS rule was failing on mobile. This is now handled by a robust JavaScript-based method.
  - This new method correctly detects platform (mobile / desktop) to avoid conflicts that caused black screens or UI breaks during navigation.
- **Fix: Adjusted button positions on mobile.**
  - The Download and Open buttons no longer overlap the native RedGIFs header icons on mobile displays.
- **Fix: Fixed "HD URL not found in cache" error on direct links.**
  - This bug occurred when opening a video directly (e.g., from Reddit), as the API response format was different. The script now correctly parses both feed APIs and direct link APIs.
- **Refactor:** Internal code cleanup related to UI initialization.

## [1.3.0] - 2025-11-02  
- **Architectural Overhaul**: The script no longer makes its own API calls or uses guest tokens, it now relies entirely on the site’s authenticated requests.  
  - **Compatibility Note**: This version's API interception method (which wraps `window.fetch` and `window.XMLHttpRequest`) may conflict with other userscripts that attempt to modify the same functions.
- **Cache Miss Handling**: The script is now "cache-only" and removes the legacy API fallback. This is an intentional design choice to fully leverage the performance of the interception model. If a URL is not in the cache (e.g., a rare "fast click" race condition), the script will immediately show an error toast ("HD URL not found in cache..."), which self-corrects upon a second click.
- **Instant Downloads:** HD video URLs are now pre-cached from the site’s own API, so downloads start immediately.  
- Other internal code refactorings.

## [1.2.0] - 2025-10-31
- Added
  - **Robust Authentication**: Implemented JWT token decoding to manage expiry (`exp`).
  - **Proactive Refresh**: The script now proactively refreshes tokens before they expire.
  - **401 Retry**: Adds automatic retry logic (1 attempt) if an API request fails with a `401 Unauthorized` error.
  - **API Timeout**: Introduces an `API_TIMEOUT` for all API requests to prevent them from hanging.
  - **Race Condition Prevention**: Prevents multiple simultaneous requests for a new token.
  - **Manual Download Cancellation**: Users can now click the spinner icon to cancel a hanging download.
  - **Ad Hiding**: Added a CSS rule to hide advertisement containers (`.GifPreview.VisibleOnly`) from feeds.
- Changed
  - **Performance**: All SVG icons are now pre-cached on script load and cloned (`cloneNode(true)`) for faster button rendering.
  - **DOM Stability**: Updated the selector for video preview containers (`VIDEO_CONTAINER_SELECTOR`) from a class name (`.GifPreview`) to an ID prefix (`[id^="gif_"]`) for better resilience against site structure changes.
- Removed
  - **Video Cache**: Removed the previous video info cache (`#videoCache`) to simplify state and rely on the new robust fetching logic.
- Other internal code refactorings.

## [1.1.0] - 2025-10-24
- Added
  - **"Open in New Tab" Button**: Added a new button on both video thumbnails and individual players to open the content directly in a new tab.
- Changed
  - **Performance**: Replaced the DOM monitoring system with `Sentinel` for faster performance and responsiveness.
  - **Download Button Location**: Moved the download button from the general toolbar to the top-right corner of each video player for more intuitive access.
- Removed
  - Removed dead and unused code following extensive refactoring.
- Fixed
  - **SPA Navigation**: Improved cache handling in the `ApiManager` to ensure the script functions correctly as users navigate through the site.

## [1.0.1] - 2025-10-24
- Quick patch for site structure changes.

## [1.0.0] - 2025-08-12
- First public release
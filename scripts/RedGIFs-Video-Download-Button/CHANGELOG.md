# Changelog

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
# Changelog

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
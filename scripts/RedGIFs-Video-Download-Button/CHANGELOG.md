# Changelog

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
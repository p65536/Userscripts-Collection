# Changelog

## [1.1.2] - 2025-10-25  
- **Fixed:**  
  - Updated the tooltip text for the "Hide Shorts" toggle. The old text incorrectly stated that a page reload was required to show Shorts again. The feature updates dynamically via CSS, so a reload is not needed.

## [1.1.1] - 2025-10-25  
- **Fixed:**  
  - Removed the brief flash of the Shorts player by executing the redirect at `document-start`.  
- **Changed:**  
  - Refactored the initialization flow into a two-stage, promise-based system for stable loading.  
  - Event listeners are now registered earlier, and UI initialization waits until both the DOM and config are ready.  
  - Removed the outdated note about the Shorts flash from the settings panel.  

## [1.1.0] - 2025-10-25
- Changed
  - **Performance (Hide Shorts)**: The "Hide Shorts" feature now relies exclusively on CSS rules (`display: none`) instead of JavaScript DOM manipulation. This significantly improves performance by eliminating all JS-based DOM scanning.
- Fixed
  - **UX (Redirect Shorts)**: Fundamentally improved the redirect logic to prevent the "flash" (brief appearance) of the Shorts player during in-page navigation.
- Other refactorings

## [1.0.0] - 2025-08-22
- First public release
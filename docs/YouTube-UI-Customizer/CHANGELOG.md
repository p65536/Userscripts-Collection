# Changelog

## [1.3.0] - 2025-12-07
- **UI & Experience**
  - **New Settings Interface:** Replaced the floating on-screen button with a clean modal overlay. Settings are now accessed via the script manager's menu command (e.g., Tampermonkey menu).
  - **Accessibility:** Added keyboard support (ESC to close) and improved focus handling within the settings menu.
- **Core Changes**
  - **API Migration:** Migrated to the modern, asynchronous `GM.` API standard, ensuring better compatibility with current script managers.
  - **Architecture:** Refactored the internal core (EventBus, Logger) to improve overall script stability.
- **Fixes & Optimizations**
  - **Resource Cleanup:** Implemented strict lifecycle management to prevent memory leaks and ensure UI elements and styles are fully removed upon script reload.
  - **Storage & Security:** Hardened configuration handling to prevent security vulnerabilities and automatically clean up deprecated settings from storage.

## [1.2.1] - 2025-11-20
- **Fixes & Improvements**
  - Improved the reliability of **Shorts Redirection**. The feature now correctly handles shared links (e.g., `?feature=share`) and other complex URLs without losing parameters.

## [1.2.0] - 2025-11-19
- **New Features**
  - Added a new setting to **Hide "Explore more topics"**.

## [1.1.3] - 2025-11-19
- **Improvements**
  - Extended the **Hide YouTube Shorts** feature to cover search results pages.

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
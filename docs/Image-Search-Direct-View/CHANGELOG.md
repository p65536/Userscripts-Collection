# Changelog

## [1.3.0] - 2026-07-22
- **Core Changes**
  - [Google] Added direct action buttons to the main preview image inside Google Images' side detail panel.
  - [Bing/DDG] Omitted preview panel button injection for Bing and DuckDuckGo, as both search engines already feature native controls to view images and visit source pages.

## [1.2.1] - 2026-06-30
- **Core Changes**
  - [Icon] Embedded the script icon as an inline Data URI to guarantee asset rendering and eliminate external network dependencies.

## [1.2.0] - 2026-06-29
- **Core Changes**
  - Fixed a display bug where the settings modal was partially hidden behind sticky page headers (such as on Google Image Search) by increasing its global stacking priority.
  - Improved theme synchronization to ensure button styles and configuration variables refresh instantly when transitioning between different search networks.
  - Optimized navigation tracking and resource disposal to eliminate memory leaks and performance degradation during continuous browsing sessions.
  - Mitigated temporary browser lockups during slow page loads by optimizing background polling and processing execution.
  - Prevented interface flickering and redundant element scanning by disabling unnecessary URL hash tracking during updates.
  - Standardized settings interface layouts and button color palettes across the extension into unified modern formats.
  - Mitigated browser-level Mixed Content silent hangups on `http://` images by automatically bypassing Blob network streams into a security-isolated Direct opening workflow.
  - Upgraded Direct mode navigation pipelines to fully honor user-defined Referrer Policy configurations via context-cloned element interactions, while keeping middle-click background tracking fully functional.
  - Improved UI responsiveness by instantly clearing active toast notifications the moment the search page shifts to a background tab.
- **Site-Specific Fixes**
  - [Google] Resolved an issue on legacy page layouts where strict site security policies (CSP) blocked dynamic background style adjustments.
  - [DuckDuckGo] Enhanced panel integration mechanics to ensure the detail view closes reliably even after website layout updates.
  - [Bing] Added full compatibility for the new "New Version" (VNext) image search interface layout.

## [1.1.1] - 2026-02-08
- **Fixes**
  - **[Google]** Fixed an issue where the script correctly handled the new layout but incorrectly logged "missing data-docid" warnings.
  - **[Google]** Optimized the internal logic to prioritize the new Google Images layout, ensuring smoother execution.

## [1.1.0] - 2026-02-08
- **Fixes**
  - **[Google]** Resolved compatibility issues caused by recent changes to the Google Image Search HTML structure, restoring button functionality.

## [1.0.1] - 2026-01-08
- **Core Changes**
  - **[Stability]** Fixed a potential issue where internal data errors were silently ignored during processing. The system now strictly validates data integrity to prevent unexpected behavior or settings corruption.

## [1.0.0] - 2026-01-04
- First public release
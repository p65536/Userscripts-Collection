# Changelog

## [1.1.0] - 2025-10-25
- Changed
  - **Performance (Hide Shorts)**: The "Hide Shorts" feature now relies exclusively on CSS rules (`display: none`) instead of JavaScript DOM manipulation. This significantly improves performance by eliminating all JS-based DOM scanning.
- Fixed
  - **UX (Redirect Shorts)**: Fundamentally improved the redirect logic to prevent the "flash" (brief appearance) of the Shorts player during in-page navigation.
- Other refactorings

## [1.0.0] - 2025-08-22
- First public release
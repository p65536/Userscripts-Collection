# Userscripts-Collection

![license](https://img.shields.io/badge/license-MIT-green)
![userscript](https://img.shields.io/badge/userscript-Tampermonkey-blueviolet)

A collection of simple, single-purpose userscripts for various websites.

*Note: This repository contains code only. No explicit media is included.*

---

## Recent Updates

### 2025/12/21
- Updated `RedGIFs Video Download Button` (v2.0.0 -> v2.1.0)  

### 2025/12/07
- Updated `YouTube UI Customizer` (v1.2.1 -> v1.3.0)  

### 2025/12/03
- Updated `RedGIFs Video Download Button` (v1.9.0 -> v2.0.0)  

### 2025/11/26
- Updated `RedGIFs Video Download Button` (v1.8.0 -> v1.9.0)  

### 2025/11/21
- Updated `RedGIFs Video Download Button` (v1.7.0 -> v1.8.0)  

---

## Scripts in This Project

This section lists the userscripts available in this collection.

### 1. YouTube UI Customizer

A script that enhances your YouTube experience. You can customize the video grid layout by adjusting thumbnails per row, completely hide Shorts content, and automatically redirect the Shorts player to the standard video player.

> Note: This script is designed specifically for the **desktop** YouTube site (www.youtube.com) and does not support the mobile version (m.youtube.com).

| Platform | GitHub | Greasy Fork | Version | Last Updated | Changelog |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **YouTube** | [![Download](https://img.shields.io/badge/Download-blue?style=flat-square&logo=download)](https://raw.githubusercontent.com/p65536/Userscripts-Collection/main/scripts/YouTube-UI-Customizer/YouTube-UI-Customizer.user.js) | [![Greasy Fork](https://img.shields.io/badge/Install-green?style=flat-square&logo=greasyfork)](https://greasyfork.org/en/scripts/546668-youtube-ui-customizer) | 1.3.0 | 2025/12/07 | [View](./docs/YouTube-UI-Customizer/CHANGELOG.md) |

<details>
  <summary>Getting Started (Click to expand)</summary>

> Access the settings via your userscript manager's menu:
> 
> 1.  Open the **Tampermonkey** (or equivalent) menu in your browser.
> 2.  Select **YouTube UI Customizer Settings**.
> 3.  Configure your preferences in the modal window.
> 
> ![Menu](./docs/YouTube-UI-Customizer/images/settings_menu.png)  
> ![Panel](./docs/YouTube-UI-Customizer/images/settings_panel.png)

</details>

---

### 2. RedGIFs Video Download Button

This script enhances your RedGIFs experience by adding convenient buttons to each video:
1.  **A download button** for one-click downloads of the HD version.
2.  **An "Open in New Tab" button** to quickly view the video on its own page.

It also features **customizable user settings** (e.g., Hover Mode) and a powerful **Annoyance & Ad Remover** to clean up the UI.

| Platform | GitHub | Greasy Fork | Version | Last Updated | Changelog |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **RedGifs** | [![Download](https://img.shields.io/badge/Download-blue?style=flat-square&logo=download)](https://raw.githubusercontent.com/p65536/Userscripts-Collection/main/scripts/RedGIFs-Video-Download-Button/RedGIFs-Video-Download-Button.user.js) | [![Greasy Fork](https://img.shields.io/badge/Install-green?style=flat-square&logo=greasyfork)](https://greasyfork.org/en/scripts/545472-redgifs-video-download-button) | 2.1.0 | 2025/12/21 | [View](./docs/RedGIFs-Video-Download-Button/CHANGELOG.md) |

<details>
  <summary>Getting Started (Click to expand)</summary>

> Access the settings via your userscript manager's menu:
> 
> 1.  Open the **Tampermonkey** (or equivalent) menu in your browser.
> 2.  Select **RedGIFs Video Download Button Settings**.
> 3.  Configure your preferences in the modal window.
> 
> ![Menu](./docs/RedGIFs-Video-Download-Button/images/settings_menu.png)  
> ![Panel](./docs/RedGIFs-Video-Download-Button/images/settings_panel.png)

</details>

<details>
  <summary>A Note on Annoyance & Ad Remover feature (Click to expand)</summary>

> Please consider the Annoyance & Ad Removal a "best-effort" bonus feature. The script's core purpose remains the `Download` and `Open in New Tab` buttons.
> 
> This feature is tuned for the current RedGIFs site layout (as of 2025/12/03), and future site updates will likely break parts of the removal logic. While I will try to keep it functional, please understand that ongoing maintenance for this specific feature is not guaranteed, as it is secondary to the script's main functionality.

</details>

<details>
  <summary>Potential Conflict Warning (Click to expand)</summary>

> This script modifies the global `JSON.parse` function and **may conflict with other userscripts that modify the same function**.  
> If you experience page errors or downloads failing, please **temporarily disable all other userscripts active on RedGIFs** to determine if the cause is **a script conflict** or **a recent site update**.

</details>

---

## Installation

1.  Please install [Tampermonkey](https://www.tampermonkey.net/) or any userscript management tool in your browser.
2.  Click the "Download" or "Install" link for the script you wish to use.

## Updating

Open the script to be updated in the Tampermonkey dashboard and **replace the entire content** with the latest version, then save. (The Greasy Fork version updates automatically).

## Tested Environment

- These scripts are primarily developed and tested on **Firefox** with **Tampermonkey**.
- It is also confirmed to work on Chromium-based browsers, but testing on these platforms is less extensive.
- They are developed for **desktop browsers**.
- They have **not** been tested on actual mobile devices, so functionality on mobile browsers is unknown.

---

## License

This project is licensed under the MIT License.

## Author

* [p65536](https://github.com/p65536)

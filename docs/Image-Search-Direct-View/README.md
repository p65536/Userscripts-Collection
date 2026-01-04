# Image Search Direct View (ISDV)

**For downloads and changelogs, please see the [main README](../../README.md)**

---

## Overview

ISDV restores the direct "View Image" functionality to major search engines. It overlays a button on search result thumbnails that allows you to open the image directly in a new tab.

---

## Key Features

- **Direct Access**: Open high-resolution images with a single click.
- **Privacy Focused**: Configurable referrer policies to protect your privacy.
- **Advanced Fetching:** Uses smart fetching strategies (Blob/Direct) to load images from sites with strict access controls.
- **Cross-Platform**: Unified experience across Google, Bing, and DuckDuckGo.
- **Non-Intrusive**: Designed to blend into the native interface.

---

## Configuration

You can access the settings panel via the tampermonkey menu:  
**Extension Icon** > **Image Search Direct View** > **Open Settings**.

![Menu](./images/settings_menu.png)  

![Panel](./images/settings_panel.png)

### Appearance
* **Show buttons only on hover**: Reduces visual clutter by hiding buttons until you hover over an image result.
* **Show "Visit Page" button**: Toggles the visibility of the globe icon button that takes you to the hosting webpage.

### Network & Privacy
* **Fetch Strategy**: Controls how images are fetched.
    * **Auto Detect (Default)**: Checks HTTP headers first. Uses `Blob` mode (hidden URL) if forced download or anti-hotlinking is detected.
    * **Always Blob**: Always loads images as `blob:` URLs. Fast and private, but the URL in the address bar will be temporary.
    * **Always Direct**: Opens the URL directly. Zero overhead, but may fail on sites with strict hotlink protection.
* **Referrer Policy**: Controls what information is sent to the destination site.
    * **Origin Only (Default)**: Sends only the domain name. Balances privacy and compatibility.
    * **No Referrer**: Sends no referrer information. Maximum privacy, but some images may fail to load.
    * **Full URL**: Sends the full URL. Highest compatibility, but exposes your search query to the site.
* **Retry on failure**: Automatically retries with an alternative referrer policy if the initial attempt fails (e.g., if "No Referrer" fails, it tries "Origin").

### Advanced Settings
* **Blob URL Revoke Time**: Determines how long image data is kept in memory when using Blob mode. Increase this if images fail to load when viewing background tabs after a delay.

---

## Platform Specific Behaviors

Due to differences in how each search engine delivers data, ISDV behaves slightly differently on each platform:

### Microsoft Bing
* **Behavior**: **Synchronous / Instant**
* **Details**: Bing provides the high-resolution image URL directly in the page metadata. The "View Image" button is ready immediately on page load, and clicking it opens the image instantly without delay.

### DuckDuckGo
* **Behavior**: **Hybrid (Cached → Async Original)**
* **Details**:
    * **On Load**: The button is initially linked to the cached version of the image (proxied by Bing/DDG).
    * **On Click**: ISDV attempts to fetch the **original high-resolution source** in the background.
    * **Note**: You may see a "Fetching image info..." toast briefly. If the original source cannot be retrieved, it falls back to the high-quality cached version.

### Google Images
* **Behavior**: **Asynchronous / On-Demand**
* **Details**: Google does not expose the high-resolution URL in the grid view.
    * **On Click**: When you click the button, ISDV interacts with the hidden side panel to extract the original high-resolution URL.
    * **Note**: This process requires a brief network fetch ("Fetching image info...") before the new tab opens. This ensures you always get the highest quality image available.

---

## License

MIT License

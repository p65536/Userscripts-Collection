// ==UserScript==
// @name         RedGIFs Video Download Button
// @namespace    https://github.com/p65536
// @version      1.0.1
// @license      MIT
// @description  Adds a download button to the sidebar of each video on the RedGIFs site for one-click HD downloads.
// @icon         https://www.redgifs.com/favicon.ico
// @author       p65536
// @match        https://*.redgifs.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    // =================================================================================
    // SECTION: Script-Specific Definitions
    // =================================================================================

    const APPID = 'rgvdb';
    const LOG_PREFIX = `[${APPID.toUpperCase()}]`;
    const CONSTANTS = {
        SIDEBAR_SELECTOR: '.sideBar',
        VIDEO_CONTAINER_SELECTOR: '.GifPreview',
        API_URL_BASE: 'https://api.redgifs.com/v2/gifs/',
        API_AUTH_URL: 'https://api.redgifs.com/v2/auth/temporary',
        FILENAME_SUFFIX: '-hd.mp4',
        TOAST_DURATION: 3000,
        TOAST_FADE_OUT_DURATION: 300,
        ICON_REVERT_DELAY: 2000,
    };
    const BASE_ICON_PROPS = {
        xmlns: 'http://www.w3.org/2000/svg',
        height: '24px',
        viewBox: '0 0 24 24',
        width: '24px',
        fill: '#e3e3e3',
    };
    const ICONS = {
        DOWNLOAD: {
            tag: 'svg',
            props: BASE_ICON_PROPS,
            children: [
                { tag: 'path', props: { d: 'M0 0h24v24H0V0z', fill: 'none' } },
                { tag: 'path', props: { d: 'M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5z' } },
            ],
        },
        SPINNER: {
            tag: 'svg',
            props: { ...BASE_ICON_PROPS, class: `${APPID}-spinner` },
            children: [
                { tag: 'path', props: { d: 'M12,2A10,10,0,1,0,22,12,10,10,0,0,0,12,2Zm0,18A8,8,0,1,1,20,12,8,8,0,0,1,12,20Z', opacity: '0.3' } },
                { tag: 'path', props: { d: 'M12,2A10,10,0,0,1,22,12h-2A8,8,0,0,0,12,4Z' } },
            ],
        },
        SUCCESS: {
            tag: 'svg',
            props: BASE_ICON_PROPS,
            children: [
                { tag: 'path', props: { d: 'M0 0h24v24H0V0z', fill: 'none' } },
                { tag: 'path', props: { d: 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z' } },
            ],
        },
        ERROR: {
            tag: 'svg',
            props: BASE_ICON_PROPS,
            children: [
                { tag: 'path', props: { d: 'M0 0h24v24H0V0z', fill: 'none' } },
                { tag: 'path', props: { d: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z' } },
            ],
        },
    };

    // =================================================================================
    // SECTION: Execution Guard
    // =================================================================================

    window.__p65536_guard__ = window.__p65536_guard__ || {};
    if (window.__p65536_guard__[`${APPID}_executed`]) return;
    window.__p65536_guard__[`${APPID}_executed`] = true;

    // =================================================================================
    // SECTION: Logging Utility
    // =================================================================================

    const Logger = {
        log(...args) {
            console.log(LOG_PREFIX, ...args);
        },
        warn(...args) {
            console.warn(LOG_PREFIX, ...args);
        },
        error(...args) {
            console.error(LOG_PREFIX, ...args);
        },
    };

    // =================================================================================
    // SECTION: Utility Functions
    // =================================================================================

    /**
     * Creates a DOM element using a hyperscript-style syntax.
     * @param {string} tag - Tag name with optional ID/class (e.g., "div#app.container").
     * @param {Object|Array|string|Node} [propsOrChildren] - Attributes object or children.
     * @param {Array|string|Node} [children] - Children (if props are specified).
     * @returns {HTMLElement|SVGElement} - The created DOM element.
     */
    function h(tag, propsOrChildren, children) {
        const SVG_NS = 'http://www.w3.org/2000/svg';
        const match = tag.match(/^([a-z0-9-]+)(#[\w-]+)?((\.[\w-]+)*)$/i);
        if (!match) throw new Error(`Invalid tag syntax: ${tag}`);

        const [, tagName, id, classList] = match;
        const isSVG = ['svg', 'path'].includes(tagName);
        const el = isSVG ? document.createElementNS(SVG_NS, tagName) : document.createElement(tagName);

        if (id) el.id = id.slice(1);
        if (classList) el.className = classList.replace(/\./g, ' ').trim();

        let props = {};
        let childrenArray;
        if (propsOrChildren && typeof propsOrChildren === 'object' && !Array.isArray(propsOrChildren) && !(propsOrChildren instanceof Node)) {
            props = propsOrChildren;
            childrenArray = children;
        } else {
            childrenArray = propsOrChildren;
        }

        for (const [key, value] of Object.entries(props)) {
            if (key.startsWith('on') && typeof value === 'function') {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else if (value !== false && value !== null) {
                el.setAttribute(key, value === true ? '' : value);
            }
        }

        const fragment = document.createDocumentFragment();
        function append(child) {
            if (child === null || child === false) return;
            if (Array.isArray(child)) {
                child.forEach(append);
            } else {
                fragment.appendChild(child instanceof Node ? child : document.createTextNode(child));
            }
        }
        append(childrenArray);
        el.appendChild(fragment);
        return el;
    }

    /**
     * Recursively builds a DOM element from a definition object using the h() function.
     * @param {object} def The definition object for the element.
     * @returns {HTMLElement | SVGElement | null} The created DOM element.
     */
    function createIconFromDef(def) {
        if (!def) return null;
        const children = def.children ? def.children.map((child) => createIconFromDef(child)) : [];
        return h(def.tag, def.props, children);
    }

    // =================================================================================
    // SECTION: API Manager
    // =================================================================================

    class ApiManager {
        #guestToken = null;
        #videoCache = {};

        /**
         * Fetches a temporary guest token from the API if one is not already stored.
         * @returns {Promise<string>} The guest token.
         * @private
         */
        async #getGuestToken() {
            if (this.#guestToken) {
                return this.#guestToken;
            }

            const response = await fetch(CONSTANTS.API_AUTH_URL);
            if (!response.ok) {
                throw new Error(`API auth request failed with status ${response.status}`);
            }
            const responseData = await response.json();
            if (!responseData?.token) {
                throw new Error('Token not found in guest auth response.');
            }

            this.#guestToken = responseData.token;
            Logger.log('Successfully fetched guest token.');
            return this.#guestToken;
        }

        /**
         * Fetches video information from the RedGifs API, using a cache.
         * It ensures a guest token is available before making the request.
         * @param {string} videoId - The ID of the video to fetch.
         * @returns {Promise<object>} The video information object.
         */
        async getVideoInfo(videoId) {
            if (this.#videoCache[videoId]) {
                return this.#videoCache[videoId];
            }

            try {
                const token = await this.#getGuestToken();
                const response = await fetch(`${CONSTANTS.API_URL_BASE}${videoId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!response.ok) {
                    throw new Error(`API request failed with status ${response.status}`);
                }
                const responseData = await response.json();
                this.#videoCache[videoId] = responseData; // Cache the successful response.
                return responseData;
            } catch (error) {
                Logger.error(`Error fetching video info for ${videoId}:`, error);
                // Rethrow the error to be handled by the caller.
                throw error;
            }
        }
    }

    // =================================================================================
    // SECTION: Main Application Controller
    // =================================================================================

    class RedGifsDownloader {
        constructor() {
            /** @type {ApiManager} */
            this.apiManager = new ApiManager();
            /** @type {HTMLElement|null} */
            this.toastContainer = null;

            this._injectStyles();
            this._createToastContainer();
        }

        /**
         * Initializes the script by setting up a MutationObserver to watch for new content.
         */
        init() {
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.addedNodes.length > 0) {
                        this._processNodes(mutation.addedNodes);
                    }
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });

            // Initial check for any sidebars that might have loaded before the observer started.
            this._processNodes(document.body.childNodes);
            Logger.log('Initialized and observing DOM for changes.');
        }

        /**
         * Injects the necessary CSS styles into the document's head.
         * @private
         */
        _injectStyles() {
            const css = `
                .${APPID}_DL_Button {
                    background-color: red;
                    border: none;
                    border-radius: 4px;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                }
                .${APPID}-spinner {
                    animation: ${APPID}-spinner-rotate 1s linear infinite;
                    transform-origin: center;
                }
                .${APPID}-toast-container {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .${APPID}-toast {
                    padding: 12px 18px;
                    border-radius: 6px;
                    color: white;
                    font-family: sans-serif;
                    font-size: 14px;
                    box-shadow: 0 4px 12px rgb(0 0 0 / 0.15);
                    animation: ${APPID}-toast-fade-in 0.3s ease-out;
                }
                .${APPID}-toast.exiting {
                    animation: ${APPID}-toast-fade-out 0.3s ease-in forwards;
                }
                .${APPID}-toast-success { background-color: rgb(40, 167, 69); }
                .${APPID}-toast-error { background-color: rgb(220, 53, 69); }
                .${APPID}-toast-info { background-color: rgb(23, 162, 184); }

                @keyframes ${APPID}-spinner-rotate {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes ${APPID}-toast-fade-in {
                    from { opacity: 0; transform: translateX(100%); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes ${APPID}-toast-fade-out {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(100%); }
                }
            `;
            const styleElement = h('style', { type: 'text/css' }, css);
            document.head.appendChild(styleElement);
        }

        /**
         * Creates and appends the toast container to the document body.
         * @private
         */
        _createToastContainer() {
            this.toastContainer = h(`div.${APPID}-toast-container`);
            document.body.appendChild(this.toastContainer);
        }

        /**
         * Displays a toast notification.
         * @param {string} message The message to display.
         * @param {'info'|'success'|'error'} type The type of toast.
         * @private
         */
        _showToast(message, type = 'info') {
            if (!this.toastContainer) {
                Logger.error('Toast container element not found. Cannot display toast.');
                return;
            }

            const toastClass = `${APPID}-toast-${type}`;
            const toastElement = h(`div.${APPID}-toast`, { class: toastClass }, message);

            this.toastContainer.appendChild(toastElement);

            // Start the process to remove the toast after a delay.
            setTimeout(() => {
                toastElement.classList.add('exiting');

                // Set a second, final timeout to remove the element from the DOM.
                setTimeout(() => {
                    toastElement.remove();
                }, CONSTANTS.TOAST_FADE_OUT_DURATION);
            }, CONSTANTS.TOAST_DURATION);
        }

        /**
         * Processes a list of nodes to find sidebars and add download buttons.
         * @param {NodeList} nodes - The list of nodes to process.
         * @private
         */
        _processNodes(nodes) {
            nodes.forEach((node) => {
                // Ensure the node is an element and can contain other elements before querying it.
                if (node.nodeType !== Node.ELEMENT_NODE) {
                    return;
                }

                // Find all sidebars within the node that don't already have our button.
                const watchSelector = `${CONSTANTS.SIDEBAR_SELECTOR}:not(:has(.${APPID}_DL_Button))`;
                const sidebars = node.querySelectorAll(watchSelector);

                sidebars.forEach((sidebar) => {
                    this._onSidebarFound(sidebar);
                });
            });
        }

        /**
         * Handles the discovery of a new sidebar element.
         * @param {HTMLElement} sidebar - The found sidebar element.
         * @private
         */
        _onSidebarFound(sidebar) {
            const gifContainer = sidebar.closest(CONSTANTS.VIDEO_CONTAINER_SELECTOR);
            if (gifContainer && gifContainer.id) {
                // ID is typically in the format "gif_some-id"
                const videoId = gifContainer.id.split('_')[1];
                if (videoId) {
                    this._addDownloadButton(sidebar, videoId);
                }
            }
        }

        /**
         * Sets the icon for a given button.
         * @param {HTMLButtonElement} button The button element to modify.
         * @param {'DOWNLOAD'|'SPINNER'|'SUCCESS'|'ERROR'} iconName The name of the icon to set.
         * @private
         */
        _setButtonIcon(button, iconName) {
            const iconDef = ICONS[iconName];
            if (!iconDef) {
                Logger.error(`Icon "${iconName}" not found.`);
                return;
            }

            // Clear existing content
            while (button.firstChild) {
                button.removeChild(button.firstChild);
            }

            // Add new icon
            const newIcon = createIconFromDef(iconDef);
            if (newIcon) {
                newIcon.style.width = '24px';
                newIcon.style.height = '24px';
                button.appendChild(newIcon);
            }
        }

        /**
         * Updates the button's visual state and reverts it after a delay for transient states.
         * @param {HTMLButtonElement} button The button to update.
         * @param {'IDLE'|'LOADING'|'SUCCESS'|'ERROR'} state The new state.
         * @private
         */
        _updateButtonState(button, state) {
            const stateMap = {
                IDLE: { icon: 'DOWNLOAD', disabled: false },
                LOADING: { icon: 'SPINNER', disabled: true },
                SUCCESS: { icon: 'SUCCESS', disabled: true },
                ERROR: { icon: 'ERROR', disabled: true },
            };

            const { icon, disabled } = stateMap[state] || stateMap.IDLE;
            this._setButtonIcon(button, icon);
            button.disabled = disabled;

            // Revert to IDLE state after a delay for success or error states.
            if (state === 'SUCCESS' || state === 'ERROR') {
                setTimeout(() => {
                    this._updateButtonState(button, 'IDLE');
                }, CONSTANTS.ICON_REVERT_DELAY);
            }
        }

        /**
         * Creates and adds a download button to the specified sidebar.
         * @param {HTMLElement} sidebar - The sidebar element to add the button to.
         * @param {string} videoId - The ID of the video to be downloaded.
         * @private
         */
        _addDownloadButton(sidebar, videoId) {
            const button = h(`button.${APPID}_DL_Button`, {
                title: 'Download HD Video',
                onclick: (e) => this._handleDownloadClick(e, videoId),
            });

            this._setButtonIcon(button, 'DOWNLOAD');

            // Styling the button to match others in the sidebar.
            const siblingButton = sidebar.querySelector('button');
            const size = siblingButton ? window.getComputedStyle(siblingButton).height : '30px';

            // Set dynamic dimensions. Static styles are now handled by an injected stylesheet.
            Object.assign(button.style, {
                width: size,
                height: size,
            });

            const listItem = h('li.SideBar-Item', [button]);
            sidebar.appendChild(listItem);
        }

        /**
         * Handles the click event on the download button.
         * @param {MouseEvent} e - The click event.
         * @param {string} videoId - The ID of the video to download.
         * @private
         */
        async _handleDownloadClick(e, videoId) {
            e.stopPropagation(); // Prevent parent elements from handling the click.

            const button = e.currentTarget;
            if (button.disabled) return; // Prevent multiple clicks while processing

            this._updateButtonState(button, 'LOADING');
            this._showToast('Download started...', 'info');

            try {
                const videoInfo = await this.apiManager.getVideoInfo(videoId); // Use the ApiManager
                if (!videoInfo?.gif?.urls?.hd) {
                    throw new Error('Failed to get video info or HD URL.');
                }

                const downloadUrl = videoInfo.gif.urls.hd;
                const filename = `${videoInfo.gif.id}${CONSTANTS.FILENAME_SUFFIX}`;
                await this._downloadFile(downloadUrl, filename);

                this._updateButtonState(button, 'SUCCESS');
                this._showToast('Download successful!', 'success');
            } catch (error) {
                Logger.error('Download failed:', error);
                this._updateButtonState(button, 'ERROR');
                // Display the specific error message from the exception.
                this._showToast(`Error: ${error.message}`, 'error');
            }
        }

        /**
         * Fetches a temporary guest token from the API if one is not already stored.
         * @returns {Promise<string|null>} The guest token or null on failure.
         * @private
         */
        async _getGuestToken() {
            if (this.guestToken) {
                return this.guestToken;
            }
            try {
                const response = await fetch(CONSTANTS.API_AUTH_URL);
                if (!response.ok) {
                    throw new Error(`API request failed with status ${response.status}`);
                }
                const responseData = await response.json();
                if (responseData && responseData.token) {
                    this.guestToken = responseData.token;
                    Logger.log('Successfully fetched guest token.');
                    return this.guestToken;
                }
                throw new Error('Token not found in guest auth response.');
            } catch (error) {
                Logger.error('Failed to get guest token:', error);
                return null;
            }
        }

        /**
         * Fetches video information from the RedGifs API, using a cache.
         * It ensures a guest token is available before making the request.
         * @param {string} videoId - The ID of the video to fetch.
         * @returns {Promise<object|null>} The video information object or null on failure.
         * @private
         */
        async _getVideoInfo(videoId) {
            if (this.videoCache[videoId]) {
                return this.videoCache[videoId];
            }
            try {
                const token = await this._getGuestToken();
                if (!token) {
                    throw new Error('Could not retrieve guest token to make the request.');
                }

                const response = await fetch(`${CONSTANTS.API_URL_BASE}${videoId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!response.ok) {
                    throw new Error(`API request failed with status ${response.status}`);
                }
                const responseData = await response.json();
                this.videoCache[videoId] = responseData; // Cache the successful response.
                return responseData;
            } catch (error) {
                Logger.error('Error fetching video info:', error);
                return null;
            }
        }

        /**
         * Initiates a download for the given URL.
         * @param {string} url The URL of the video to download.
         * @param {string} filename The desired filename for the downloaded video.
         * @private
         */
        async _downloadFile(url, filename) {
            const response = await fetch(url);
            // Throw a more user-friendly error message for HTTP errors.
            if (!response.ok) throw new Error(`Server responded with ${response.status}`);
            const videoBlob = await response.blob();
            const link = h('a', {
                href: URL.createObjectURL(videoBlob),
                download: filename,
            });
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        }
    }

    // =================================================================================
    // SECTION: Entry Point
    // =================================================================================

    const app = new RedGifsDownloader();
    app.init();
})();

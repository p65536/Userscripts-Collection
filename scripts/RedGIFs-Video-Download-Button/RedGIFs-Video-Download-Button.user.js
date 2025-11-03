// ==UserScript==
// @name         RedGIFs Video Download Button
// @namespace    https://github.com/p65536
// @version      1.4.0
// @license      MIT
// @description  Adds a download button (for one-click HD downloads) and an "Open in New Tab" button to each video on the RedGIFs site.
// @icon         https://www.redgifs.com/favicon.ico
// @author       p65536
// @match        https://*.redgifs.com/*
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    // =================================================================================
    // SECTION: Script-Specific Definitions
    // =================================================================================

    const OWNERID = 'p65536';
    const APPID = 'rgvdb';
    const LOG_PREFIX = `[${APPID.toUpperCase()}]`;
    const CONSTANTS = {
        VIDEO_CONTAINER_SELECTOR: '[id^="gif_"]',
        TILE_ITEM_SELECTOR: '.tileItem',
        WATCH_URL_BASE: 'https://www.redgifs.com/watch/',
        FILENAME_SUFFIX: '-hd.mp4',
        TOAST_DURATION: 3000,
        TOAST_ERROR_DURATION: 6000,
        TOAST_FADE_OUT_DURATION: 300,
        ICON_REVERT_DELAY: 2000,
        CANCEL_LOCK_DURATION: 600, // (ms) Duration to lock download button to prevent mis-click cancel

        // --- API Data Extractors ---
        API_TARGET_HOST: 'api.redgifs.com',
        API_TARGET_PATH_PREFIX: '/v2/',

        /**
         * Extracts the video ID from a 'gif' object in the API response.
         * @param {object} gif - The gif object from the API.
         * @returns {string|undefined} The video ID.
         */
        API_GIF_ID_EXTRACTOR: (gif) => gif?.id,

        /**
         * Extracts the HD video URL from a 'gif' object in the API response.
         * @param {object} gif - The gif object from the API.
         * @returns {string|undefined} The HD URL.
         */
        API_GIF_HD_URL_EXTRACTOR: (gif) => gif?.urls?.hd,
        // ---------------------------

        // --- Button configurations ---
        /**
         * @enum {string}
         * Defines unique keys for button configurations.
         */
        BUTTON_KEY: {
            TILE_OPEN: 'TILE_OPEN',
            PREVIEW_OPEN: 'PREVIEW_OPEN',
            PREVIEW_DOWNLOAD: 'PREVIEW_DOWNLOAD',
        },

        /** @type {Object<string, ButtonConfig>} */
        BUTTON_CONFIGS: {
            TILE_OPEN: {
                className: `${APPID}-open-in-new-tab-btn`,
                title: 'Open in new tab',
                iconName: 'OPEN_IN_NEW',
            },
            PREVIEW_OPEN: {
                className: `${APPID}-preview-open-btn`,
                title: 'Open in new tab',
                iconName: 'OPEN_IN_NEW',
            },
            PREVIEW_DOWNLOAD: {
                className: `${APPID}-preview-download-btn`,
                title: 'Download HD Video',
                iconName: 'DOWNLOAD',
            },
        },
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
        OPEN_IN_NEW: {
            tag: 'svg',
            props: BASE_ICON_PROPS,
            children: [
                { tag: 'path', props: { d: 'M0 0h24v24H0V0z', fill: 'none' } },
                { tag: 'path', props: { d: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z' } },
            ],
        },
    };

    // =================================================================================
    // SECTION: Style Definitions
    // =================================================================================

    const STYLES = `
        /* Open in New Tab Button on Thumbnails */
        ${CONSTANTS.TILE_ITEM_SELECTOR} {
            position: relative;
        }
        .${APPID}-open-in-new-tab-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            z-index: 10;
            width: 28px;
            height: 28px;
            padding: 4px;
            border-radius: 4px;
            background-color: rgba(0, 0, 0, 0.6);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 1;
        }
        .${APPID}-open-in-new-tab-btn:hover {
            background-color: rgba(0, 0, 0, 0.8);
        }

        /* Buttons on Video Preview */
        ${CONSTANTS.VIDEO_CONTAINER_SELECTOR} {
            position: relative;
        }
        .${APPID}-preview-open-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            z-index: 1000;
            width: 32px;
            height: 32px;
            padding: 4px;
            border-radius: 4px;
            background-color: rgba(0, 0, 0, 0.6);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .${APPID}-preview-open-btn:hover {
            background-color: rgba(0, 0, 0, 0.8);
        }
        .${APPID}-preview-download-btn {
            position: absolute;
            top: 44px; /* Positioned below the open-in-new-tab button */
            right: 8px;
            z-index: 1000;
            width: 32px;
            height: 32px;
            padding: 0;
            border-radius: 4px;
            background-color: red;
            border: none;
            cursor: pointer;
            display: grid;
            place-items: center;
        }
        .${APPID}-preview-download-btn:hover {
            background-color: #c00;
        }

        /* Spinner Animation */
        .${APPID}-spinner {
            animation: ${APPID}-spinner-rotate 1s linear infinite;
            transform-origin: center;
        }

        /* Toast Notifications */
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

        /* Mobile: Adjust button position to avoid overlapping native UI */
        .App.phone .${APPID}-preview-open-btn {
            /* Offset by toolbar height (assumed 56px) + 8px original top */
            top: 64px; 
        }
        .App.phone .${APPID}-preview-download-btn {
            /* Offset by toolbar height (assumed 56px) + 44px original top */
            top: 100px;
        }

        /* Keyframes */
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

    // =================================================================================
    // SECTION: Execution Guard
    // =================================================================================

    class ExecutionGuard {
        // A shared key for all scripts from the same author to avoid polluting the window object.
        static #GUARD_KEY = `__${OWNERID}_guard__`;
        // A specific key for this particular script.
        static #APP_KEY = `${APPID}_executed`;

        /**
         * Checks if the script has already been executed on the page.
         * @returns {boolean} True if the script has run, otherwise false.
         */
        static hasExecuted() {
            return window[this.#GUARD_KEY]?.[this.#APP_KEY] || false;
        }

        /**
         * Sets the flag indicating the script has now been executed.
         */
        static setExecuted() {
            window[this.#GUARD_KEY] = window[this.#GUARD_KEY] || {};
            window[this.#GUARD_KEY][this.#APP_KEY] = true;
        }
    }

    // =================================================================================
    // SECTION: Logging Utility
    // =================================================================================

    // Style definitions for styled Logger.badge()
    const LOG_STYLES = {
        BASE: 'color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
        INFO: 'background: #007bff;',
        LOG: 'background: #28a745;',
        WARN: 'background: #ffc107; color: black;',
        ERROR: 'background: #dc3545;',
    };

    class Logger {
        static log(...args) {
            console.log(LOG_PREFIX, ...args);
        }
        static warn(...args) {
            console.warn(LOG_PREFIX, ...args);
        }
        static error(...args) {
            console.error(LOG_PREFIX, ...args);
        }

        /**
         * Logs a message with a styled badge for better visibility.
         * @param {string} badgeText - The text inside the badge.
         * @param {string} badgeStyle - The background-color style (from LOG_STYLES).
         * @param {'log'|'warn'|'error'} level - The console log level.
         * @param {...any} args - Additional messages to log after the badge.
         */
        static badge(badgeText, badgeStyle, level, ...args) {
            const style = `${LOG_STYLES.BASE} ${badgeStyle}`;
            const consoleMethod = console[level] || console.log;

            consoleMethod(
                `%c${LOG_PREFIX}%c %c${badgeText}%c`,
                'font-weight: bold;', // Style for the prefix
                'color: inherit;', // Reset for space
                style, // Style for the badge
                'color: inherit;', // Reset for the rest of the message
                ...args
            );
        }
    }

    // =================================================================================
    // SECTION: Utility Functions
    // =================================================================================

    /**
     * @typedef {Node|string|number|boolean|null|undefined} HChild
     */
    /**
     * Creates a DOM element using a hyperscript-style syntax.
     * @param {string} tag - Tag name with optional ID/class (e.g., "div#app.container", "my-element").
     * @param {object | HChild | HChild[]} [propsOrChildren] - Attributes object or children.
     * @param {HChild | HChild[]} [children] - Children (if props are specified).
     * @returns {HTMLElement|SVGElement} The created DOM element.
     */
    function h(tag, propsOrChildren, children) {
        const SVG_NS = 'http://www.w3.org/2000/svg';
        const match = tag.match(/^([a-z0-9-]+)(#[\w-]+)?((\.[\w-]+)*)$/i);
        if (!match) throw new Error(`Invalid tag syntax: ${tag}`);

        const [, tagName, id, classList] = match;
        const isSVG = ['svg', 'circle', 'rect', 'path', 'g', 'line', 'text', 'use', 'defs', 'clipPath'].includes(tagName);
        const el = isSVG ? document.createElementNS(SVG_NS, tagName) : document.createElement(tagName);

        if (id) el.id = id.slice(1);
        if (classList) {
            const classes = classList.replace(/\./g, ' ').trim();
            if (classes) {
                el.classList.add(...classes.split(/\s+/));
            }
        }

        let props = {};
        let childrenArray;
        if (propsOrChildren && Object.prototype.toString.call(propsOrChildren) === '[object Object]') {
            props = propsOrChildren;
            childrenArray = children;
        } else {
            childrenArray = propsOrChildren;
        }

        // --- Start of Attribute/Property Handling ---
        const directProperties = new Set(['value', 'checked', 'selected', 'readOnly', 'disabled', 'multiple', 'textContent']);
        const urlAttributes = new Set(['href', 'src', 'action', 'formaction']);
        const safeProtocols = new Set(['https:', 'http:', 'mailto:', 'tel:', 'blob:', 'data:']);

        for (const [key, value] of Object.entries(props)) {
            // 0. Handle `ref` callback (highest priority after props parsing).
            if (key === 'ref' && typeof value === 'function') {
                value(el);
            }
            // 1. Security check for URL attributes.
            else if (urlAttributes.has(key)) {
                const url = String(value);
                try {
                    const parsedUrl = new URL(url); // Throws if not an absolute URL.
                    if (safeProtocols.has(parsedUrl.protocol)) {
                        el.setAttribute(key, url);
                    } else {
                        el.setAttribute(key, '#');
                        Logger.warn(`Blocked potentially unsafe protocol "${parsedUrl.protocol}" in attribute "${key}":`, url);
                    }
                } catch {
                    el.setAttribute(key, '#');
                    Logger.warn(`Blocked invalid or relative URL in attribute "${key}":`, url);
                }
            }
            // 2. Direct property assignments.
            else if (directProperties.has(key)) {
                el[key] = value;
            }
            // 3. Other specialized handlers.
            else if (key === 'style' && typeof value === 'object') {
                Object.assign(el.style, value);
            } else if (key === 'dataset' && typeof value === 'object') {
                for (const [dataKey, dataVal] of Object.entries(value)) {
                    el.dataset[dataKey] = dataVal;
                }
            } else if (key.startsWith('on') && typeof value === 'function') {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else if (key === 'className') {
                const classes = String(value).trim();
                if (classes) {
                    el.classList.add(...classes.split(/\s+/));
                }
            } else if (key.startsWith('aria-')) {
                el.setAttribute(key, String(value));
            }
            // 4. Default attribute handling.
            else if (value !== false && value !== null) {
                el.setAttribute(key, value === true ? '' : String(value));
            }
        }
        // --- End of Attribute/Property Handling ---

        const fragment = document.createDocumentFragment();
        /**
         *
         * @param child
         */
        function append(child) {
            if (child === null || child === false || typeof child === 'undefined') return;
            if (typeof child === 'string' || typeof child === 'number') {
                fragment.appendChild(document.createTextNode(String(child)));
            } else if (Array.isArray(child)) {
                child.forEach(append);
            } else if (child instanceof Node) {
                fragment.appendChild(child);
            } else {
                throw new Error('Unsupported child type');
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

    const CACHED_ICONS = (() => {
        const cache = {};
        for (const key in ICONS) {
            cache[key] = createIconFromDef(ICONS[key]);
        }
        return cache;
    })();

    // =================================================================================
    // SECTION: API Manager
    // =================================================================================

    class ApiManager {
        constructor() {
            /** @type {Map<string, string>} */
            this.videoCache = new Map();
        }

        /**
         * Gets the cached HD URL for a given video ID.
         * @param {string} videoId The ID of the video.
         * @returns {string|undefined} The cached HD URL or undefined if not found.
         */
        getCachedHdUrl(videoId) {
            return this.videoCache.get(videoId);
        }

        /**
         * Sets up XHR and Fetch interceptors to capture API responses.
         */
        setupInterceptors() {
            const interceptHandler = this._interceptApiResponse.bind(this);

            /**
             * Checks if a given URL matches the target API criteria.
             * @param {string} urlString The URL to check.
             * @returns {boolean} True if the URL should be intercepted.
             */
            const isTargetApi = (urlString) => {
                try {
                    // Use document.baseURI as a base for relative URLs
                    const url = new URL(urlString, document.baseURI);
                    return url.hostname === CONSTANTS.API_TARGET_HOST && url.pathname.startsWith(CONSTANTS.API_TARGET_PATH_PREFIX);
                } catch {
                    return false; // Invalid URL
                }
            };

            // 1. Intercept XMLHttpRequest
            const originalXhrOpen = window.XMLHttpRequest.prototype.open;
            const originalXhrSend = window.XMLHttpRequest.prototype.send;

            window.XMLHttpRequest.prototype.open = function (method, url) {
                this._interceptUrl = typeof url === 'string' && isTargetApi(url) ? url : null;
                originalXhrOpen.apply(this, arguments);
            };

            window.XMLHttpRequest.prototype.send = function () {
                if (this._interceptUrl) {
                    this.addEventListener('load', () => {
                        if (this.responseText) {
                            interceptHandler(this.responseText, this._interceptUrl);
                        }
                    });
                }
                originalXhrSend.apply(this, arguments);
            };

            // 2. Intercept Fetch
            const originalFetch = window.fetch;
            window.fetch = function (resource, init) {
                const url = resource instanceof Request ? resource.url : typeof resource === 'string' ? resource : '';

                if (isTargetApi(url)) {
                    return originalFetch
                        .apply(this, arguments)
                        .then((response) => {
                            // Clone the response to allow the original stream to be consumed
                            const clonedResponse = response.clone();
                            clonedResponse.text().then((text) => {
                                interceptHandler(text, url);
                            });
                            return response; // Return the original response
                        })
                        .catch((error) => {
                            // Log fetch errors only for the target API, reducing noise
                            Logger.warn(`Target API fetch failed for ${url}:`, error);
                            throw error; // Re-throw to not break the original request
                        });
                }
                return originalFetch.apply(this, arguments);
            };
        }

        /**
         * Intercepts and parses API responses to cache video URLs.
         * @param {string} responseText The raw response text from the API.
         * @param {string} url The URL of the intercepted API request.
         * @private
         */
        _interceptApiResponse(responseText, url) {
            // Pre-filter: Ensure the response is a non-empty string that looks like JSON.
            // This prevents errors from non-JSON responses.
            if (!responseText || typeof responseText !== 'string' || !responseText.startsWith('{')) {
                return;
            }

            try {
                const data = JSON.parse(responseText);

                // Handle both single 'gif' object (watch page) and 'gifs' array (feeds)
                const gifsToProcess = [];
                if (data && Array.isArray(data.gifs)) {
                    gifsToProcess.push(...data.gifs);
                }
                // Also check for the single 'gif' object
                if (data && data.gif && typeof data.gif === 'object') {
                    gifsToProcess.push(data.gif);
                }

                // Check if we have any gifs to process
                if (gifsToProcess.length > 0) {
                    let count = 0;
                    for (const gif of gifsToProcess) {
                        // Use extractors from CONSTANTS
                        // Extractors are null-safe (e.g., gif?.id)
                        const videoId = CONSTANTS.API_GIF_ID_EXTRACTOR(gif);
                        const hdUrl = CONSTANTS.API_GIF_HD_URL_EXTRACTOR(gif);

                        if (videoId && hdUrl) {
                            if (!this.videoCache.has(videoId)) {
                                this.videoCache.set(videoId, hdUrl);
                                count++;
                            }
                        }
                    }

                    // Log the API path on successful processing
                    let path = '[Unknown Path]';
                    try {
                        // Extract just the pathname (e.g., /v2/feeds/...)
                        path = new URL(url, document.baseURI).pathname;
                    } catch (e) {
                        // This should rarely happen as isTargetApi already validated the URL.
                        Logger.warn(`Failed to parse URL path: ${url}`, e);
                    }

                    if (count > 0) {
                        Logger.badge('CACHE UPDATED', LOG_STYLES.INFO, 'log', `[${path}] Added ${count} new items. Total: ${this.videoCache.size}`);
                    } else {
                        // Log even if no new items were added, to confirm the API path was hit
                        Logger.badge('API HIT', LOG_STYLES.LOG, 'log', `[${path}] (No new items added. Cache total: ${this.videoCache.size})`);
                    }
                }
                // If no gifs found (e.g., /v2/geolocation), silently do nothing.
            } catch (error) {
                Logger.warn('Failed to parse API response:', error, responseText);
            }
        }
    }

    // =================================================================================
    // SECTION: UI Manager
    // =================================================================================

    class UIManager {
        constructor() {
            /** @type {HTMLElement|null} */
            this.toastContainer = null;
        }

        /**
         * Initializes the UI components that require the DOM.
         * Creates and appends the toast container to the document body.
         */
        init() {
            this._createToastContainer();
        }

        /**
         * Injects the necessary CSS styles for the script's UI into the document's head.
         */
        injectStyles() {
            this._injectStyles();
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
         */
        showToast(message, type) {
            if (!this.toastContainer) {
                Logger.error('Toast container element not found. Cannot display toast.');
                return;
            }

            const toastClass = `${APPID}-toast-${type}`;
            const toastElement = h(`div.${APPID}-toast`, { class: toastClass }, message);

            this.toastContainer.appendChild(toastElement);

            // Determine duration based on type
            const duration = type === 'error' ? CONSTANTS.TOAST_ERROR_DURATION : CONSTANTS.TOAST_DURATION;

            // Start the process to remove the toast after a delay.
            setTimeout(() => {
                toastElement.classList.add('exiting');

                // Set a second, final timeout to remove the element from the DOM.
                setTimeout(() => {
                    toastElement.remove();
                }, CONSTANTS.TOAST_FADE_OUT_DURATION);
            }, duration);
        }

        /**
         * A generic helper to create and append a button.
         * @param {object} options - The configuration for the button.
         * @param {HTMLElement} options.parentElement - The element to append the button to.
         * @param {string} options.className - The CSS class for the button.
         * @param {string} options.title - The button's tooltip text.
         * @param {string} options.iconName - The key of the icon in the ICONS object.
         * @param {(e: MouseEvent) => void} options.clickHandler - The function to call on click.
         */
        createButton({ parentElement, className, title, iconName, clickHandler }) {
            // Prevent duplicate buttons
            if (parentElement.querySelector(`.${className}`)) {
                return;
            }

            const button = h(`button.${className}`, {
                title: title,
                onclick: clickHandler,
            });

            this._setButtonIcon(button, iconName);
            parentElement.appendChild(button);
        }

        /**
         * Sets the icon for a given button.
         * @param {HTMLButtonElement} button The button element to modify.
         * @param {'DOWNLOAD'|'SPINNER'|'SUCCESS'|'ERROR'|'OPEN_IN_NEW'} iconName The name of the icon to set.
         * @private
         */
        _setButtonIcon(button, iconName) {
            const cachedIcon = CACHED_ICONS[iconName];
            if (!cachedIcon) {
                Logger.error(`Icon "${iconName}" not found.`);
                return;
            }

            // Clear existing content
            while (button.firstChild) {
                button.removeChild(button.firstChild);
            }

            // Add new icon
            const newIcon = cachedIcon.cloneNode(true);
            if (newIcon) {
                button.appendChild(newIcon);
            }
        }

        /**
         * Updates the button's visual state and reverts it after a delay for transient states.
         * @param {HTMLButtonElement} button The button to update.
         * @param {'IDLE'|'LOADING_LOCKED'|'LOADING_CANCELLABLE'|'SUCCESS'|'ERROR'} state The new state.
         */
        updateButtonState(button, state) {
            const stateMap = {
                IDLE: { icon: 'DOWNLOAD', disabled: false },
                LOADING_LOCKED: { icon: 'SPINNER', disabled: true }, // Cancel lock
                LOADING_CANCELLABLE: { icon: 'SPINNER', disabled: false }, // Cancellable
                SUCCESS: { icon: 'SUCCESS', disabled: true },
                ERROR: { icon: 'ERROR', disabled: true },
            };

            const { icon, disabled } = stateMap[state] || stateMap.IDLE;
            this._setButtonIcon(button, icon);
            button.disabled = disabled;

            // Revert to IDLE state after a delay for success or error states.
            if (state === 'SUCCESS' || state === 'ERROR') {
                setTimeout(() => {
                    this.updateButtonState(button, 'IDLE');
                }, CONSTANTS.ICON_REVERT_DELAY);
            }
        }

        /**
         * Injects the necessary CSS styles into the document's head.
         * @private
         */
        _injectStyles() {
            const styleElement = h('style', { type: 'text/css', 'data-owner': APPID }, STYLES);
            document.head.appendChild(styleElement);
        }
    }

    // =================================================================================
    // SECTION: Annoyance Manager
    // =================================================================================

    class AnnoyanceManager {
        /**
         * @private
         * @static
         * @const {string}
         */
        static STYLES = `
                /* --- RGVDB Annoyance Removal --- */

                /* Header: Link button to external site (Desktop) */
                .topNav .aTab {
                    display: none !important;
                }

                /* Information Bar (Top Banner) */
                .InformationBar {
                    display: none !important;
                }

                /* Ad Containers (:has() dependent) */
                .sideBarItem:has(.liveAdButton) {
                    display: none !important;
                }

                /* Feed Injections (Trending Niches/Creators, Ads, etc.) */
                .injection {
                    display: none !important;
                }

                /* Sidebar: OnlyFans Creators (Desktop) */
                /* Use visibility:hidden to hide without affecting layout (prevents center feed shift) */
                .OnlyFansCreatorsSidebar {
                    visibility: hidden !important;
                }
            `;

        /**
         * Injects the annoyance removal CSS into the document's head.
         */
        injectStyles() {
            const styleElement = h('style', { type: 'text/css', 'data-owner': `${APPID}-annoyances` }, AnnoyanceManager.STYLES);
            document.head.appendChild(styleElement);
        }

        /**
         * Registers Sentinel observers to hide elements that cannot be hidden by CSS alone.
         * @param {Sentinel} sentinel - The Sentinel instance.
         */
        removeElements(sentinel) {
            // --- Developer Note: Platform Detection ---
            // This logic determines the platform (phone/desktop) ONCE on page load.
            // It intentionally does NOT handle dynamic platform switching because the site itself does not support it (at least for now).
            //
            // TO TEST MOBILE ON DESKTOP: Enable device emulation in DevTools AND THEN reload the page.
            // ---

            let platformDetermined = false;

            const adHider = (adElement) => {
                const adContainer = adElement.closest('.GifPreview.VisibleOnly');
                if (adContainer) {
                    // Do NOT use .remove() as it breaks the site's virtual DOM state, causing black screens on navigation.
                    // Instead, apply an inline !important style to win the CSS specificity war.
                    adContainer.style.setProperty('display', 'none', 'important');
                }
            };

            // Define listener callbacks so they can be unregistered later.
            const onPhoneFound = () => {
                if (platformDetermined) return;
                platformDetermined = true;
                Logger.badge('PLATFORM', LOG_STYLES.INFO, 'log', 'Mobile platform detected');
                sentinel.on('[data-videoads="adsVideo"]', adHider);
                // Unregister the other platform watcher
                sentinel.off('.App.desktop', onDesktopFound);
            };

            const onDesktopFound = () => {
                if (platformDetermined) return;
                platformDetermined = true;
                Logger.badge('PLATFORM', LOG_STYLES.INFO, 'log', 'Desktop platform detected');
                sentinel.on('[class*="_StreamateCamera_"]', adHider);
                // Unregister the other platform watcher
                sentinel.off('.App.phone', onPhoneFound);
            };

            // Rely on Sentinel to detect the platform class when it appears.
            Logger.badge('PLATFORM', LOG_STYLES.INFO, 'log', 'Awaiting platform detection...');
            sentinel.on('.App.phone', onPhoneFound);
            sentinel.on('.App.desktop', onDesktopFound);
        }
    }

    // =================================================================================
    // SECTION: Sentinel (DOM Node Insertion Observer)
    // =================================================================================

    /**
     * @class Sentinel
     * @description Detects DOM node insertion using a shared, prefixed CSS animation trick.
     * @property {Map<string, Array<(element: Element) => void>>} listeners
     * @property {Set<string>} rules
     * @property {HTMLElement | null} styleElement
     */
    class Sentinel {
        constructor(prefix = 'my-project') {
            /** @type {any} */
            const globalScope = window;
            globalScope.__global_sentinel_instances__ = globalScope.__global_sentinel_instances__ || {};
            if (globalScope.__global_sentinel_instances__[prefix]) {
                return globalScope.__global_sentinel_instances__[prefix];
            }

            // Use a unique, prefixed animation name shared by all scripts in a project.
            this.animationName = `${prefix}-global-sentinel-animation`;
            this.styleId = `${prefix}-sentinel-global-rules`; // A single, unified style element
            this.listeners = new Map();
            this.rules = new Set(); // Tracks all active selectors
            this.styleElement = null; // Holds the reference to the single style element

            this._injectStyleElement();
            document.addEventListener('animationstart', this._handleAnimationStart.bind(this), true);

            globalScope.__global_sentinel_instances__[prefix] = this;
        }

        _injectStyleElement() {
            // Ensure the style element is injected only once per project prefix.
            this.styleElement = document.getElementById(this.styleId);
            if (this.styleElement) return;

            const keyframes = `@keyframes ${this.animationName} { from { transform: none; } to { transform: none; } }`;
            this.styleElement = h('style', {
                id: this.styleId,
                textContent: keyframes,
            });
            document.head.appendChild(this.styleElement);
        }

        _handleAnimationStart(event) {
            // Check if the animation is the one we're listening for.
            if (event.animationName !== this.animationName) return;

            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }

            // Check if the target element matches any of this instance's selectors.
            for (const [selector, callbacks] of this.listeners.entries()) {
                if (target.matches(selector)) {
                    // Use a copy of the callbacks array in case a callback removes itself.
                    [...callbacks].forEach((cb) => cb(target));
                }
            }
        }

        /**
         * @param {string} selector
         * @param {(element: Element) => void} callback
         */
        on(selector, callback) {
            if (!this.listeners.has(selector)) {
                this.listeners.set(selector, []);
                this.rules.add(selector);

                // Regenerate and apply all rules to the single style element.
                const keyframes = `@keyframes ${this.animationName} { from { transform: none; } to { transform: none; } }`;
                const selectors = Array.from(this.rules).join(', ');
                this.styleElement.textContent = `${keyframes}\n${selectors} { animation-duration: 0.001s; animation-name: ${this.animationName}; }`;
            }
            this.listeners.get(selector).push(callback);
        }

        /**
         * @param {string} selector
         * @param {(element: Element) => void} callback
         */
        off(selector, callback) {
            const callbacks = this.listeners.get(selector);
            if (!callbacks) return;

            const newCallbacks = callbacks.filter((cb) => cb !== callback);

            if (newCallbacks.length === callbacks.length) {
                return; // Callback not found, do nothing.
            }

            if (newCallbacks.length === 0) {
                this.listeners.delete(selector);
                this.rules.delete(selector);

                const keyframes = `@keyframes ${this.animationName} { from { transform: none; } to { transform: none; } }`;
                const selectors = Array.from(this.rules).join(', ');
                this.styleElement.textContent = `${keyframes}\n${selectors ? `${selectors} { animation-duration: 0.001s; animation-name: ${this.animationName}; }` : ''}`;
            } else {
                this.listeners.set(selector, newCallbacks);
            }
        }
    }

    // =================================================================================
    // SECTION: Main Application Controller
    // =================================================================================

    /**
     * @typedef {object} ButtonConfig
     * @property {string} className - The CSS class for the button.
     * @property {string} title - The button's tooltip text.
     * @property {keyof ICONS} iconName - The key of the icon in the ICONS object.
     */
    class AppController {
        constructor() {
            /** @type {ApiManager} */
            this.apiManager = new ApiManager();
            /** @type {UIManager} */
            this.ui = new UIManager();
            /** @type {AnnoyanceManager} */
            this.annoyanceManager = new AnnoyanceManager();
            /** @type {Map<string, AbortController>} */
            this.activeDownloads = new Map();

            /**
             * @private
             * @const {Object<string, Function>}
             * Maps button configuration keys to their corresponding bound handler functions.
             */
            this.buttonHandlerMap = {
                [CONSTANTS.BUTTON_KEY.TILE_OPEN]: this._handleOpenInNewTabClick.bind(this),
                [CONSTANTS.BUTTON_KEY.PREVIEW_OPEN]: this._handleOpenInNewTabClick.bind(this),
                [CONSTANTS.BUTTON_KEY.PREVIEW_DOWNLOAD]: this._handleDownloadClick.bind(this),
            };

            this.apiManager.setupInterceptors();
        }

        /**
         * Initializes the script.
         */
        init() {
            // 1. Inject annoyance removal styles
            this.annoyanceManager.injectStyles();

            // 2. Inject script UI (buttons, toast) styles
            this.ui.injectStyles();

            // 3. Initialize UI components (toast container)
            this.ui.init();

            const sentinel = new Sentinel(OWNERID);

            // 4. Register JS-based annoyance removal
            this.annoyanceManager.removeElements(sentinel);

            /**
             * Registers a Sentinel observer and immediately scans for existing elements (safety net).
             * @param {string} selector The CSS selector to observe and scan.
             * @param {(element: Element) => void} handler The callback handler for found elements.
             */
            const registerObserver = (selector, handler) => {
                // 1. Observe future elements
                sentinel.on(selector, handler);
                // 2. Safety net: Scan for existing elements
                try {
                    document.querySelectorAll(selector).forEach(handler);
                } catch (e) {
                    Logger.error(`Error scanning existing elements for selector: ${selector}`, e);
                }
            };

            // Set up the listener using Sentinel.
            // When Sentinel registers a new selector, it rewrites its stylesheet.
            // This triggers the animationstart event for both elements
            // that already exist in the DOM and elements added later.

            // Setup observer for Tile Items (Grid View)
            registerObserver(CONSTANTS.TILE_ITEM_SELECTOR, (element) => {
                this._onElementFound(
                    element,
                    (id) => id, // Tile ID is the video ID
                    [CONSTANTS.BUTTON_KEY.TILE_OPEN]
                );
            });

            // Setup observer for Video Containers (Preview/Watch View)
            registerObserver(CONSTANTS.VIDEO_CONTAINER_SELECTOR, (element) => {
                this._onElementFound(
                    element,
                    (id) => id.split('_')[1], // Preview ID is "gif_VIDEOID"
                    [CONSTANTS.BUTTON_KEY.PREVIEW_OPEN, CONSTANTS.BUTTON_KEY.PREVIEW_DOWNLOAD]
                );
            });

            Logger.log('Initialized and observing DOM for new content.');
        }

        /**
         * Generic handler for found elements (replaces _onTileItemFound and _onPreviewFound).
         * @param {HTMLElement} element The found DOM element.
         * @param {(id: string) => string} idParser A function to extract the video ID from the element's ID.
         * @param {string[]} buttonKeys An array of keys from CONSTANTS.BUTTON_CONFIGS.
         * @private
         */
        _onElementFound(element, idParser, buttonKeys) {
            if (!element || !element.id) {
                return;
            }

            const videoId = idParser(element.id);

            // Robust check: Ensure videoId is truthy (not null, undefined, or empty string)
            if (videoId) {
                this._addButtonsToElement(element, videoId, buttonKeys);
            }
        }

        /**
         * Adds buttons to a given element based on configuration keys.
         * @param {HTMLElement} element The parent element for the buttons.
         * @param {string} videoId The video ID associated with the buttons.
         * @param {string[]} buttonKeys An array of keys from CONSTANTS.BUTTON_CONFIGS.
         * @private
         */
        _addButtonsToElement(element, videoId, buttonKeys) {
            for (const key of buttonKeys) {
                const config = CONSTANTS.BUTTON_CONFIGS[key];
                if (!config) {
                    Logger.warn(`Button configuration for key "${key}" not found.`);
                    continue;
                }

                // Get the bound handler from the instance map
                const boundHandler = this.buttonHandlerMap[key];
                if (!boundHandler) {
                    Logger.warn(`Button handler for key "${key}" not found in map.`);
                    continue;
                }

                // Create the final click handler, wrapping the bound handler to inject the videoId and event.
                const clickHandler = (e) => boundHandler(e, videoId);

                this.ui.createButton({
                    parentElement: element,
                    className: config.className,
                    title: config.title,
                    iconName: config.iconName,
                    clickHandler: clickHandler,
                });
            }
        }

        /**
         * Handles the click event on the "Open in New Tab" button.
         * @param {MouseEvent} e - The click event.
         * @param {string} videoId - The ID of the video to open.
         * @private
         */
        _handleOpenInNewTabClick(e, videoId) {
            e.preventDefault();
            e.stopPropagation();

            const url = `${CONSTANTS.WATCH_URL_BASE}${videoId}`;
            window.open(url, '_blank', 'noopener,noreferrer');
        }

        /**
         * Handles the click event on the download button.
         * Manages download start, 1s lock, and cancellation.
         * @param {MouseEvent} e - The click event.
         * @param {string} videoId - The ID of the video to download.
         * @private
         */
        async _handleDownloadClick(e, videoId) {
            e.stopPropagation(); // Prevent parent elements from handling the click.

            const button = e.currentTarget;

            // --- 1. Cancellation Logic ---
            // Check if this videoId is already being downloaded
            if (this.activeDownloads.has(videoId)) {
                // If the button is disabled, it's in the 1s lock, ignore the click
                if (button.disabled) return;

                // Button is enabled (LOADING_CANCELLABLE), proceed with cancellation
                Logger.log(`Cancelling download for ${videoId}...`);
                const controller = this.activeDownloads.get(videoId);
                controller.abort(); // Trigger the abort signal

                // No need to delete from map here, the finally block in the original call will handle it.
                // No toast here for cancellation click, only log. Toast is shown if the fetch promise rejects with AbortError.
                this.ui.updateButtonState(button, 'IDLE'); // Reset button immediately
                return;
            }

            // --- 2. Download Start Logic ---
            if (button.disabled) return; // Should not happen if state is IDLE, but as a safeguard.

            const controller = new AbortController();
            this.activeDownloads.set(videoId, controller);

            // Set state to LOADING_LOCKED (Spinner, disabled: true)
            this.ui.updateButtonState(button, 'LOADING_LOCKED');
            this.ui.showToast('Download started...', 'info');

            // Transition to cancellable state
            setTimeout(() => {
                // Only transition if the download is still active
                if (this.activeDownloads.has(videoId)) {
                    this.ui.updateButtonState(button, 'LOADING_CANCELLABLE');
                }
            }, CONSTANTS.CANCEL_LOCK_DURATION);

            try {
                // --- 2a. Check Cache ---
                const cachedHdUrl = this.apiManager.getCachedHdUrl(videoId);

                if (cachedHdUrl) {
                    // --- 2b. [Cache Hit] Execute Download ---
                    Logger.badge('CACHE HIT', LOG_STYLES.LOG, 'log', `Starting download for ${videoId}`);
                    await this._executeDownload(cachedHdUrl, videoId, controller.signal);

                    // --- 2c. Handle Success ---
                    this.ui.updateButtonState(button, 'SUCCESS');
                    this.ui.showToast('Download successful!', 'success');
                    Logger.log(`Downloaded ${videoId} from:`, cachedHdUrl);
                } else {
                    // --- 2d. [Cache Miss] Handle Failure ---
                    Logger.warn(`HD URL not found in cache for ${videoId}.`);
                    this.ui.showToast('HD URL not found in cache. (Try scrolling or refreshing)', 'error');
                    this.ui.updateButtonState(button, 'ERROR');
                }
            } catch (error) {
                // --- 2e. Handle Errors (including AbortError) ---
                if (error.name === 'AbortError') {
                    // Handle cancellation specifically (when the promise rejects)
                    Logger.log(`Download process for ${videoId} was aborted.`); // Log may already exist from ApiManager
                    this.ui.showToast('Download cancelled.', 'info');
                    // Button state should be reset by the click handler that initiated the abort
                    // If the abort happened for other reasons (e.g., page navigation), this ensures cleanup
                    if (this.activeDownloads.has(videoId)) {
                        // Check if cleanup is needed
                        this.ui.updateButtonState(button, 'IDLE');
                    }
                } else {
                    // Handle all other errors (API, Download, Network, 404, Token, Timeout, etc.) uniformly
                    Logger.error('Download failed:', error); // Keep existing detailed log for developer

                    // <-- Add line breaks (\n) for readability -->
                    const userErrorMessage = 'Download failed. Site update possible?';

                    this.ui.showToast(userErrorMessage, 'error'); // Show unified message to user
                    this.ui.updateButtonState(button, 'ERROR'); // Update button state
                }
            } finally {
                // --- 3. Cleanup ---
                // Always remove the task from the map when the process finishes (success, error, or abort)
                this.activeDownloads.delete(videoId);
            }
        }

        /**
         * Performs the actual download process (file save).
         * @param {string} hdUrl - The direct HD URL from the cache.
         * @param {string} videoId - The ID of the video to download (for filename).
         * @param {AbortSignal} signal - The AbortSignal to cancel the fetch operations.
         * @returns {Promise<void>}
         * @private
         */
        async _executeDownload(hdUrl, videoId, signal) {
            // --- 2a. Get Video Info ---
            const downloadUrl = hdUrl; // Use URL from cache
            const filename = `${videoId}${CONSTANTS.FILENAME_SUFFIX}`; // Use videoId for filename
            const safeFilename = filename.replace(/[\\/:*?"<>|]/g, '_'); // Sanitize filename

            // --- 2b. Download File ---
            await this._downloadFile(downloadUrl, safeFilename, signal);
        }

        /**
         * Initiates a download for the given URL using fetch and saves the file.
         * @param {string} url The URL of the video to download.
         * @param {string} filename The desired filename for the downloaded video.
         * @param {AbortSignal} [signal] - An optional AbortSignal to cancel the request.
         * @returns {Promise<void>}
         * @private
         */
        async _downloadFile(url, filename, signal) {
            const response = await fetch(url, { signal }); // Pass signal to fetch
            // Throw a more user-friendly error message for HTTP errors.
            if (!response.ok) throw new Error(`Server responded with ${response.status}`);

            const videoBlob = await response.blob();
            let objectUrl = null;
            let link = null;
            try {
                objectUrl = URL.createObjectURL(videoBlob);
                link = h('a', {
                    href: objectUrl,
                    download: filename,
                });
                document.body.appendChild(link);
                link.click();
            } finally {
                if (link) {
                    document.body.removeChild(link);
                }
                if (objectUrl) {
                    URL.revokeObjectURL(objectUrl);
                }
            }
        }
    }

    // =================================================================================
    // SECTION: Entry Point
    // =================================================================================

    if (ExecutionGuard.hasExecuted()) return;
    ExecutionGuard.setExecuted();

    // 1. Instantiate controller immediately at document-start.
    // The constructor sets up the API interceptors (XHR/Fetch).
    const app = new AppController();

    // 2. Defer the UI initialization (init()) until the DOM is ready, as UIManager and Sentinel need access to document.body.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => app.init());
    } else {
        // Already 'interactive' or 'complete'
        app.init();
    }
})();

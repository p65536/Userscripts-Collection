// ==UserScript==
// @name         RedGIFs Video Download Button
// @namespace    https://github.com/p65536
// @version      1.1.0
// @license      MIT
// @description  Adds a download button (for one-click HD downloads) and an "Open in New Tab" button to each video on the RedGIFs site.
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

    const OWNERID = 'p65536';
    const APPID = 'rgvdb';
    const LOG_PREFIX = `[${APPID.toUpperCase()}]`;
    const CONSTANTS = {
        VIDEO_CONTAINER_SELECTOR: '.GifPreview',
        TILE_ITEM_SELECTOR: '.tileItem',
        API_URL_BASE: 'https://api.redgifs.com/v2/gifs/',
        API_AUTH_URL: 'https://api.redgifs.com/v2/auth/temporary',
        WATCH_URL_BASE: 'https://www.redgifs.com/watch/',
        FILENAME_SUFFIX: '-hd.mp4',
        TOAST_DURATION: 3000,
        TOAST_FADE_OUT_DURATION: 300,
        ICON_REVERT_DELAY: 2000,
        /** @type {Object<string, ButtonConfig>} */
        BUTTON_CONFIGS: {
            TILE_OPEN: {
                className: `${APPID}-open-in-new-tab-btn`,
                title: 'Open in new tab',
                iconName: 'OPEN_IN_NEW',
                handlerName: '_handleOpenInNewTabClick',
            },
            PREVIEW_OPEN: {
                className: `${APPID}-preview-open-btn`,
                title: 'Open in new tab',
                iconName: 'OPEN_IN_NEW',
                handlerName: '_handleOpenInNewTabClick',
            },
            PREVIEW_DOWNLOAD: {
                className: `${APPID}-preview-download-btn`,
                title: 'Download HD Video',
                iconName: 'DOWNLOAD',
                handlerName: '_handleDownloadClick',
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
            props: { ...BASE_ICON_PROPS, height: '20px', width: '20px' },
            children: [
                { tag: 'path', props: { d: 'M0 0h24v24H0V0z', fill: 'none' } },
                { tag: 'path', props: { d: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z' } },
            ],
        },
    };

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

    // =================================================================================
    // SECTION: API Manager
    // =================================================================================

    class ApiManager {
        #guestToken = null;
        #videoCache = {};

        /**
         * Clears the video information cache.
         */
        clearCache() {
            this.#videoCache = {};
            Logger.log('Video cache cleared.');
        }

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
     * @property {keyof RedGifsDownloader} handlerName - The name of the handler method in the RedGifsDownloader class.
     */
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
            const sentinel = new Sentinel(OWNERID);

            this._setupObserver(sentinel, CONSTANTS.VIDEO_CONTAINER_SELECTOR, (element) => this._onPreviewFound(element));
            this._setupObserver(sentinel, CONSTANTS.TILE_ITEM_SELECTOR, (element) => {
                // The duplication check is specific to this button, so it remains here.
                if (!element.querySelector(`.${APPID}-open-in-new-tab-btn`)) {
                    this._onTileItemFound(element);
                }
            });

            Logger.log('Initialized and observing DOM for new content.');
        }

        /**
         * Sets up a Sentinel observer and performs an initial scan for a given selector.
         * @param {Sentinel} sentinel - The Sentinel instance.
         * @param {string} selector - The CSS selector to watch and scan for.
         * @param {(element: HTMLElement) => void} callback - The function to execute for each found element.
         * @private
         */
        _setupObserver(sentinel, selector, callback) {
            // Set up the listener for dynamically added elements.
            sentinel.on(selector, (element) => callback(element));
            // Perform an initial scan for elements that already exist on page load.
            const initialElements = document.querySelectorAll(selector);
            initialElements.forEach((element) => callback(element));
        }

        /**
         * Handles URL changes to clear caches.
         */
        onUrlChange() {
            this.apiManager.clearCache();
        }

        /**
         * Handles the discovery of a new tile item element on niche/profile pages.
         * @param {HTMLElement} tileItem - The found tile item element.
         * @private
         */
        _onTileItemFound(tileItem) {
            if (tileItem && tileItem.id) {
                this._addButtonsToElement(tileItem, tileItem.id, ['TILE_OPEN']);
            }
        }

        /**
         * Handles the discovery of a new video preview container.
         * @param {HTMLElement} gifContainer - The found .GifPreview element.
         * @private
         */
        _onPreviewFound(gifContainer) {
            if (gifContainer && gifContainer.id) {
                const videoId = gifContainer.id.split('_')[1];
                if (videoId) {
                    this._addButtonsToElement(gifContainer, videoId, ['PREVIEW_OPEN', 'PREVIEW_DOWNLOAD']);
                }
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

                // Bind the handler from the instance and pass the required arguments.
                const clickHandler = (e) => this[config.handlerName](e, videoId);

                this._createButton({
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
            window.open(url, '_blank');
        }

        /**
         * A generic helper to create and append a button.
         * @param {object} options - The configuration for the button.
         * @param {HTMLElement} options.parentElement - The element to append the button to.
         * @param {string} options.className - The CSS class for the button.
         * @param {string} options.title - The button's tooltip text.
         * @param {string} options.iconName - The key of the icon in the ICONS object.
         * @param {(e: MouseEvent) => void} options.clickHandler - The function to call on click.
         * @private
         */
        _createButton({ parentElement, className, title, iconName, clickHandler }) {
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

        /**
         * Injects the necessary CSS styles into the document's head.
         * @private
         */
        _injectStyles() {
            const css = `
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
            const styleElement = h('style', { type: 'text/css' }, css);
            document.head.appendChild(styleElement);
        }
    }

    // =================================================================================
    // SECTION: Entry Point
    // =================================================================================

    if (ExecutionGuard.hasExecuted()) return;
    ExecutionGuard.setExecuted();

    const app = new RedGifsDownloader();
    app.init();

    // =================================================================================
    // SECTION: URL Change Observer for SPA Navigation
    // =================================================================================
    (function () {
        let lastHref = location.href;
        const handler = () => {
            if (location.href !== lastHref) {
                lastHref = location.href;
                Logger.log(`URL changed to: ${lastHref}`);
                app.onUrlChange();
            }
        };

        for (const method of ['pushState', 'replaceState']) {
            const original = history[method];
            history[method] = function (...args) {
                original.apply(this, args);
                handler();
            };
        }
        window.addEventListener('popstate', handler);
    })();
})();

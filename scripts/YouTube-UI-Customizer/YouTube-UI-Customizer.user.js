// ==UserScript==
// @name         YouTube-UI-Customizer
// @namespace    https://github.com/p65536
// @version      1.2.1
// @license      MIT
// @description  Enhances your YouTube experience. Customize the video grid layout by adjusting thumbnails per row, hide Shorts content, and automatically redirect the Shorts player to the standard video player.
// @icon         https://www.youtube.com/favicon.ico
// @author       p65536
// @match        https://www.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @run-at       document-start
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    /**
     * Extracts the Video ID from a Shorts URL path.
     * @param {string} path
     * @returns {string|null} The video ID or null if not found.
     */
    const getShortsVideoId = (path) => {
        const match = path.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    };

    // --- Fast Redirect for Shorts (Full Page Load) ---
    // This runs at @run-at document-start, *before* the DOM is ready.
    // It intercepts full page loads (e.g., new tab, ctrl+click) of /shorts/ URLs
    // and immediately replaces them with the standard /watch?v= player.
    // This prevents the Shorts player UI from ever loading or "flashing".
    const initialVideoId = getShortsVideoId(location.pathname);
    if (initialVideoId) {
        const params = new URLSearchParams(location.search);
        params.set('v', initialVideoId);
        location.replace(`/watch?${params.toString()}`);
        return; // Stop the rest of the script from executing, as we are navigating away.
    }

    // =================================================================================
    // SECTION: Script-Specific Definitions
    // =================================================================================

    const OWNERID = 'p65536';
    const APPID = 'ytuic';
    const APPNAME = 'YouTube UI Customizer';
    const LOG_PREFIX = `[${APPID.toUpperCase()}]`;

    // =================================================================================
    // SECTION: Logging Utility
    // =================================================================================

    const Logger = {
        levels: { error: 0, warn: 1, info: 2, log: 3 },
        level: 'log',
        setLevel(level) {
            if (Object.prototype.hasOwnProperty.call(this.levels, level)) {
                this.level = level;
            } else {
                console.warn(LOG_PREFIX, `Invalid log level "${level}". Valid levels are: ${Object.keys(this.levels).join(', ')}. Level not changed.`);
            }
        },
        error(...args) {
            if (this.levels[this.level] >= this.levels.error) {
                console.error(LOG_PREFIX, ...args);
            }
        },
        warn(...args) {
            if (this.levels[this.level] >= this.levels.warn) {
                console.warn(LOG_PREFIX, ...args);
            }
        },
        info(...args) {
            if (this.levels[this.level] >= this.levels.info) {
                console.info(LOG_PREFIX, ...args);
            }
        },
        log(...args) {
            if (this.levels[this.level] >= this.levels.log) {
                console.log(LOG_PREFIX, ...args);
            }
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
    // SECTION: Configuration and Constants
    // =================================================================================

    const CONSTANTS = {
        CONFIG_KEY: `${APPID}_config`,
        TIMERS: {
            DEBOUNCE_MS: 300,
        },
        SELECTORS: {
            shortsFullScan: [
                'ytd-reel-shelf-renderer',
                'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
                'ytd-rich-item-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
                'ytd-grid-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
                'ytd-video-renderer:has(a[href*="/shorts/"])',
                'ytd-compact-video-renderer:has(a[href*="/shorts/"])',
                'ytd-guide-entry-renderer[guide-entry-title="Shorts"]',
                'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
                'grid-shelf-view-model:has(ytm-shorts-lockup-view-model)',
            ],
            moreTopics: 'ytd-rich-section-renderer:has(ytd-chips-shelf-with-video-shelf-renderer)',
        },
        UI_DEFAULTS: {
            SETTINGS_BUTTON: {
                top: '12px',
                right: '240px',
                width: '36px',
                height: '36px',
                zIndex: 10000,
            },
            SLIDER: {
                min: 2,
                max: 10,
                step: 1,
            },
        },
    };

    const DEFAULT_CONFIG = {
        options: {
            itemsPerRow: 5,
            hideShorts: true,
            hideMoreTopics: true,
            redirectShorts: true,
            syncTabs: true,
        },
    };

    const SITE_STYLES = {
        youtube: {
            SETTINGS_BUTTON: {
                background: 'var(--yt-spec-brand-background-solid, transparent)',
                borderColor: 'var(--yt-spec-border-primary, #ddd)',
                backgroundHover: 'var(--yt-spec-badge-chip-background, #f0f0f0)',
                borderRadius: '50%',
                iconDef: {
                    tag: 'svg',
                    props: { xmlns: 'http://www.w3.org/2000/svg', height: '24px', viewBox: '0 -960 960 960', width: '24px', fill: 'var(--yt-spec-icon-active-other, #606060)' },
                    children: [
                        {
                            tag: 'path',
                            props: {
                                d: 'M480-160H160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v200h-80v-200H160v480h320v80ZM380-300v-360l280 180-280 180ZM714-40l-12-60q-12-5-22.5-10.5T658-124l-58 18-40-68 46-40q-2-14-2-26t2-26l-46-40 40-68 58 18q11-8 21.5-13.5T702-380l12-60h80l12 60q12 5 22.5 11t21.5 15l58-20 40 70-46 40q2 12 2 25t-2 25l46 40-40 68-58-18q-11 8-21.5 13.5T806-100l-12 60h-80Zm40-120q33 0 56.5-23.5T834-240q0-33-23.5-56.5T754-320q-33 0-56.5 23.5T674-240q0 33 23.5 56.5T754-160Z',
                            },
                        },
                    ],
                },
            },
            SETTINGS_PANEL: {
                bg: 'var(--yt-spec-menu-background, #fff)',
                text_primary: 'var(--yt-spec-text-primary, #030303)',
                text_secondary: 'var(--yt-spec-text-secondary, #606060)',
                border_default: 'var(--yt-spec-border-primary, #ddd)',
                accent_color: 'var(--yt-spec-call-to-action, #065fd4)',
                input_bg: 'var(--yt-spec-brand-background-primary, #f9f9f9)',
            },
        },
    };

    // =================================================================================
    // SECTION: Event-Driven Architecture (Pub/Sub)
    // =================================================================================

    const EventBus = {
        events: {},
        subscribe(event, listener) {
            if (!this.events[event]) {
                this.events[event] = [];
            }
            if (!this.events[event].includes(listener)) {
                this.events[event].push(listener);
            }
        },
        publish(event, ...args) {
            if (!this.events[event]) {
                return;
            }
            this.events[event].forEach((listener) => {
                try {
                    listener(...args);
                } catch (e) {
                    Logger.error(`EventBus error in listener for event "${event}":`, e);
                }
            });
        },
    };

    // =================================================================================
    // SECTION: Utility Functions
    // =================================================================================

    /**
     * @param {Function} func
     * @param {number} delay
     * @returns {Function}
     */
    function debounce(func, delay) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    /**
     * Helper function to check if an item is a non-array object.
     * @param {*} item The item to check.
     * @returns {boolean}
     */
    function isObject(item) {
        return !!(item && typeof item === 'object' && !Array.isArray(item));
    }

    /**
     * Recursively merges the properties of a source object into a target object.
     * @param {object} target The target object (e.g., a deep copy of default config).
     * @param {object} source The source object (e.g., user config).
     * @returns {object} The mutated target object.
     */
    function deepMerge(target, source) {
        for (const key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                const sourceVal = source[key];
                if (isObject(sourceVal) && Object.prototype.hasOwnProperty.call(target, key) && isObject(target[key])) {
                    deepMerge(target[key], sourceVal);
                } else if (typeof sourceVal !== 'undefined') {
                    target[key] = sourceVal;
                }
            }
        }
        return target;
    }

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
         * Appends a child node or text to the document fragment.
         * @param {HChild} child - The child to append.
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
    // SECTION: Configuration Management (GM Storage)
    // =================================================================================

    class ConfigManagerBase {
        constructor({ configKey, defaultConfig }) {
            if (!configKey || !defaultConfig) {
                throw new Error('configKey and defaultConfig must be provided.');
            }
            this.CONFIG_KEY = configKey;
            this.DEFAULT_CONFIG = defaultConfig;
            this.config = null;
        }

        async load() {
            const raw = await GM_getValue(this.CONFIG_KEY);
            let userConfig = null;
            if (raw) {
                try {
                    userConfig = JSON.parse(raw);
                } catch (e) {
                    Logger.error('Failed to parse configuration. Resetting to default settings.', e);
                    userConfig = null;
                }
            }

            const completeConfig = JSON.parse(JSON.stringify(this.DEFAULT_CONFIG));
            this.config = deepMerge(completeConfig, userConfig || {});
        }

        async save(obj) {
            this.config = obj;
            await GM_setValue(this.CONFIG_KEY, JSON.stringify(obj));
        }

        get() {
            return this.config;
        }
    }

    class ConfigManager extends ConfigManagerBase {
        constructor() {
            super({
                configKey: CONSTANTS.CONFIG_KEY,
                defaultConfig: DEFAULT_CONFIG,
            });
        }
    }

    // =================================================================================
    // SECTION: UI Elements - Base Classes
    // =================================================================================

    /**
     * @abstract
     * @description Base class for a UI component.
     */
    class UIComponentBase {
        constructor(callbacks = {}) {
            this.callbacks = callbacks;
            this.element = null;
        }

        /** @abstract */
        render() {
            throw new Error('Component must implement render method.');
        }

        destroy() {
            this.element?.remove();
            this.element = null;
        }
    }

    /**
     * @abstract
     * @description Base class for a settings panel/submenu UI component.
     */
    class SettingsPanelBase extends UIComponentBase {
        constructor(callbacks) {
            super(callbacks);
            this.debouncedSave = debounce(async () => {
                const newConfig = await this._collectDataFromForm();
                EventBus.publish('config:save', newConfig);
            }, CONSTANTS.TIMERS.DEBOUNCE_MS);
            this._handleDocumentClick = this._handleDocumentClick.bind(this);
        }

        render() {
            // Basic rendering logic, subclasses will provide content.
            this._injectStyles();
            this.element = this._createPanelContainer();
            const content = this._createPanelContent();
            this.element.appendChild(content);

            document.body.appendChild(this.element);
            this._setupEventListeners();
            return this.element;
        }

        toggle() {
            const shouldShow = this.element.style.display === 'none';
            if (shouldShow) {
                this.show();
            } else {
                this.hide();
            }
        }

        isOpen() {
            return this.element && this.element.style.display !== 'none';
        }

        async show() {
            await this.populateForm();
            const anchorRect = this.callbacks.getAnchorElement().getBoundingClientRect();
            this.element.style.display = 'block';
            // Position panel near the anchor element
            this.element.style.top = `${anchorRect.bottom + 8}px`;
            this.element.style.right = `${window.innerWidth - anchorRect.right - anchorRect.width / 2}px`;
            document.addEventListener('click', this._handleDocumentClick, true);
        }

        hide() {
            this.element.style.display = 'none';
            document.removeEventListener('click', this._handleDocumentClick, true);
            this.callbacks.onClose?.(); // Notify SyncManager that the panel has closed
        }

        _createPanelContainer() {
            return h(`div#${APPID}-settings-panel`, { style: { display: 'none' }, role: 'menu' });
        }

        _handleDocumentClick(e) {
            const anchor = this.callbacks.getAnchorElement();
            if (this.element && !this.element.contains(e.target) && anchor && !anchor.contains(e.target)) {
                this.hide();
            }
        }

        _createPanelContent() {
            throw new Error('Subclass must implement _createPanelContent()');
        }
        _injectStyles() {
            throw new Error('Subclass must implement _injectStyles()');
        }
        populateForm() {
            throw new Error('Subclass must implement populateForm()');
        }
        _collectDataFromForm() {
            throw new Error('Subclass must implement _collectDataFromForm()');
        }
        _setupEventListeners() {
            throw new Error('Subclass must implement _setupEventListeners()');
        }
    }

    // =================================================================================
    // SECTION: UI Elements - Components and Manager
    // =================================================================================

    class CustomSettingsButton extends UIComponentBase {
        constructor(callbacks, options) {
            super(callbacks);
            this.options = options;
            this.id = this.options.id;
            this.styleId = `${this.id}-style`;
        }

        render() {
            this._injectStyles();
            this.element = h('button', {
                id: this.id,
                title: this.options.title,
                onclick: (e) => {
                    e.stopPropagation();
                    this.callbacks.onClick?.();
                },
            });
            const iconDef = this.options.siteStyles.iconDef;
            if (iconDef) {
                this.element.appendChild(createIconFromDef(iconDef));
            }
            document.body.appendChild(this.element);
            return this.element;
        }

        _injectStyles() {
            if (document.getElementById(this.styleId)) return;
            const { zIndex, siteStyles } = this.options;
            const buttonStyle = CONSTANTS.UI_DEFAULTS.SETTINGS_BUTTON;
            const style = h('style', {
                id: this.styleId,
                textContent: `
                #${this.id} {
                    position: fixed;
                    top: ${buttonStyle.top};
                    right: ${buttonStyle.right};
                    z-index: ${zIndex};
                    width: ${buttonStyle.width};
                    height: ${buttonStyle.height};
                    border-radius: ${siteStyles.borderRadius};
                    background: ${siteStyles.background};
                    border: 1px solid ${siteStyles.borderColor};
                    cursor: pointer;
                    transition: background 0.12s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                }
                #${this.id}:hover {
                    background: ${siteStyles.backgroundHover};
                }
            `,
            });
            document.head.appendChild(style);
        }
    }

    class SettingsPanelComponent extends SettingsPanelBase {
        _createPanelContent() {
            const sliderSettings = CONSTANTS.UI_DEFAULTS.SLIDER;
            const createToggle = (id, title) => {
                return h(`label.${APPID}-toggle-switch`, { title: title }, [h('input', { type: 'checkbox', id: id }), h(`span.${APPID}-toggle-slider`)]);
            };

            return h('div', [
                h(`div.${APPID}-submenu-row-stacked`, [
                    h('label', { htmlFor: `${APPID}-items-per-row-slider` }, 'Items per row'),
                    h(`div.${APPID}-slider-wrapper`, [
                        h('input', {
                            type: 'range',
                            id: `${APPID}-items-per-row-slider`,
                            min: sliderSettings.min,
                            max: sliderSettings.max,
                            step: sliderSettings.step,
                        }),
                        h(`span#${APPID}-slider-value-display`),
                    ]),
                ]),
                h('div', { style: { borderTop: '1px solid var(--yt-spec-border-primary, #ddd)', margin: '12px 0' } }),
                h(`div.${APPID}-submenu-row`, [
                    h('label', { htmlFor: `${APPID}-hide-shorts-toggle` }, 'Hide YouTube Shorts'),
                    createToggle(`${APPID}-hide-shorts-toggle`, 'Hides Shorts videos from shelves, search results, and navigation menus.'),
                ]),
                h(`div.${APPID}-submenu-row`, { style: { marginTop: '12px' } }, [
                    h('label', { htmlFor: `${APPID}-hide-more-topics-toggle` }, "Hide 'Explore more topics'"),
                    createToggle(`${APPID}-hide-more-topics-toggle`, "Hides the 'Explore more topics' section from the feed."),
                ]),
                h('div', { style: { borderTop: '1px solid var(--yt-spec-border-primary, #ddd)', margin: '12px 0' } }),
                h(`div.${APPID}-submenu-row`, [
                    h('label', { htmlFor: `${APPID}-redirect-shorts-toggle` }, 'Redirect Shorts player'),
                    createToggle(`${APPID}-redirect-shorts-toggle`, 'Redirects the Shorts player to the standard video player.'),
                ]),
                h('div', { style: { borderTop: '1px solid var(--yt-spec-border-primary, #ddd)', margin: '12px 0' } }),
                h(`div.${APPID}-submenu-row`, [h('label', { htmlFor: `${APPID}-sync-tabs-toggle` }, 'Sync settings across tabs'), createToggle(`${APPID}-sync-tabs-toggle`, 'Automatically apply settings changes to all open YouTube tabs.')]),
                h(`div#${APPID}-sync-note.${APPID}-settings-note`, { style: { 'text-align': 'right', color: 'var(--yt-spec-text-brand, #c00)' } }),
            ]);
        }

        async populateForm() {
            const config = await this.callbacks.getCurrentConfig();
            const slider = this.element.querySelector(`#${APPID}-items-per-row-slider`);
            slider.value = config.options.itemsPerRow;
            this._updateSliderAppearance(slider);

            this.element.querySelector(`#${APPID}-hide-shorts-toggle`).checked = config.options.hideShorts;
            this.element.querySelector(`#${APPID}-hide-more-topics-toggle`).checked = config.options.hideMoreTopics;
            this.element.querySelector(`#${APPID}-redirect-shorts-toggle`).checked = config.options.redirectShorts;
            this.element.querySelector(`#${APPID}-sync-tabs-toggle`).checked = config.options.syncTabs;
        }

        async _collectDataFromForm() {
            const currentConfig = await this.callbacks.getCurrentConfig();
            const newConfig = JSON.parse(JSON.stringify(currentConfig));
            const slider = this.element.querySelector(`#${APPID}-items-per-row-slider`);
            newConfig.options.itemsPerRow = parseInt(slider.value, 10);

            newConfig.options.hideShorts = this.element.querySelector(`#${APPID}-hide-shorts-toggle`).checked;
            newConfig.options.hideMoreTopics = this.element.querySelector(`#${APPID}-hide-more-topics-toggle`).checked;
            newConfig.options.redirectShorts = this.element.querySelector(`#${APPID}-redirect-shorts-toggle`).checked;
            newConfig.options.syncTabs = this.element.querySelector(`#${APPID}-sync-tabs-toggle`).checked;

            return newConfig;
        }

        _setupEventListeners() {
            // Use event delegation for all toggles and the slider for efficiency.
            this.element.addEventListener('change', (e) => {
                if (e.target.matches('input[type="checkbox"]')) {
                    this.debouncedSave();
                }
            });
            this.element.addEventListener('input', (e) => {
                if (e.target.matches('input[type="range"]')) {
                    this._updateSliderAppearance(e.target);
                    this.debouncedSave();
                }
            });
        }

        _updateSliderAppearance(slider) {
            const display = this.element.querySelector(`#${APPID}-slider-value-display`);
            display.textContent = slider.value;
        }

        _injectStyles() {
            const styleId = `${APPID}-ui-styles`;
            if (document.getElementById(styleId)) return;
            const styles = this.callbacks.siteStyles;
            const style = h('style', {
                id: styleId,
                textContent: `
                #${APPID}-settings-panel {
                    position: fixed;
                    width: 250px;
                    background: ${styles.bg};
                    color: ${styles.text_primary};
                    border: 1px solid ${styles.border_default};
                    border-radius: 12px;
                    box-shadow: 0 4px 4px rgba(0,0,0,0.3);
                    padding: 16px;
                    z-index: 11000;
                    font-size: 14px;
                    transform: translateX(50%);
                }
                .${APPID}-submenu-row, .${APPID}-submenu-row-stacked {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .${APPID}-submenu-row {
                    justify-content: space-between;
                }
                .${APPID}-submenu-row-stacked {
                    flex-direction: column;
                    align-items: stretch; /* Stretch children to fill width */
                }
                .${APPID}-slider-wrapper {
                    display: flex; align-items: center; gap: 16px;
                }
                #${APPID}-items-per-row-slider {
                    flex-grow: 1;
                }
                #${APPID}-slider-value-display {
                    font-weight: 500; min-width: 20px; text-align: right; color: ${styles.text_secondary};
                }
                .${APPID}-toggle-switch {
                    position: relative;
                    display: inline-block;
                    width: 40px;
                    height: 22px;
                    flex-shrink: 0;
                }
                .${APPID}-toggle-switch input {
                    opacity: 0; width: 0; height: 0;
                }
                .${APPID}-toggle-slider {
                    position: absolute; cursor: pointer;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-color: var(--yt-spec-icon-disabled, #ccc);
                    transition: .3s;
                    border-radius: 22px;
                }
                .${APPID}-toggle-slider:before {
                    position: absolute; content: "";
                    height: 16px; width: 16px;
                    left: 3px; bottom: 3px;
                    background-color: white;
                    transition: .3s;
                    border-radius: 50%;
                }
                .${APPID}-toggle-switch input:checked + .${APPID}-toggle-slider {
                    background-color: ${styles.accent_color};
                }
                .${APPID}-toggle-switch input:checked + .${APPID}-toggle-slider:before {
                    transform: translateX(18px);
                }
                .${APPID}-settings-note {
                    font-size: 12px;
                    color: ${styles.text_secondary};
                    margin-top: 8px;
                    text-align: left;
                }
                #${APPID}-sync-note {
                    min-height: 1.5em; /* Reserve space for the message */
                }
            `,
            });
            document.head.appendChild(style);
        }
    }

    class UIManager {
        constructor(getCurrentConfig, siteStyles, callbacks = {}) {
            this.getCurrentConfig = getCurrentConfig;
            this.siteStyles = siteStyles;
            this.callbacks = callbacks;
            this.components = {};
        }

        init() {
            this.components.settingsBtn = new CustomSettingsButton(
                { onClick: () => this.components.settingsPanel.toggle() },
                {
                    id: `${APPID}-settings-btn`,
                    title: `${APPNAME} Settings`,
                    zIndex: CONSTANTS.UI_DEFAULTS.SETTINGS_BUTTON.zIndex,
                    siteStyles: this.siteStyles.SETTINGS_BUTTON,
                }
            );
            this.components.settingsPanel = new SettingsPanelComponent({
                getCurrentConfig: this.getCurrentConfig,
                getAnchorElement: () => this.components.settingsBtn.element,
                siteStyles: this.siteStyles.SETTINGS_PANEL,
                onClose: this.callbacks.onPanelClose, // Pass the callback down
            });

            this.components.settingsBtn.render();
            this.components.settingsPanel.render();
        }
    }

    // =================================================================================
    // SECTION: Sync Manager
    // =================================================================================

    class SyncManager {
        constructor(app) {
            this.app = app;
            this.pendingRemoteConfig = null;
        }

        init() {
            GM_addValueChangeListener(CONSTANTS.CONFIG_KEY, this._handleRemoteChange.bind(this));
        }

        /**
         * Called by MainApp when a local save occurs.
         */
        onSave() {
            this.pendingRemoteConfig = null;
            this._clearConflictNotification();
        }

        /**
         * Called by MainApp (via UIManager) when the settings panel is closed.
         */
        onPanelClose() {
            if (this.pendingRemoteConfig) {
                Logger.log('Applying pending remote config after panel closed.');
                this.app.applyRemoteUpdate(this.pendingRemoteConfig);
                this.pendingRemoteConfig = null;
                this._clearConflictNotification();
            }
        }

        /**
         * Handles the GM_addValueChangeListener event.
         * @private
         */
        async _handleRemoteChange(name, oldValue, newValue, remote) {
            if (!remote) {
                return;
            }

            // Guard: Wait for the local config to be loaded before processing a remote change.
            await this.app.configPromise;
            if (!this.app.configManager.config) {
                Logger.error('Config is still not available after promise resolved. Aborting remote change.');
                return;
            }

            Logger.log('Remote config change detected.');
            let newConfig;
            try {
                newConfig = JSON.parse(newValue);
            } catch (e) {
                Logger.error('Failed to parse remote config.', e);
                return;
            }

            // Check the INCOMING config to see if sync is enabled.
            // This allows a tab to RECEIVE a "sync on" command from another tab.
            if (!newConfig.options.syncTabs) {
                this.app.configManager.config.options.syncTabs = false; // Only update the sync option
                Logger.log('Sync disabled remotely. Updating local config state only.');
                return;
            }

            // Guard: UIManager might not be initialized yet
            if (this.app.uiManager && this.app.uiManager.components.settingsPanel.isOpen()) {
                Logger.log('Settings panel is open. Deferring update and showing notification.');
                this.pendingRemoteConfig = newConfig;
                this._showConflictNotification();
            } else {
                Logger.log('Applying silent remote update.');
                this.app.applyRemoteUpdate(newConfig);
            }
        }

        /**
         * Displays a notification in the settings panel about a remote change.
         * @private
         */
        _showConflictNotification() {
            const noteElement = document.querySelector(`#${APPID}-sync-note`);
            if (noteElement) {
                noteElement.textContent = 'Updated in another tab. Reopen to see changes.';
            }
        }

        /**
         * Clears the notification in the settings panel.
         * @private
         */
        _clearConflictNotification() {
            const noteElement = document.querySelector(`#${APPID}-sync-note`);
            if (noteElement) {
                noteElement.textContent = '';
            }
        }
    }

    // =================================================================================
    // SECTION: Style Manager
    // =================================================================================

    class StyleManager {
        static styleElement = null;

        static init() {
            if (this.styleElement) return;
            this.styleElement = h('style', { id: `${APPID}-dynamic-styles` });
            document.head.appendChild(this.styleElement);
        }

        static update(options) {
            const { itemsPerRow, hideShorts, hideMoreTopics } = options;
            const GAP = 12; // A reasonable default gap in pixels

            let cssText = `
                /* Widen the main content container and remove padding */
                #primary.ytd-two-column-browse-results-renderer,
                #contents.ytd-page-manager {
                    width: 100% !important;
                    max-width: 100% !important;
                    padding: 0 !important;
                }

                /* Apply user settings and layout fixes to the video grid */
                ytd-rich-grid-renderer {
                    --ytd-rich-grid-items-per-row: ${itemsPerRow} !important;
                    max-width: 100% !important;
                    margin: 0 !important;
                    gap: ${GAP}px !important;
                }
            `;

            if (hideShorts) {
                const selectorsToHide = CONSTANTS.SELECTORS.shortsFullScan.join(',\n');
                cssText += `
                    /* CSS to hide Shorts elements */
                    ${selectorsToHide} {
                        display: none !important;
                    }
                `;
            }

            if (hideMoreTopics) {
                cssText += `
                    /* CSS to hide 'Explore more topics' section */
                    ${CONSTANTS.SELECTORS.moreTopics} {
                        display: none !important;
                    }
                `;
            }

            if (this.styleElement.textContent !== cssText) {
                this.styleElement.textContent = cssText;
                Logger.log(`Styles updated: ItemsPerRow=${itemsPerRow}, HideShorts=${hideShorts}, HideMoreTopics=${hideMoreTopics}`);
            }
        }
    }

    // =================================================================================
    // SECTION: Main Application Controller
    // =================================================================================

    class MainApp {
        constructor() {
            this.configManager = null;
            this.uiManager = null;
            this.syncManager = new SyncManager(this);
            this.configPromise = null; // Promise for config load

            // Promise to resolve when DOM-dependent components are initialized
            this.domReadyPromise = new Promise((resolve) => {
                this.resolveDomReadyPromise = resolve;
            });
        }

        /**
         * Stage 1: Initialize non-DOM components and listeners.
         * This runs immediately at document-start.
         */
        init() {
            Logger.log('Initializing (Stage 1)...');

            this.configManager = new ConfigManager();
            this.configPromise = this.configManager.load(); // Start loading config

            this.syncManager.init(); // Initialize the sync listener.

            // Register all event listeners immediately to prevent race conditions
            EventBus.subscribe('config:save', this.handleSave.bind(this));
            document.addEventListener('yt-navigate-start', this.handleRedirect.bind(this));
            document.addEventListener('yt-navigate-finish', this.handleNavigation.bind(this));

            // Register Stage 2: Initialize DOM components when ready
            document.addEventListener('DOMContentLoaded', this.initDOMComponents.bind(this));
        }

        /**
         * Stage 2: Initialize DOM-dependent components.
         * This runs after the DOM is ready.
         */
        async initDOMComponents() {
            Logger.log('Initializing (Stage 2 - DOM Ready)...');

            // Ensure config is loaded before creating UI
            await this.configPromise;
            Logger.log('Config loaded, initializing UI.');

            StyleManager.init();

            const siteStyles = SITE_STYLES.youtube;
            this.uiManager = new UIManager(() => this.configManager.get(), siteStyles, {
                onPanelClose: () => this.syncManager.onPanelClose(),
            });
            this.uiManager.init();

            // Apply initial settings now that UI and config are ready
            this.applySettings();

            // Signal that DOM initialization is complete
            this.resolveDomReadyPromise();
        }

        /**
         * Lightweight method to apply styles.
         * Ensures config is loaded and DOM components (StyleManager) are initialized before acting.
         */
        async applySettings() {
            // Wait for both config and DOM initialization to be complete
            await this.configPromise;
            await this.domReadyPromise;

            const config = this.configManager.get();
            StyleManager.update(config.options);
        }

        /**
         * Applies an update received from another tab.
         * @param {object} newConfig - The new configuration object from the remote tab.
         */
        applyRemoteUpdate(newConfig) {
            this.configManager.config = newConfig;
            this.applySettings();

            // Guard: UIManager might not be initialized yet
            if (this.uiManager) {
                // Repopulate the form in case the user opens it later.
                this.uiManager.components.settingsPanel.populateForm();
            }
        }

        async handleSave(newConfig) {
            this.syncManager.onSave(); // Notify SyncManager that a local save is happening.
            await this.configManager.save(newConfig);
            Logger.log('Configuration saved.');

            // On save, only apply the (fast) stylesheet update.
            this.applySettings();
        }

        async handleRedirect(e) {
            await this.configPromise; // Wait for config
            const config = this.configManager.get();
            if (!config.options.redirectShorts) return;

            const urlString = e.detail.url;
            if (!urlString) return;

            const url = new URL(urlString, window.location.origin);
            const videoId = getShortsVideoId(url.pathname);

            if (videoId) {
                e.preventDefault(); // Stop the navigation to the Shorts player

                // Preserve existing query params and add 'v'
                url.searchParams.set('v', videoId);
                const newUrl = `/watch?${url.searchParams.toString()}`;

                Logger.log(`Shorts navigation detected, redirecting to: ${newUrl}`);
                window.history.pushState({}, '', newUrl);
                window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            }
        }

        handleNavigation() {
            Logger.log(`Navigation finished. Running updates for: ${window.location.href}`);

            // On navigation, apply styles.
            // applySettings() will wait for config if it's not ready yet.
            this.applySettings();
        }
    }

    // =================================================================================
    // SECTION: Entry Point
    // =================================================================================

    if (ExecutionGuard.hasExecuted()) return;
    ExecutionGuard.setExecuted();

    Logger.log('Script loaded. Initializing Stage 1...');
    const app = new MainApp();
    app.init(); // Run Stage 1 initialization immediately
})();

// ==UserScript==
// @name         YouTube-UI-Customizer
// @namespace    https://github.com/p65536
// @version      1.0.0
// @license      MIT
// @description  Enhances your YouTube experience. Customize the video grid layout by adjusting thumbnails per row, hide Shorts content, and automatically redirect the Shorts player to the standard video player.
// @icon         https://www.youtube.com/favicon.ico
// @author       p65536
// @match        https://www.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
    'use strict';

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

    window.__myproject_guard__ = window.__myproject_guard__ || {};
    if (window.__myproject_guard__[`${APPID}_executed`]) return;
    window.__myproject_guard__[`${APPID}_executed`] = true;

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
     * Creates a DOM element using a hyperscript-style syntax.
     * @param {string} tag - Tag name with optional ID/class (e.g., "div#app.container", "my-element").
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
        if (propsOrChildren && Object.prototype.toString.call(propsOrChildren) === '[object Object]') {
            props = propsOrChildren;
            childrenArray = children;
        } else {
            childrenArray = propsOrChildren;
        }

        const directProperties = new Set(['value', 'checked', 'selected', 'textContent']);
        for (const [key, value] of Object.entries(props)) {
            if (key === 'style' && typeof value === 'object') {
                Object.assign(el.style, value);
            } else if (directProperties.has(key)) {
                el[key] = value;
            } else if (key.startsWith('on') && typeof value === 'function') {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else if (value !== false && value != null) {
                el.setAttribute(key, value === true ? '' : value);
            }
        }

        const fragment = document.createDocumentFragment();
        function append(child) {
            if (child == null || child === false) return;
            if (typeof child === 'string' || typeof child === 'number') {
                fragment.appendChild(document.createTextNode(child));
            } else if (Array.isArray(child)) {
                child.forEach(append);
            } else if (child instanceof Node) {
                fragment.appendChild(child);
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
    // SECTION: Configuration and Constants
    // =================================================================================

    const CONSTANTS = {
        CONFIG_KEY: `${APPID}_config`,
        TIMERS: {
            DEBOUNCE_MS: 300,
            FULL_SCAN_DELAY_MS: 150,
        },
        SELECTORS: {
            pageManager: 'ytd-page-manager',
            parentContainers: {
                fullScan: 'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-item-section-renderer, ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytd-rich-section-renderer',
                dynamicOnly: 'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-item-section-renderer',
            },
            // Selectors for the full scan (on navigation/save)
            shortsFullScan: [
                'ytd-reel-shelf-renderer',
                'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
                'ytd-rich-item-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
                'ytd-grid-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
                'ytd-video-renderer:has(a[href*="/shorts/"])',
                'ytd-compact-video-renderer:has(a[href*="/shorts/"])',
                'ytd-guide-entry-renderer[guide-entry-title="Shorts"]',
                'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
            ],
            // Lightweight selectors for dynamically added content (on scroll)
            shortsDynamicOnly: [
                'ytd-rich-item-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
                'ytd-grid-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
                'ytd-video-renderer:has(a[href*="/shorts/"])',
                'ytd-compact-video-renderer:has(a[href*="/shorts/"])',
            ],
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
            }, 300);
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
        constructor(callbacks) {
            super(callbacks);
            this.debouncedSave = debounce(async () => {
                const newConfig = await this._collectDataFromForm();
                EventBus.publish('config:save', newConfig);
            }, 300);
            this._handleDocumentClick = this._handleDocumentClick.bind(this);
        }

        hide() {
            this.element.style.display = 'none';
            document.removeEventListener('click', this._handleDocumentClick, true);
            this.callbacks.onClose?.(); // Notify that the panel has closed
        }
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
                h(`div.${APPID}-submenu-row`, [h('label', { htmlFor: `${APPID}-hide-shorts-toggle` }, 'Hide YouTube Shorts'), createToggle(`${APPID}-hide-shorts-toggle`, 'Hides Shorts videos. When turned off, a page reload is required to show them again.')]),
                h(`div.${APPID}-settings-note`, '* Turning this off requires a page reload to take effect.'),
                h('div', { style: { borderTop: '1px solid var(--yt-spec-border-primary, #ddd)', margin: '12px 0' } }),
                h(`div.${APPID}-submenu-row`, [h('label', { htmlFor: `${APPID}-redirect-shorts-toggle` }, 'Redirect Shorts player'), createToggle(`${APPID}-redirect-shorts-toggle`, 'Redirects the Shorts player to the standard video player.')]),
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
            this.element.querySelector(`#${APPID}-redirect-shorts-toggle`).checked = config.options.redirectShorts;
            this.element.querySelector(`#${APPID}-sync-tabs-toggle`).checked = config.options.syncTabs;
        }

        async _collectDataFromForm() {
            const currentConfig = await this.callbacks.getCurrentConfig();
            const newConfig = JSON.parse(JSON.stringify(currentConfig));
            const slider = this.element.querySelector(`#${APPID}-items-per-row-slider`);
            newConfig.options.itemsPerRow = parseInt(slider.value, 10);

            newConfig.options.hideShorts = this.element.querySelector(`#${APPID}-hide-shorts-toggle`).checked;
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
                // If the incoming change is to turn sync OFF, we still need to update
                // the local config to reflect that, but we won't apply other settings.
                this.app.configManager.config = newConfig;
                Logger.log('Sync disabled remotely. Updating local config state only.');
                return;
            }

            if (this.app.uiManager.components.settingsPanel.isOpen()) {
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
            const { itemsPerRow, hideShorts } = options;
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

            if (this.styleElement.textContent !== cssText) {
                this.styleElement.textContent = cssText;
                Logger.log(`Styles updated: ItemsPerRow=${itemsPerRow}, HideShorts=${hideShorts}`);
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
            this.observer = null;
            this.syncManager = new SyncManager(this);
            this.debouncedProcessNodes = debounce((nodes) => this.processNodes(nodes), 300);
        }

        /**
         * Lightweight processor for dynamically added nodes (e.g., from infinite scroll).
         * It only searches for video items, not static elements like sidebar links.
         * @param {NodeList} nodes - The nodes to process.
         */
        processNodes(nodes) {
            const config = this.configManager.get();
            if (!config.options.hideShorts) return;

            const dynamicSelectors = CONSTANTS.SELECTORS.shortsDynamicOnly;
            let removedCount = 0;

            for (const node of nodes) {
                if (node.nodeType !== 1) continue;

                for (const selector of dynamicSelectors) {
                    const elements = node.matches(selector) ? [node] : node.querySelectorAll(selector);
                    elements.forEach((el) => {
                        if (el.dataset.ytteProcessed) return;
                        const parentToRemove = el.closest(CONSTANTS.SELECTORS.parentContainers.dynamicOnly);
                        (parentToRemove || el).remove();
                        removedCount++;
                    });
                }
            }
            if (removedCount > 0) {
                Logger.log(`Removed ${removedCount} new Shorts item(s).`);
            }
        }

        /**
         * Heavyweight full-page scan to remove all types of Shorts elements.
         * Called only on major page loads/navigations.
         */
        runFullShortsScan() {
            const config = this.configManager.get();
            if (!config.options.hideShorts) return;

            const allShortsSelectors = CONSTANTS.SELECTORS.shortsFullScan;
            let removedCount = 0;

            for (const selector of allShortsSelectors) {
                document.querySelectorAll(selector).forEach((el) => {
                    if (el.dataset.ytteProcessed) return;

                    const parentToRemove = el.closest(CONSTANTS.SELECTORS.parentContainers.fullScan);
                    const target = parentToRemove || el;

                    target.remove();
                    target.dataset.ytteProcessed = 'true';
                    removedCount++;
                });
            }
            if (removedCount > 0) {
                Logger.log(`Initial scan removed ${removedCount} Shorts element(s).`);
            }
        }

        /**
         * Lightweight method to apply styles. Called frequently.
         */
        applySettings() {
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
            this.runFullShortsScan();
            // Repopulate the form in case the user opens it later.
            this.uiManager.components.settingsPanel.populateForm();
        }

        handleDOMChanges(mutationsList) {
            const addedNodes = [];
            for (const mutation of mutationsList) {
                addedNodes.push(...mutation.addedNodes);
            }
            if (addedNodes.length > 0) {
                // Call the lightweight processor for new nodes.
                this.debouncedProcessNodes(addedNodes);
            }
        }

        async handleSave(newConfig) {
            this.syncManager.onSave(); // Notify SyncManager that a local save is happening.
            await this.configManager.save(newConfig);
            Logger.log('Configuration saved.');

            // On save, only apply the (fast) stylesheet update.
            this.applySettings();

            // If the user just turned on "hideShorts", run a full scan once to clean the page.
            if (newConfig.options.hideShorts) {
                this.runFullShortsScan();
            }
        }

        handleNavigation() {
            Logger.log(`Navigation finished. Running updates for: ${window.location.href}`);
            const config = this.configManager.get();

            if (config.options.redirectShorts && window.location.pathname.startsWith('/shorts/')) {
                const videoId = window.location.pathname.split('/shorts/')[1];
                if (videoId) {
                    const newUrl = `/watch?v=${videoId}`;
                    Logger.log(`Shorts page detected, redirecting to: ${newUrl}`);
                    window.location.href = newUrl;
                    return;
                }
            }

            // On navigation, apply styles immediately and run a full, heavyweight scan.
            this.applySettings();
            setTimeout(() => {
                this.runFullShortsScan();
            }, CONSTANTS.TIMERS.FULL_SCAN_DELAY_MS);
        }

        async init() {
            Logger.log('Initializing...');

            this.configManager = new ConfigManager();
            await this.configManager.load();

            StyleManager.init();
            this.syncManager.init(); // Initialize the sync listener.

            const siteStyles = SITE_STYLES.youtube;
            this.uiManager = new UIManager(() => this.configManager.get(), siteStyles, {
                onPanelClose: () => this.syncManager.onPanelClose(),
            });
            this.uiManager.init();

            EventBus.subscribe('config:save', this.handleSave.bind(this));
            document.addEventListener('yt-navigate-finish', this.handleNavigation.bind(this));

            this.observer = new MutationObserver(this.handleDOMChanges.bind(this));

            // Use a preliminary observer to find the stable content container, then switch to it.
            const parentObserver = new MutationObserver((mutations, obs) => {
                const targetNode = document.querySelector(CONSTANTS.SELECTORS.pageManager);
                if (targetNode) {
                    Logger.log('Found ytd-page-manager. Starting primary observer.');
                    this.observer.observe(targetNode, { childList: true, subtree: true });
                    obs.disconnect();
                }
            });
            parentObserver.observe(document.body, { childList: true, subtree: true });

            this.handleNavigation();
        }
    }

    // =================================================================================
    // SECTION: Entry Point
    // =================================================================================

    Logger.log('Script loaded.');
    const app = new MainApp();
    app.init();
})();

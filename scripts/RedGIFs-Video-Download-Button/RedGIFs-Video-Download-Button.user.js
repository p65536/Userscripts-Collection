// ==UserScript==
// @name         RedGIFs Video Download Button
// @namespace    https://github.com/p65536
// @version      2.6.0
// @license      MIT
// @description  Adds a download button (for one-click HD downloads) and an "Open in New Tab" button to each video on the RedGIFs site.
// @icon         https://www.redgifs.com/favicon.ico
// @author       p65536
// @match        https://*.redgifs.com/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.registerMenuCommand
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
  const APPNAME = 'RedGIFs Video Download Button';
  const LOG_PREFIX = `[${APPID.toUpperCase()}]`;

  // --- Temporal API Polyfill ---
  // Lightweight fallback for outdated browsers that do not support the Temporal API yet.
  const globalObj = typeof globalThis !== 'undefined' ? globalThis : window;
  if (typeof globalObj.Temporal === 'undefined') {
    /** @type {any} */ (globalObj).Temporal = {
      Now: {
        instant: () => ({
          epochMilliseconds: Date.now(),
        }),
        timeZoneId: () => {
          try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
          } catch {
            return 'UTC';
          }
        },
      },
      Instant: {
        fromEpochMilliseconds: (ms) => ({
          toZonedDateTimeISO: () => {
            const d = new Date(ms);
            return {
              year: d.getFullYear(),
              month: d.getMonth() + 1,
              day: d.getDate(),
              hour: d.getHours(),
              minute: d.getMinutes(),
              second: d.getSeconds(),
            };
          },
        }),
      },
    };
  }

  class HttpError extends Error {
    /**
     * @param {number} status
     * @param {string} message
     */
    constructor(status, message) {
      super(message);
      this.name = 'HttpError';
      this.status = status;
    }
  }

  // =================================================================================
  // SECTION: Configuration Definitions
  // =================================================================================

  const CONSTANTS = {
    CONFIG_KEY: `${APPID}_config`,
    VIDEO_CONTAINER_SELECTOR: '.GifPreview',
    VISIBLE_VIDEO_CONTAINER_SELECTOR: '.GifPreview.VisibleOnly',
    TILE_ITEM_SELECTOR: '.tileItem',
    WATCH_URL_BASE: 'https://www.redgifs.com/watch/',
    TOAST_DURATION: 3000,
    TOAST_ERROR_DURATION: 6000,
    TOAST_FADE_OUT_DURATION: 300,
    ICON_REVERT_DELAY: 2000,
    CANCEL_LOCK_DURATION: 600, // (ms) Duration to lock download button to prevent mis-click cancel
    MAX_FILENAME_LENGTH: 150, // Maximum length for the generated filename
    CONTEXT_TYPE: {
      TILE: 'TILE',
      PREVIEW: 'PREVIEW',
    },
    MODAL: {
      WIDTH: 400,
      Z_INDEX: 10001,
    },
    MEDIA_TYPE: {
      VIDEO: 'VIDEO',
      IMAGE: 'IMAGE',
    },
    REGEX: {
      IMAGE_EXT: /\.(jpg|jpeg|png|gif|webp)$/i,
      SILENT_VIDEO: /-silent(?=\.mp4)/,
      IMAGE_SIZE_MEDIUM: /-medium(?=\.jpg)/,
      IMAGE_SIZE_SMALL: /-small(?=\.jpg)/,
    },
    IMAGE_SIZE_SCORE: {
      LARGE: 3,
      MEDIUM: 2,
      SMALL: 1,
    },
  };

  /**
   * Default configuration settings.
   * Contains the initial values and descriptions for user-configurable options.
   */
  const DEFAULT_CONFIG = {
    common: {
      /** Show buttons only on hover (desktop). */
      showOnlyOnHover: false,
    },
    download: {
      /** Filename template using placeholders ({user}, {date}, {id}, {tags}). */
      filenameTemplate: '{user}_{date}_{id}',
      /** Time (in ms) to hold Blob URL in memory before revocation. */
      blobRevokeTime: 60000,
    },
    openInNewTab: {
      /** Enable "Open in New Tab" button. */
      enabled: true,
      /** Viewer type: 'default' or 'clean'. */
      viewerType: 'default',
    },
    developer: {
      /** Console log level ('error', 'warn', 'info', 'log', 'debug'). */
      logger_level: 'log',
    },
  };

  const EVENTS = {
    CONFIG_UPDATED: `${APPID}:configUpdated`,
    CONFIG_SAVE_SUCCESS: `${APPID}:configSaveSuccess`,
  };

  // =================================================================================
  // SECTION: Style Definitions
  // =================================================================================
  const UI_STYLES_TEMPLATE = `
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
background-color: rgb(0 0 0 / 0.6);
border: none;
cursor: pointer;
display: flex;
align-items: center;
justify-content: center;
opacity: 1;
text-decoration: none; /* For <a> tag */
color: inherit; /* Prevent blue link color */
}
.${APPID}-open-in-new-tab-btn:hover {
background-color: rgb(0 0 0 / 0.8);
}
/* Download Button on Thumbnails */
.${APPID}-tile-download-btn {
position: absolute;
top: 40px; /* Positioned below the open-in-new-tab button (8px + 28px + 4px) */
right: 8px;
z-index: 10;
width: 28px;
height: 28px;
padding: 0;
border-radius: 4px;
background-color: red;
border: none;
cursor: pointer;
display: grid;
place-items: center;
}
.${APPID}-tile-download-btn:not(:disabled):hover {
background-color: #c00;
}

/* Buttons on Video Preview */
${CONSTANTS.VIDEO_CONTAINER_SELECTOR} {
position: relative;
}
.${APPID}-preview-open-btn {
position: absolute;
top: 8px;
right: 8px;
z-index: 90;
width: 32px;
height: 32px;
padding: 4px;
border-radius: 4px;
background-color: rgb(0 0 0 / 0.6);
border: none;
cursor: pointer;
display: flex;
align-items: center;
justify-content: center;
text-decoration: none; /* For <a> tag */
color: inherit; /* Prevent blue link color */
}
.${APPID}-preview-open-btn:hover {
background-color: rgb(0 0 0 / 0.8);
}
.${APPID}-preview-download-btn {
position: absolute;
top: 44px; /* Positioned below the open-in-new-tab button */
right: 8px;
z-index: 90;
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
.${APPID}-preview-download-btn:not(:disabled):hover {
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
.${APPID}-toast-success { background-color: rgb(40 167 69); }
.${APPID}-toast-error { background-color: rgb(220 53 69); }
.${APPID}-toast-info { background-color: rgb(23 162 184); }

/* Mobile: Adjust button position to avoid overlapping native UI */
.App.phone .${APPID}-preview-open-btn {
/* Offset by toolbar height (assumed 56px) + 8px original top */
top: 64px; 
}
.App.phone .${APPID}-preview-download-btn {
/* Offset by toolbar height (assumed 56px) + 44px original top */
top: 100px;
}

/* Hide buttons when the site menu is active */
body:has(.activeBurgerMenu) .${APPID}-preview-open-btn,
body:has(.activeBurgerMenu) .${APPID}-preview-download-btn {
display: none !important;
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

/* Global Download Button Disabled State */
.${APPID}-tile-download-btn:disabled,
.${APPID}-preview-download-btn:disabled,
.clean-download-btn:disabled {
opacity: 0.6;
cursor: not-allowed;
}
`;

  // Dark theme styles specifically for the settings modal
  const MODAL_STYLES = `
.${APPID}-modal-overlay {
position: fixed; top: 0; left: 0; width: 100%; height: 100%;
background: rgb(0 0 0 / 0.7);
z-index: ${CONSTANTS.MODAL.Z_INDEX};
display: flex; align-items: center; justify-content: center;
}
.${APPID}-modal-box {
background: #222; color: #eee;
width: ${CONSTANTS.MODAL.WIDTH}px;
max-width: 90vw;
border: 1px solid #444;
border-radius: 8px;
box-shadow: 0 4px 16px rgb(0 0 0 / 0.5);
display: flex; flex-direction: column;
font-family: sans-serif; font-size: 14px;
}
.${APPID}-modal-header {
padding: 12px 16px;
font-size: 1.1em; font-weight: bold;
border-bottom: 1px solid #444;
display: flex; justify-content: space-between; align-items: center;
}
.${APPID}-modal-content {
padding: 16px;
overflow-y: auto;
max-height: 80vh;
}
.${APPID}-modal-footer {
padding: 12px 16px;
border-top: 1px solid #444;
display: flex; justify-content: space-between;
align-items: center;
}
.${APPID}-footer-actions {
display: flex; gap: 8px;
}
.${APPID}-form-group {
margin-bottom: 16px;
}
.${APPID}-form-label {
display: block; margin-bottom: 6px; font-weight: 500; color: #ccc;
}
.${APPID}-form-desc {
font-size: 0.85em; color: #999; margin-bottom: 6px;
}
.${APPID}-form-input {
width: 100%; padding: 6px 8px;
background: #333; border: 1px solid #555; border-radius: 4px;
color: #fff; box-sizing: border-box;
}
.${APPID}-form-input:focus {
border-color: #007bff; outline: none;
}
.${APPID}-checkbox-wrapper {
display: flex; align-items: center; gap: 8px;
}
.${APPID}-btn {
padding: 6px 16px; border-radius: 4px; border: none;
cursor: pointer; font-size: 14px; font-weight: 500;
transition: background 0.2s;
}
.${APPID}-btn-primary {
background: #007bff; color: white;
}
.${APPID}-btn-primary:hover { background: #0056b3; }
.${APPID}-btn-secondary {
background: #555; color: white;
}
.${APPID}-btn-secondary:hover { background: #444; }

/* New Styles for Preview and Warning */
.${APPID}-input-preview-label {
display: block; font-size: 0.85em; color: #888; margin-top: 12px;
}
.${APPID}-input-preview-content {
display: block; font-size: 1.2em; color: #eee; margin-top: 4px; font-family: monospace; word-break: break-all;
transition: color 0.2s;
}
.${APPID}-preview-valid {
color: #4cd964 !important; /* Pastel Green for valid state */
}
.${APPID}-preview-error {
color: #ff6b6b !important; /* Soft Red for error (forbidden chars) */
}
.${APPID}-preview-fallback {
color: #ffb74d !important; /* Soft Orange for fallback state */
}
.${APPID}-text-warning {
display: none; font-size: 0.85em; color: #ffc107; margin-top: 4px;
}
`;
  // Minimalist styles for the clean video viewer
  const CLEAN_VIEWER_STYLES = `
video {
max-width: 100%;
max-height: 100%;
outline: none;
box-shadow: 0 0 20px rgb(0 0 0 / 0.5);
}
.clean-open-btn {
position: absolute;
top: 8px;
right: 8px;
z-index: 90;
width: 32px;
height: 32px;
padding: 4px;
border-radius: 4px;
background-color: rgb(0 0 0 / 0.6);
border: none;
cursor: pointer;
display: flex;
align-items: center;
justify-content: center;
text-decoration: none;
color: inherit;
box-sizing: border-box;
}
.clean-open-btn:hover {
background-color: rgb(0 0 0 / 0.8);
}
.clean-download-btn {
position: absolute;
top: 44px;
right: 8px;
z-index: 90;
width: 32px;
height: 32px;
padding: 0;
border-radius: 4px;
background-color: red;
border: none;
cursor: pointer;
display: grid;
place-items: center;
box-sizing: border-box;
}
.clean-download-btn:not(:disabled):hover {
background-color: #c00;
}
`;

  // =================================================================================
  // SECTION: Icon Definitions
  // =================================================================================

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
    PLAY_ARROW: {
      tag: 'svg',
      props: BASE_ICON_PROPS,
      children: [
        { tag: 'path', props: { d: 'M0 0h24v24H0V0z', fill: 'none' } },
        { tag: 'path', props: { d: 'M8 5v14l11-7z' } },
      ],
    },
  };

  // =================================================================================
  // SECTION: Logging Utility
  // Description: Centralized logging interface for consistent log output across modules.
  //              Handles log level control, message formatting, and console API wrapping.
  // =================================================================================

  class Logger {
    /** @property {object} levels - Defines the numerical hierarchy of log levels. */
    static levels = {
      error: 0,
      warn: 1,
      info: 2,
      log: 3,
      debug: 4,
    };
    /** @property {string} level - The current active log level. */
    static level = 'log'; // Default level

    /**
     * Defines the available badge styles.
     * @property {object} styles
     */
    static styles = {
      BASE: 'color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      RED: 'background: #dc3545;',
      YELLOW: 'background: #ffc107; color: black;',
      GREEN: 'background: #28a745;',
      BLUE: 'background: #007bff;',
      GRAY: 'background: #6c757d;',
      ORANGE: 'background: #fd7e14;',
      PINK: 'background: #e83e8c;',
      PURPLE: 'background: #6f42c1;',
      CYAN: 'background: #17a2b8; color: black;',
      TEAL: 'background: #20c997; color: black;',
    };

    /**
     * Maps log levels to default badge styles.
     * @private
     */
    static _defaultStyles = {
      error: this.styles.RED,
      warn: this.styles.YELLOW,
      info: this.styles.BLUE,
      log: this.styles.GREEN,
      debug: this.styles.GRAY,
    };

    /**
     * Sets the current log level.
     * @param {string} level The new log level. Must be one of 'error', 'warn', 'info', 'log', 'debug'.
     */
    static setLevel(level) {
      if (Object.prototype.hasOwnProperty.call(this.levels, level)) {
        this.level = level;
      } else {
        // Use default style (empty string) for the badge
        this._out('warn', 'INVALID LEVEL', '', `Invalid log level "${level}". Valid levels are: ${Object.keys(this.levels).join(', ')}. Level not changed.`);
      }
    }

    /**
     * Internal method to output logs if the level permits.
     * @private
     * @param {string} level - The log level ('error', 'warn', 'info', 'log', 'debug').
     * @param {string} badgeText - The text inside the badge. If empty, no badge is shown.
     * @param {string} badgeStyle - The background-color style (from Logger.styles). If empty, uses default.
     * @param {...any} args - The messages to log.
     */
    static _out(level, badgeText, badgeStyle, ...args) {
      if (this.levels[this.level] >= this.levels[level]) {
        const consoleMethod = console[level] || console.log;

        if (badgeText !== '') {
          // Badge mode: Use %c formatting
          let style = badgeStyle;
          if (style === '') {
            style = this._defaultStyles[level] || this.styles.GRAY;
          }
          const combinedStyle = `${this.styles.BASE} ${style}`;

          consoleMethod(
            `%c${LOG_PREFIX}%c %c${badgeText}%c`,
            'font-weight: bold;', // Style for the prefix
            'color: inherit;', // Reset for space
            combinedStyle, // Style for the badge
            'color: inherit;', // Reset for the rest of the message
            ...args
          );
        } else {
          // No badge mode: Direct output for better object inspection
          consoleMethod(LOG_PREFIX, ...args);
        }
      }
    }

    /**
     * Internal method to start a log group if the level permits (debug or higher).
     * @private
     * @param {'group'|'groupCollapsed'} method - The console method to use.
     * @param {string} badgeText
     * @param {string} badgeStyle
     * @param {...any} args
     */
    static _groupOut(method, badgeText, badgeStyle, ...args) {
      if (this.levels[this.level] >= this.levels.debug) {
        const consoleMethod = console[method];

        if (badgeText !== '') {
          let style = badgeStyle;
          if (style === '') {
            style = this.styles.GRAY;
          }
          const combinedStyle = `${this.styles.BASE} ${style}`;

          consoleMethod(`%c${LOG_PREFIX}%c %c${badgeText}%c`, 'font-weight: bold;', 'color: inherit;', combinedStyle, 'color: inherit;', ...args);
        } else {
          consoleMethod(LOG_PREFIX, ...args);
        }
      }
    }

    /**
     * @param {string} badgeText
     * @param {string} badgeStyle
     * @param {...any} args
     */
    static error(badgeText, badgeStyle, ...args) {
      this._out('error', badgeText, badgeStyle, ...args);
    }

    /**
     * @param {string} badgeText
     * @param {string} badgeStyle
     * @param {...any} args
     */
    static warn(badgeText, badgeStyle, ...args) {
      this._out('warn', badgeText, badgeStyle, ...args);
    }

    /**
     * @param {string} badgeText
     * @param {string} badgeStyle
     * @param {...any} args
     */
    static info(badgeText, badgeStyle, ...args) {
      this._out('info', badgeText, badgeStyle, ...args);
    }

    /**
     * @param {string} badgeText
     * @param {string} badgeStyle
     * @param {...any} args
     */
    static log(badgeText, badgeStyle, ...args) {
      this._out('log', badgeText, badgeStyle, ...args);
    }

    /**
     * Logs messages for debugging. Only active in 'debug' level.
     * @param {string} badgeText
     * @param {string} badgeStyle
     * @param {...any} args
     */
    static debug(badgeText, badgeStyle, ...args) {
      this._out('debug', badgeText, badgeStyle, ...args);
    }

    /**
     * Starts a timer for performance measurement. Only active in 'debug' level.
     * @param {string} label The label for the timer.
     */
    static time(label) {
      if (this.levels[this.level] >= this.levels.debug) {
        console.time(`${LOG_PREFIX} ${label}`);
      }
    }

    /**
     * Ends a timer and logs the elapsed time. Only active in 'debug' level.
     * @param {string} label The label for the timer, must match the one used in time().
     */
    static timeEnd(label) {
      if (this.levels[this.level] >= this.levels.debug) {
        console.timeEnd(`${LOG_PREFIX} ${label}`);
      }
    }

    /**
     * Starts a log group. Only active in 'debug' level.
     * @param {string} badgeText
     * @param {string} badgeStyle
     * @param {...any} args The title for the log group.
     */
    static group(badgeText, badgeStyle, ...args) {
      this._groupOut('group', badgeText, badgeStyle, ...args);
    }

    /**
     * Starts a collapsed log group. Only active in 'debug' level.
     * @param {string} badgeText
     * @param {string} badgeStyle
     * @param {...any} args The title for the log group.
     */
    static groupCollapsed(badgeText, badgeStyle, ...args) {
      this._groupOut('groupCollapsed', badgeText, badgeStyle, ...args);
    }

    /**
     * Closes the current log group. Only active in 'debug' level.
     * @returns {void}
     */
    static groupEnd() {
      if (this.levels[this.level] >= this.levels.debug) {
        console.groupEnd();
      }
    }
  }

  // Alias for ease of use
  const LOG_STYLES = Logger.styles;

  // =================================================================================
  // SECTION: Execution Guard
  // Description: Prevents the script from being executed multiple times per page.
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
      window[this.#GUARD_KEY] ??= {};
      window[this.#GUARD_KEY][this.#APP_KEY] = true;
    }
  }

  // =================================================================================
  // SECTION: General Utilities
  // =================================================================================

  /**
   * @typedef {Node|string|number|boolean|null|undefined} HChild
   */
  /**
   * Creates a DOM element using a hyperscript-style syntax.
   * @param {string} tag - Tag name with optional ID/class (e.g., "div#app.container", "my-element").
   * @param {object | HChild | HChild[]} [propsOrChildren] - Attributes object or children.
   * @param {HChild | HChild[]} [children] - Children (if props are specified).
   * @returns {HTMLElement | SVGElement} The created DOM element.
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
      const classes = classList.replaceAll('.', ' ').trim();
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
            Logger.warn('UNSAFE URL', LOG_STYLES.YELLOW, `Blocked potentially unsafe protocol "${parsedUrl.protocol}" in attribute "${key}":`, url);
          }
        } catch {
          el.setAttribute(key, '#');
          Logger.warn('INVALID URL', LOG_STYLES.YELLOW, `Blocked invalid or relative URL in attribute "${key}":`, url);
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
      } else if (key.startsWith('on')) {
        if (typeof value === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), value);
        }
      } else if (key === 'className') {
        const classes = String(value).trim();
        if (classes) {
          el.classList.add(...classes.split(/\s+/));
        }
      } else if (key.startsWith('aria-')) {
        el.setAttribute(key, String(value));
      }
      // 4. Default attribute handling.
      else if (value !== false && value !== null && typeof value !== 'undefined') {
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

    if (el instanceof HTMLElement || el instanceof SVGElement) {
      return el;
    }
    throw new Error('Created element is not a valid HTMLElement or SVGElement');
  }

  /**
   * Recursively builds a DOM element from a definition object using the h() function.
   * @param {object} def The definition object for the element.
   * @returns {HTMLElement | SVGElement | null} The created DOM element.
   */
  function createIconFromDef(def) {
    if (!def) return null;
    const children = def.children?.map((child) => createIconFromDef(child)) ?? [];
    return h(def.tag, def.props, children);
  }

  const CACHED_ICONS = Object.fromEntries(Object.entries(ICONS).map(([key, def]) => [key, createIconFromDef(def)]));

  /**
   * Helper function to check if an item is a non-array object.
   * @param {unknown} item The item to check.
   * @returns {item is Record<string, any>}
   */
  function isObject(item) {
    return !!(item && typeof item === 'object' && !Array.isArray(item));
  }

  /**
   * Creates a deep copy of a JSON-serializable object.
   * @template T
   * @param {T} obj The object to clone.
   * @returns {T} The deep copy of the object.
   */
  function deepClone(obj) {
    try {
      return structuredClone(obj);
    } catch (e) {
      Logger.error('CLONE FAILED', '', 'deepClone failed. Data contains non-clonable items.', e);
      throw e;
    }
  }

  /**
   * Recursively resolves the configuration by overlaying source properties onto the target object.
   * The target object is mutated. This handles recursive updates for nested objects but overwrites arrays/primitives.
   *
   * [MERGE BEHAVIOR]
   * Keys present in 'source' but missing in 'target' are ignored.
   * The 'target' object acts as a schema; it must contain all valid keys.
   *
   * @param {object} target The target object (e.g., a deep copy of default config).
   * @param {object} source The source object (e.g., user config).
   * @returns {object} The mutated target object.
   */
  function resolveConfig(target, source) {
    for (const [key, sourceVal] of Object.entries(source)) {
      // Security: Prevent prototype pollution
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }

      // Strict check: Ignore keys that do not exist in the target (default config).
      if (!Object.hasOwn(target, key)) {
        continue;
      }

      const targetVal = target[key];

      if (isObject(sourceVal) && isObject(targetVal)) {
        // If both are objects, recurse
        resolveConfig(targetVal, sourceVal);
      } else if (typeof sourceVal !== 'undefined') {
        // Otherwise, overwrite or set the value from the source
        target[key] = sourceVal;
      }
    }
    return target;
  }

  /**
   * @param {number | undefined} unixTimestamp
   * @returns {string}
   */
  function formatTimestamp(unixTimestamp) {
    if (typeof unixTimestamp !== 'number' || isNaN(unixTimestamp)) {
      return '';
    }
    const zonedDateTime = Temporal.Instant.fromEpochMilliseconds(Math.floor(unixTimestamp * 1000)).toZonedDateTimeISO(Temporal.Now.timeZoneId());
    const yyyy = zonedDateTime.year;
    const mm = String(zonedDateTime.month).padStart(2, '0');
    const dd = String(zonedDateTime.day).padStart(2, '0');
    const hh = String(zonedDateTime.hour).padStart(2, '0');
    const ii = String(zonedDateTime.minute).padStart(2, '0');
    const ss = String(zonedDateTime.second).padStart(2, '0');
    return `${yyyy}${mm}${dd}_${hh}${ii}${ss}`;
  }

  /**
   * Safely extracts the file extension (including the dot) from a URL.
   * Considers query parameters and hashes.
   * @param {string} url - The URL to parse.
   * @returns {string} The extension (e.g., ".mp4") or an empty string if not found.
   */
  function getExtension(url) {
    try {
      // Use URL constructor to isolate pathname, ignoring query/hash
      const pathname = new URL(url).pathname;

      // Find the last dot
      const lastDotIndex = pathname.lastIndexOf('.');

      // If no dot is found, or if it's the first character (e.g., "/.config"),
      // it's not a valid extension for our purpose.
      if (lastDotIndex < 1) {
        return ''; // No extension found
      }

      // Return the substring from the last dot to the end.
      return pathname.substring(lastDotIndex); // e.g., ".mp4"
    } catch (e) {
      Logger.warn('URL ERROR', LOG_STYLES.YELLOW, 'Could not parse URL to get extension:', url, e);
      return ''; // Return empty on URL parsing failure
    }
  }

  /**
   * Resolves a filename template with provided replacements, handling sanitization.
   * @param {string} template - The filename template (e.g., "{user}_{date}_{id}").
   * @param {Object<string, string>} replacements - Key-value pairs for replacements.
   * @returns {string} The resolved and sanitized filename.
   */
  function resolveFilename(template, replacements) {
    // 1. Validate bracket checks (simple balance check for {})
    const openCount = (template.match(/\{/g) || []).length;
    const closeCount = (template.match(/\}/g) || []).length;

    let validTemplate = template;
    // Fallback to default if brackets are unbalanced
    if (openCount !== closeCount) {
      Logger.warn('TEMPLATE', LOG_STYLES.YELLOW, 'Filename template has unbalanced brackets. Falling back to default.');
      validTemplate = '{user}_{date}_{id}';
    }

    // 2. Replace placeholders
    let result = validTemplate.replace(/\{(\w+)\}/g, (match, key) => {
      // If key exists in replacements, use it (even if empty string).
      // If key does NOT exist in replacements, keep the original placeholder string.
      if (Object.hasOwn(replacements, key)) {
        const val = replacements[key];
        return val ? String(val) : '';
      }
      return match;
    });

    // 3. Sanitize
    // Step A: Remove forbidden characters (Windows/Linux/macOS safe)
    // Removes only OS reserved characters: < > : " / \ | ? *
    result = result.replace(/[<>:"/\\|?*]/g, '');

    // Step B: Replace consecutive separators (space, underscore, hyphen, dot) with a single instance of the first match.
    // This prevents double underscores like "__" or "_-_" when a placeholder is empty.
    result = result.replace(/([ _.-])\1+/g, '$1');

    // Remove separators from start and end
    result = result.replace(/^[ _.-]+|[ _.-]+$/g, '');

    // Fallback if result becomes empty (unlikely but possible if all data is missing)
    if (!result) {
      result = 'video';
    }

    // Truncate to maximum length to prevent OS file name length errors
    if (result.length > CONSTANTS.MAX_FILENAME_LENGTH) {
      result = result.substring(0, CONSTANTS.MAX_FILENAME_LENGTH);
      // Remove trailing separator if truncation occurred exactly after/on a separator
      result = result.replace(/[ _.-]+$/, '');
    }

    return result;
  }

  // =================================================================================
  // SECTION: Event-Driven Architecture (Pub/Sub)
  // Description: A event bus for decoupled communication between classes.
  // =================================================================================

  const EventBus = {
    events: {},
    uiWorkQueue: [],
    isUiWorkScheduled: false,
    _logAggregation: {},
    // prettier-ignore
    /** @type {Set<string>} */
    _aggregatedEvents: new Set([
      ]),
    _aggregationDelay: 500, // ms

    /**
     * Subscribes a listener to an event using a unique key.
     * If a subscription with the same event and key already exists, it will be overwritten.
     * @param {string} event The event name.
     * @param {Function} listener The callback function.
     * @param {string} key A unique key for this subscription (e.g., 'ClassName.methodName').
     */
    subscribe(event, listener, key) {
      if (!key) {
        Logger.error('', '', 'EventBus.subscribe requires a unique key.');
        return;
      }
      this.events[event] ??= new Map();
      this.events[event].set(key, listener);
    },
    /**
     * Subscribes a listener that will be automatically unsubscribed after one execution.
     * @param {string} event The event name.
     * @param {Function} listener The callback function.
     * @param {string} key A unique key for this subscription.
     */
    once(event, listener, key) {
      if (!key) {
        Logger.error('', '', 'EventBus.once requires a unique key.');
        return;
      }
      const onceListener = (...args) => {
        this.unsubscribe(event, key);
        return listener(...args);
      };
      this.subscribe(event, onceListener, key);
    },
    /**
     * Unsubscribes a listener from an event using its unique key.
     * @param {string} event The event name.
     * @param {string} key The unique key used during subscription.
     */
    unsubscribe(event, key) {
      if (!this.events[event] || !key) {
        return;
      }
      this.events[event].delete(key);
      if (this.events[event].size === 0) {
        delete this.events[event];
      }
    },
    /**
     * Publishes an event, calling all subscribed listeners with the provided data.
     * @param {string} event The event name.
     * @param {...unknown} args The data to pass to the listeners.
     */
    publish(event, ...args) {
      if (!this.events[event]) {
        return;
      }

      if (Logger.levels[Logger.level] >= Logger.levels.debug) {
        // --- Aggregation logic START ---
        if (this._aggregatedEvents.has(event)) {
          this._logAggregation[event] ??= { timer: null, count: 0 };
          const aggregation = this._logAggregation[event];
          aggregation.count++;

          clearTimeout(aggregation.timer);
          aggregation.timer = setTimeout(() => {
            const finalCount = this._logAggregation[event]?.count ?? 0;
            if (finalCount > 0) {
              Logger.debug('EventBus', LOG_STYLES.PURPLE, `Event Published: ${event} (x${finalCount})`);
            }
            delete this._logAggregation[event];
          }, this._aggregationDelay);

          // Execute subscribers for the aggregated event, but without the verbose individual logs.
          [...this.events[event].values()].forEach((listener) => {
            try {
              const result = listener(...args);
              if (result instanceof Promise) {
                result.catch((e) => {
                  Logger.error('', '', `EventBus async error in listener for event "${event}":`, e);
                });
              }
            } catch (e) {
              Logger.error('', '', `EventBus error in listener for event "${event}":`, e);
            }
          });
          return; // End execution here for aggregated events in debug mode.
        }
        // --- Aggregation logic END ---

        // In debug mode, provide detailed logging for NON-aggregated events.
        const subscriberKeys = [...this.events[event].keys()];

        Logger.groupCollapsed('EventBus', LOG_STYLES.PURPLE, `Event Published: ${event}`);

        if (args.length > 0) {
          console.log('  - Payload:', ...args);
        } else {
          console.log('  - Payload: (No data)');
        }

        // Displaying subscribers helps in understanding the event's impact.
        if (subscriberKeys.length > 0) {
          console.log('  - Subscribers:\n' + subscriberKeys.map((key) => `    > ${key}`).join('\n'));
        } else {
          console.log('  - Subscribers: (None)');
        }

        // Iterate with keys for better logging
        for (const [key, listener] of [...this.events[event].entries()]) {
          try {
            // Log which specific subscriber is being executed
            Logger.debug('', LOG_STYLES.PURPLE, `-> Executing: ${key}`);
            const result = listener(...args);
            if (result instanceof Promise) {
              result.catch((e) => {
                Logger.error('LISTENER ERROR', LOG_STYLES.RED, `Async listener "${key}" failed for event "${event}":`, e);
              });
            }
          } catch (e) {
            // Enhance error logging with the specific subscriber key
            Logger.error('LISTENER ERROR', LOG_STYLES.RED, `Listener "${key}" failed for event "${event}":`, e);
          }
        }

        Logger.groupEnd();
      } else {
        // Iterate over a copy of the values in case a listener unsubscribes itself.
        [...this.events[event].values()].forEach((listener) => {
          try {
            const result = listener(...args);
            if (result instanceof Promise) {
              result.catch((e) => {
                Logger.error('LISTENER ERROR', LOG_STYLES.RED, `Async listener failed for event "${event}":`, e);
              });
            }
          } catch (e) {
            Logger.error('LISTENER ERROR', LOG_STYLES.RED, `Listener failed for event "${event}":`, e);
          }
        });
      }
    },

    /**
     * Queues a function to be executed on the next animation frame.
     * Batches multiple UI updates into a single repaint cycle.
     * @param {Function} workFunction The function to execute.
     */
    queueUIWork(workFunction) {
      this.uiWorkQueue.push(workFunction);
      if (!this.isUiWorkScheduled) {
        this.isUiWorkScheduled = true;
        requestAnimationFrame(this._processUIWorkQueue.bind(this));
      }
    },

    /**
     * @private
     * Processes all functions in the UI work queue.
     */
    _processUIWorkQueue() {
      // Prevent modifications to the queue while processing.
      const queueToProcess = [...this.uiWorkQueue];
      this.uiWorkQueue.length = 0;

      for (const work of queueToProcess) {
        try {
          const result = work();
          if (result instanceof Promise) {
            result.catch((e) => {
              Logger.error('UI QUEUE ERROR', LOG_STYLES.RED, 'Async error in queued UI work:', e);
            });
          }
        } catch (e) {
          Logger.error('UI QUEUE ERROR', LOG_STYLES.RED, 'Error in queued UI work:', e);
        }
      }

      // Check if new work was added during processing (e.g., from trailing edge handlers)
      if (this.uiWorkQueue.length > 0) {
        requestAnimationFrame(this._processUIWorkQueue.bind(this));
      } else {
        this.isUiWorkScheduled = false;
      }
    },
  };

  /**
   * Creates a unique, consistent event subscription key for EventBus.
   * @param {object} context The `this` context of the subscribing class instance.
   * @param {string} eventName The full event name from the EVENTS constant.
   * @returns {string} A key in the format 'ClassName.purpose'.
   */
  function createEventKey(context, eventName) {
    // Extract a meaningful 'purpose' from the event name
    const parts = eventName.split(':');
    const purpose = parts.length > 1 ? parts.slice(1).join('_') : parts[0];

    let contextName = 'UnknownContext';
    if (context && context.constructor && context.constructor.name) {
      contextName = context.constructor.name;
    }
    return `${contextName}.${purpose}`;
  }

  // =================================================================================
  // SECTION: Configuration Management
  // =================================================================================

  const ConfigProcessor = {
    /**
     * Processes and sanitizes an entire configuration object.
     * @param {object|null} userConfig The user configuration object (partial or full).
     * @returns {object} The complete, sanitized configuration object.
     */
    process(userConfig) {
      // 1. Start with a deep copy of the defaults.
      const completeConfig = deepClone(DEFAULT_CONFIG);

      if (userConfig) {
        // 2. Merge user config
        resolveConfig(completeConfig, userConfig);
      }

      return completeConfig;
    },
  };

  class ConfigManager {
    constructor() {
      /** @type {object|null} */
      this.config = null;
    }

    /**
     * Loads the configuration from storage asynchronously.
     * Assumes the configuration is stored as a JSON string.
     * @returns {Promise<void>}
     */
    async load() {
      const raw = await GM.getValue(CONSTANTS.CONFIG_KEY, null);
      let userConfig = null;
      if (raw) {
        try {
          userConfig = JSON.parse(raw);
        } catch (e) {
          Logger.error('CONFIG LOAD', LOG_STYLES.RED, 'Failed to parse configuration. Using default settings.', e);
        }
      }
      this.config = ConfigProcessor.process(userConfig);
      // Apply logger level immediately
      Logger.setLevel(this.config.developer.logger_level);
    }

    /**
     * Saves the configuration object to storage as a JSON string.
     * @param {object} newConfig The configuration object to save.
     * @returns {Promise<void>}
     */
    async save(newConfig) {
      const completeConfig = ConfigProcessor.process(newConfig);
      await GM.setValue(CONSTANTS.CONFIG_KEY, JSON.stringify(completeConfig));
      this.config = completeConfig;

      // Apply new settings
      Logger.setLevel(this.config.developer.logger_level);

      // Notify other components
      EventBus.publish(EVENTS.CONFIG_UPDATED, this.config);
      EventBus.publish(EVENTS.CONFIG_SAVE_SUCCESS);
    }

    /**
     * @returns {object} The current configuration object.
     */
    get() {
      return this.config ?? deepClone(DEFAULT_CONFIG);
    }
  }

  // =================================================================================
  // SECTION: Settings Modal
  // =================================================================================

  class SettingsModal {
    /**
     * @param {ConfigManager} configManager
     */
    constructor(configManager) {
      this.configManager = configManager;
      this.overlay = null;
      // Bind the keydown handler once to ensure consistent reference for add/removeEventListener
      this._boundHandleKeyDown = this._handleKeyDown.bind(this);
    }

    /**
     * Opens the settings modal.
     */
    open() {
      if (this.overlay) return;
      const config = this.configManager.get();

      // Create input elements
      const filenameInput = h(`input#${APPID}-input-filename.${APPID}-form-input`, {
        type: 'text',
        value: config.download.filenameTemplate,
      });

      const warningText = h(`div#${APPID}-warning-text.${APPID}-text-warning`, 'Forbidden characters will be removed.');
      const previewLabel = h(`div.${APPID}-input-preview-label`, 'Preview:');
      const previewContent = h(`div#${APPID}-preview-content.${APPID}-input-preview-content`, '');

      // Attach input listener for real-time preview
      if (filenameInput instanceof HTMLInputElement) {
        filenameInput.addEventListener('input', () => {
          this._updatePreview(filenameInput.value, warningText, previewContent);
        });
      }

      // Viewer Type Radio Buttons
      const viewerTypeContainer = h('div', { style: { display: 'flex', gap: '16px', marginTop: '8px' } }, [
        h(`label.${APPID}-checkbox-wrapper`, [
          h(`input#${APPID}-input-viewertype-default`, {
            type: 'radio',
            name: 'viewerType',
            value: 'default',
            checked: config.openInNewTab.viewerType === 'default',
          }),
          h('span', 'Default (RedGIFs Page)'),
        ]),
        h(`label.${APPID}-checkbox-wrapper`, [
          h(`input#${APPID}-input-viewertype-clean`, {
            type: 'radio',
            name: 'viewerType',
            value: 'clean',
            checked: config.openInNewTab.viewerType === 'clean',
          }),
          h('span', 'Clean (Video Only)'),
        ]),
      ]);

      // Blob URL Revoke Time Select
      const blobRevokeTimeSelect = h(`select#${APPID}-input-blobrevoketime.${APPID}-form-input`, { style: { cursor: 'pointer' } }, [
        h('option', { value: '60000', selected: config.download.blobRevokeTime === 60000 }, '1 Minute (Default)'),
        h('option', { value: '180000', selected: config.download.blobRevokeTime === 180000 }, '3 Minutes'),
        h('option', { value: '300000', selected: config.download.blobRevokeTime === 300000 }, '5 Minutes'),
        h('option', { value: '600000', selected: config.download.blobRevokeTime === 600000 }, '10 Minutes'),
      ]);

      this.overlay = h(
        `div.${APPID}-modal-overlay`,
        {
          // Click handler for closing when clicking outside (on the overlay)
          onclick: (e) => {
            if (e.target === this.overlay) this.close();
          },
        },
        [
          h(`div.${APPID}-modal-box`, [
            // Header
            h(`div.${APPID}-modal-header`, [h('span', `${APPNAME} Settings`)]),
            // Content
            h(`div.${APPID}-modal-content`, [
              this._createFormGroup(
                'Filename Template',
                null, // Desc is moved inside the control wrapper
                // Wrap input and feedback elements together
                h('div', [h(`div.${APPID}-form-desc`, 'Available placeholders: {user}, {date}, {id}, {tags}'), filenameInput, warningText, previewLabel, previewContent])
              ),
              this._createFormGroup(
                'Appearance',
                '',
                h(`label.${APPID}-checkbox-wrapper`, [
                  h(`input#${APPID}-input-hover`, {
                    type: 'checkbox',
                    checked: config.common.showOnlyOnHover,
                  }),
                  h('span', 'Show buttons only on hover (Desktop)'),
                ])
              ),
              this._createFormGroup(
                'Functionality',
                '',
                h('div', [
                  h(`label.${APPID}-checkbox-wrapper`, [
                    h(`input#${APPID}-input-newtab`, {
                      type: 'checkbox',
                      checked: config.openInNewTab.enabled,
                    }),
                    h('span', 'Enable "Open in New Tab" button'),
                  ]),
                  h(`div.${APPID}-form-desc`, { style: { marginTop: '12px' } }, 'Viewer Type:'),
                  viewerTypeContainer,
                ])
              ),
              this._createFormGroup('Advanced Settings', 'Time to hold video data in memory. Increase this if downloads fail on slow connections.', blobRevokeTimeSelect),
            ]),
            // Footer
            h(`div.${APPID}-modal-footer`, [
              // Left: Restore Defaults
              h(`button.${APPID}-btn.${APPID}-btn-secondary`, { onclick: () => this._restoreDefaults() }, 'Restore Defaults'),
              // Right: Actions
              h(`div.${APPID}-footer-actions`, [h(`button.${APPID}-btn.${APPID}-btn-secondary`, { onclick: () => this.close() }, 'Cancel'), h(`button.${APPID}-btn.${APPID}-btn-primary`, { onclick: () => this.save() }, 'Save')]),
            ]),
          ]),
        ]
      );

      document.body.appendChild(this.overlay);

      // Add global key listener for ESC
      document.addEventListener('keydown', this._boundHandleKeyDown);

      // Trigger initial preview
      if (filenameInput instanceof HTMLInputElement) {
        this._updatePreview(filenameInput.value, warningText, previewContent);
        // Set initial focus
        filenameInput.focus();
      }
    }

    /**
     * Closes the settings modal.
     */
    close() {
      if (this.overlay) {
        // Remove global key listener
        document.removeEventListener('keydown', this._boundHandleKeyDown);

        this.overlay.remove();
        this.overlay = null;
      }
    }

    /**
     * Saves the current settings from the form.
     */
    async save() {
      const newConfig = this.configManager.get();

      // Collect values from DOM
      const filenameInput = document.getElementById(`${APPID}-input-filename`);
      const hoverInput = document.getElementById(`${APPID}-input-hover`);
      const newTabInput = document.getElementById(`${APPID}-input-newtab`);
      const viewerTypeCleanInput = document.getElementById(`${APPID}-input-viewertype-clean`);
      const blobRevokeTimeInput = document.getElementById(`${APPID}-input-blobrevoketime`);

      if (filenameInput instanceof HTMLInputElement) newConfig.download.filenameTemplate = filenameInput.value;
      if (hoverInput instanceof HTMLInputElement) newConfig.common.showOnlyOnHover = hoverInput.checked;
      if (newTabInput instanceof HTMLInputElement) newConfig.openInNewTab.enabled = newTabInput.checked;

      // Radio button logic
      if (viewerTypeCleanInput instanceof HTMLInputElement) {
        newConfig.openInNewTab.viewerType = viewerTypeCleanInput.checked ? 'clean' : 'default';
      }

      // Blob Revoke Time logic
      if (blobRevokeTimeInput instanceof HTMLSelectElement) {
        newConfig.download.blobRevokeTime = parseInt(blobRevokeTimeInput.value, 10) || 60000;
      }

      await this.configManager.save(newConfig);
      this.close();
    }

    /**
     * Updates the preview text and warning based on the input template.
     * @private
     */
    _updatePreview(template, warningEl, previewEl) {
      const dummyReplacements = {
        user: 'RedGifsOfficial',
        date: '20250101_120000',
        id: 'watchfulwaiting',
        tags: '#tag1_#tag2',
      };

      // Resolve filename using dummy data
      const resolved = resolveFilename(template, dummyReplacements);
      // Append example extension
      const previewFilename = `${resolved}.mp4`;

      // Reset classes and state
      previewEl.classList.remove(`${APPID}-preview-valid`, `${APPID}-preview-error`, `${APPID}-preview-fallback`);
      warningEl.style.display = 'none';
      warningEl.textContent = '';

      // 1. Check for fallback triggers (Unbalanced brackets or Empty)
      // Note: resolveFilename handles this internally, but we check here to provide UI feedback.
      const openCount = (template.match(/\{/g) || []).length;
      const closeCount = (template.match(/\}/g) || []).length;
      const isUnbalanced = openCount !== closeCount;
      const isEmpty = !template || template.trim().length === 0;

      if (isUnbalanced || isEmpty) {
        previewEl.classList.add(`${APPID}-preview-fallback`);
        warningEl.style.display = 'block';
        if (isEmpty) {
          warningEl.textContent = "Template is empty. Using 'video' as fallback.";
        } else {
          warningEl.textContent = 'Unbalanced brackets. Reverted to default.';
        }
        previewEl.textContent = previewFilename;
        return;
      }

      // 2. Check for forbidden characters
      const forbiddenRegex = /[<>:"/\\|?*]/;
      const hasForbidden = forbiddenRegex.test(template);

      if (hasForbidden) {
        previewEl.classList.add(`${APPID}-preview-error`);
        warningEl.style.display = 'block';
        warningEl.textContent = 'Forbidden characters (< > : " / \\ | ? *) will be removed.';
        previewEl.textContent = previewFilename;
        return;
      }

      // 3. Valid State
      previewEl.classList.add(`${APPID}-preview-valid`);
      previewEl.textContent = previewFilename;
    }

    /**
     * Restores default settings to the form inputs.
     * @private
     */
    _restoreDefaults() {
      // Restore Filename Template
      const filenameInput = document.getElementById(`${APPID}-input-filename`);
      if (filenameInput instanceof HTMLInputElement) {
        filenameInput.value = DEFAULT_CONFIG.download.filenameTemplate;
        // Trigger preview update manually since programmatic change doesn't fire 'input' event
        const warningText = document.getElementById(`${APPID}-warning-text`);
        const previewContent = document.getElementById(`${APPID}-preview-content`);
        if (warningText && previewContent) {
          this._updatePreview(filenameInput.value, warningText, previewContent);
        }
      }

      // Restore Checkboxes
      const hoverInput = document.getElementById(`${APPID}-input-hover`);
      if (hoverInput instanceof HTMLInputElement) {
        hoverInput.checked = DEFAULT_CONFIG.common.showOnlyOnHover;
      }

      const newTabInput = document.getElementById(`${APPID}-input-newtab`);
      if (newTabInput instanceof HTMLInputElement) {
        newTabInput.checked = DEFAULT_CONFIG.openInNewTab.enabled;
      }

      // Restore Viewer Type Radio Buttons
      const defaultType = DEFAULT_CONFIG.openInNewTab.viewerType;
      const defaultRadio = document.getElementById(`${APPID}-input-viewertype-default`);
      const cleanRadio = document.getElementById(`${APPID}-input-viewertype-clean`);

      if (defaultRadio instanceof HTMLInputElement && cleanRadio instanceof HTMLInputElement) {
        if (defaultType === 'clean') {
          cleanRadio.checked = true;
        } else {
          defaultRadio.checked = true;
        }
      }

      // Restore Blob Revoke Time Select
      const blobRevokeTimeInput = document.getElementById(`${APPID}-input-blobrevoketime`);
      if (blobRevokeTimeInput instanceof HTMLSelectElement) {
        blobRevokeTimeInput.value = String(DEFAULT_CONFIG.download.blobRevokeTime);
      }
    }

    /**
     * Handles global keydown events.
     * @private
     */
    _handleKeyDown(e) {
      if (e.key === 'Escape') {
        this.close();
      }
    }

    /**
     * Helper to create a labeled form group.
     * @private
     */
    _createFormGroup(label, desc, control) {
      return h(`div.${APPID}-form-group`, [h(`label.${APPID}-form-label`, label), control, desc ? h(`div.${APPID}-form-desc`, desc) : null]);
    }
  }

  // =================================================================================
  // SECTION: MediaInfoManager – Extract media info from Page Metadata
  // Handles structural extraction from static metadata and JSON-LD.
  // Supports both high-resolution videos and image elements natively.
  // =================================================================================

  class MediaInfoManager {
    constructor() {
      /** @type {Map<string, {hdUrl: string, userName: string, createDate: number, tags: string[]|undefined}>} */
      this.videoCache = new Map();
    }

    /**
     * Gets media info (video or image) by extracting from the page's meta tags and JSON-LD.
     * For videos, we fix the URL (remove -silent).
     * For images, we pick the largest variant.
     * @param {string} mediaId
     * @returns {Promise<{hdUrl: string, userName: string, createDate: number, tags: string[]|undefined} | null>}
     */
    async getMediaInfo(mediaId) {
      const normalizedId = mediaId.toLowerCase();

      // Check cache first
      if (this.videoCache.has(normalizedId)) {
        return this.videoCache.get(normalizedId);
      }

      // First try to extract from the current page if we're on the watch page
      const info = this._extractFromCurrentPage(normalizedId);
      if (info) {
        this.videoCache.set(normalizedId, info);
        Logger.log('MEDIA HIT', LOG_STYLES.TEAL, `Extracted info for ${normalizedId} from current page`);
        return info;
      }

      // If not on watch page, fetch the watch page HTML and parse
      try {
        const watchUrl = `${CONSTANTS.WATCH_URL_BASE}${normalizedId}`;
        const response = await fetch(watchUrl);
        if (!response.ok) {
          throw new HttpError(response.status, `Failed to fetch watch page: ${response.status}`);
        }
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Detect media type
        const ogType = doc.querySelector('meta[property="og:type"]');
        const isImage = ogType && ogType.getAttribute('content') === 'image';

        // For images, look for og:image:url with the largest size (prefer "large")
        if (isImage) {
          // Collect all og:image:url and og:image tags
          const imageMetaTags = doc.querySelectorAll('meta[property="og:image:url"], meta[property="og:image"]');
          let bestImageUrl = null;
          let bestSize = 0;
          for (const meta of imageMetaTags) {
            const url = meta.getAttribute('content');
            if (!url) continue;
            // Try to infer size from filename or from associated width/height meta
            // Prefer URLs containing "large" or with higher resolution
            let size = 0;
            if (url.includes('large')) size = CONSTANTS.IMAGE_SIZE_SCORE.LARGE;
            else if (url.includes('medium')) size = CONSTANTS.IMAGE_SIZE_SCORE.MEDIUM;
            else if (url.includes('small')) size = CONSTANTS.IMAGE_SIZE_SCORE.SMALL;
            // Also check for explicit width meta (if available)
            const widthMeta = doc.querySelector('meta[property="og:image:width"]');
            if (widthMeta) {
              const w = parseInt(widthMeta.getAttribute('content'), 10);
              if (!isNaN(w) && w > size) size = w;
            }
            if (size > bestSize) {
              bestSize = size;
              bestImageUrl = url;
            }
          }
          if (!bestImageUrl) {
            Logger.warn('MEDIA ERROR', LOG_STYLES.YELLOW, `No image URL found for ${normalizedId}`);
            return null;
          }

          const metadata = this._extractMetadataFromDoc(doc);
          const infoObj = {
            hdUrl: bestImageUrl,
            userName: metadata.userName ?? '',
            createDate: metadata.createDate ?? 0,
            tags: metadata.tags,
          };
          this.videoCache.set(normalizedId, infoObj);
          Logger.log('MEDIA HIT', LOG_STYLES.TEAL, `Fetched image info for ${normalizedId} from watch page`);
          return infoObj;
        }

        // For videos, use existing logic
        const ogVideo = doc.querySelector('meta[property="og:video"]');
        if (ogVideo && ogVideo.getAttribute('content')) {
          let hdUrl = ogVideo.getAttribute('content');
          // Remove "-silent" to get the full version
          hdUrl = hdUrl.replace(CONSTANTS.REGEX.SILENT_VIDEO, '');

          const metadata = this._extractMetadataFromDoc(doc);
          const infoObj = {
            hdUrl: hdUrl,
            userName: metadata.userName ?? '',
            createDate: metadata.createDate ?? 0,
            tags: metadata.tags,
          };
          this.videoCache.set(normalizedId, infoObj);
          Logger.log('MEDIA HIT', LOG_STYLES.TEAL, `Fetched video info for ${normalizedId} from watch page`);
          return infoObj;
        }

        Logger.warn('MEDIA ERROR', LOG_STYLES.YELLOW, `Could not find media URL in page for ${normalizedId}`);
        return null;
      } catch (error) {
        Logger.error('MEDIA ERROR', LOG_STYLES.RED, `Failed to fetch media info for ${normalizedId}:`, error);
        return null;
      }
    }

    /**
     * Extracts metadata (userName, tags, createDate) from a parsed document.
     * @param {Document} doc
     * @returns {{userName: string|undefined, tags: string[]|undefined, createDate: number|undefined}}
     * @private
     */
    _extractMetadataFromDoc(doc) {
      let userName = undefined;
      const authorMeta = doc.querySelector('meta[name="author"]');
      if (authorMeta) userName = authorMeta.getAttribute('content') ?? undefined;
      if (!userName) {
        // Try JSON-LD
        const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
          try {
            const text = script.textContent;
            if (!text) continue;
            const data = JSON.parse(text);
            if (data.author && data.author.name) userName = data.author.name;
            else if (data.video && data.video.author) userName = data.video.author;
            if (userName) break;
          } catch (e) {}
        }
      }

      let tags = undefined;
      const keywordsMeta = doc.querySelector('meta[name="keywords"]');
      if (keywordsMeta) {
        const keywords = keywordsMeta.getAttribute('content');
        if (keywords)
          tags = keywords
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
      }

      let createDate = undefined;
      const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const text = script.textContent;
          if (!text) continue;
          const data = JSON.parse(text);
          if (data.video && data.video.uploadDate) {
            const date = new Date(data.video.uploadDate);
            if (!isNaN(date.getTime())) createDate = Math.floor(date.getTime() / 1000);
          }
          if (data.datePublished) {
            const date = new Date(data.datePublished);
            if (!isNaN(date.getTime())) createDate = Math.floor(date.getTime() / 1000);
          }
          if (createDate) break;
        } catch (e) {}
      }

      return { userName, tags, createDate };
    }

    /**
     * Extracts media info from the current page's meta tags.
     * Handles both video and image pages.
     * @param {string} mediaId
     * @returns {{hdUrl: string, userName: string, createDate: number, tags: string[]|undefined} | null}
     * @private
     */
    _extractFromCurrentPage(mediaId) {
      try {
        // Detect media type: if og:type is "image", treat as image
        const ogType = document.querySelector('meta[property="og:type"]');
        const isImage = ogType && ogType.getAttribute('content') === 'image';

        // For images, find the largest image URL
        if (isImage) {
          // Look for the image element on the page (the displayed image)
          const imgEl = document.querySelector('.ImageGif-Thumbnail');

          // Verify element type before accessing properties
          if (imgEl instanceof HTMLImageElement && imgEl.src) {
            let hdUrl = imgEl.src;
            // Prefer -large if available
            if (hdUrl.includes('-large')) {
              // already large
            } else if (hdUrl.includes('-medium')) {
              hdUrl = hdUrl.replace(CONSTANTS.REGEX.IMAGE_SIZE_MEDIUM, '-large');
            } else if (hdUrl.includes('-small')) {
              hdUrl = hdUrl.replace(CONSTANTS.REGEX.IMAGE_SIZE_SMALL, '-large');
            }
            const metadata = this._extractMetadataFromDoc(document);
            return {
              hdUrl: hdUrl,
              userName: metadata.userName ?? '',
              createDate: metadata.createDate ?? 0,
              tags: metadata.tags,
            };
          }

          // Fallback: look for og:image meta with the largest size
          const imageMetaTags = document.querySelectorAll('meta[property="og:image:url"], meta[property="og:image"]');
          let bestImageUrl = null;
          let bestSize = 0;
          for (const meta of imageMetaTags) {
            const url = meta.getAttribute('content');
            if (!url) continue;
            let size = 0;
            if (url.includes('large')) size = CONSTANTS.IMAGE_SIZE_SCORE.LARGE;
            else if (url.includes('medium')) size = CONSTANTS.IMAGE_SIZE_SCORE.MEDIUM;
            else if (url.includes('small')) size = CONSTANTS.IMAGE_SIZE_SCORE.SMALL;
            const widthMeta = document.querySelector('meta[property="og:image:width"]');
            if (widthMeta) {
              const w = parseInt(widthMeta.getAttribute('content'), 10);
              if (!isNaN(w) && w > size) size = w;
            }
            if (size > bestSize) {
              bestSize = size;
              bestImageUrl = url;
            }
          }
          if (!bestImageUrl) {
            Logger.warn('MEDIA ERROR', LOG_STYLES.YELLOW, `No image URL found in current page for ${mediaId}`);
            return null;
          }
          const metadata = this._extractMetadataFromDoc(document);
          return {
            hdUrl: bestImageUrl,
            userName: metadata.userName ?? '',
            createDate: metadata.createDate ?? 0,
            tags: metadata.tags,
          };
        }

        // For videos: first try to get the video element's src if it's not a blob
        const videoEl = document.querySelector('video[src]');

        // Verify element type before accessing properties
        if (videoEl instanceof HTMLVideoElement) {
          const src = videoEl.src || videoEl.currentSrc;
          if (src && !src.startsWith('blob:')) {
            const metadata = this._extractMetadataFromDoc(document);
            return {
              hdUrl: src,
              userName: metadata.userName ?? '',
              createDate: metadata.createDate ?? 0,
              tags: metadata.tags,
            };
          }
        }

        // Fallback to og:video meta
        const ogVideo = document.querySelector('meta[property="og:video"]');
        if (ogVideo) {
          const hdUrl = ogVideo.getAttribute('content');
          if (hdUrl) {
            const sanitizedUrl = hdUrl.replace(CONSTANTS.REGEX.SILENT_VIDEO, '');
            const metadata = this._extractMetadataFromDoc(document);
            return {
              hdUrl: sanitizedUrl,
              userName: metadata.userName ?? '',
              createDate: metadata.createDate ?? 0,
              tags: metadata.tags,
            };
          }
        }
        return null;
      } catch (error) {
        Logger.warn('MEDIA ERROR', LOG_STYLES.YELLOW, `Failed to extract from page:`, error);
        return null;
      }
    }
  }

  // =================================================================================
  // SECTION: Download Manager
  // =================================================================================

  class DownloadManager {
    /**
     * @param {ConfigManager} configManager
     */
    constructor(configManager) {
      /** @type {ConfigManager} */
      this.configManager = configManager;
      /** @type {Map<string, AbortController>} */
      this.activeDownloads = new Map();
      /** @type {Set<string>} */
      this.activeBlobUrls = new Set();
    }

    /**
     * Handles the download process, managing states and notifications via callbacks.
     * @param {string} mediaId
     * @param {object} mediaInfo
     * @param {object} callbacks
     * @param {Function} callbacks.onStatusChange - Callback to update UI button state
     * @param {Function} callbacks.onNotify - Callback to display toast notifications
     * @param {HTMLButtonElement} buttonElement
     */
    async startDownload(mediaId, mediaInfo, callbacks, buttonElement) {
      const { onStatusChange, onNotify } = callbacks;

      // 1. Cancellation Logic
      if (this.activeDownloads.has(mediaId)) {
        if (buttonElement.disabled) return;
        Logger.log('DOWNLOAD', LOG_STYLES.YELLOW, `Cancelling download for ${mediaId}...`);
        const controller = this.activeDownloads.get(mediaId);
        controller.abort();
        onStatusChange('IDLE');
        return;
      }

      const controller = new AbortController();
      this.activeDownloads.set(mediaId, controller);

      onStatusChange('LOADING_LOCKED');
      onNotify('Download started...', 'info');
      setTimeout(() => {
        if (this.activeDownloads.has(mediaId)) {
          onStatusChange('LOADING_CANCELLABLE');
        }
      }, CONSTANTS.CANCEL_LOCK_DURATION);

      try {
        if (mediaInfo) {
          Logger.log('CACHE HIT', LOG_STYLES.TEAL, `Starting download for ${mediaId}`);
          await this._executeDownload(mediaInfo, mediaId, controller.signal);

          onStatusChange('SUCCESS');
          onNotify('Download successful!', 'success');
          Logger.log('DOWNLOAD', LOG_STYLES.GREEN, `Downloaded ${mediaId} from:`, mediaInfo.hdUrl);
        } else {
          Logger.warn('CACHE MISS', LOG_STYLES.YELLOW, `Media info not found in cache for ${mediaId}.`);
          onNotify('Media info not found. (Try refreshing)', 'error');
          onStatusChange('ERROR');
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          Logger.log('DOWNLOAD', LOG_STYLES.YELLOW, `Download process for ${mediaId} was aborted.`);
          onNotify('Download cancelled.', 'info');
          if (this.activeDownloads.has(mediaId)) {
            onStatusChange('IDLE');
          }
        } else if (error instanceof HttpError && error.status === 404) {
          Logger.warn('DOWNLOAD', LOG_STYLES.YELLOW, `Download failed: Not Found (404) for ${mediaId}`, error);
          onNotify('Media not found (404).', 'error');
          onStatusChange('ERROR');
        } else if (error instanceof HttpError && error.status === 403) {
          Logger.warn('DOWNLOAD', LOG_STYLES.YELLOW, `Download failed: Forbidden (403) for ${mediaId}`, error);
          onNotify('Access forbidden (403).', 'error');
          onStatusChange('ERROR');
        } else {
          Logger.error('DOWNLOAD', LOG_STYLES.RED, 'Download failed:', error);
          onNotify('Download failed. (Network error?)', 'error');
          onStatusChange('ERROR');
        }
      } finally {
        this.activeDownloads.delete(mediaId);
      }
    }

    /**
     * Performs the actual download process (file save).
     * @private
     */
    async _executeDownload(mediaInfo, mediaId, signal) {
      const config = this.configManager.get();
      const { hdUrl, userName, createDate, tags } = mediaInfo;
      const downloadUrl = hdUrl;
      const dateString = createDate && typeof createDate === 'number' ? formatTimestamp(createDate) : '';
      const tagsText = Array.isArray(tags) && tags.length > 0 ? '#' + tags.join('_#') : '';
      const replacements = {
        user: userName || '',
        date: dateString,
        id: mediaId || '',
        tags: tagsText,
      };
      const baseFilename = resolveFilename(config.download.filenameTemplate, replacements);
      let extension = getExtension(hdUrl);

      if (!extension) {
        Logger.warn('DOWNLOAD', LOG_STYLES.YELLOW, `Could not determine extension from URL. Defaulting to '.mp4'. URL:`, hdUrl);
        extension = '.mp4';
      }

      const filename = `${baseFilename}${extension}`;
      await this._downloadFile(downloadUrl, filename, signal);
    }

    /**
     * Initiates a download for the given URL using fetch and saves the file.
     * @private
     */
    async _downloadFile(url, filename, signal) {
      const config = this.configManager.get();
      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new HttpError(response.status, `Server responded with ${response.status}`);
      }

      const blob = await response.blob();
      let objectUrl = null;
      let link = null;
      try {
        objectUrl = URL.createObjectURL(blob);
        this.activeBlobUrls.add(objectUrl);
        link = h('a', {
          href: objectUrl,
          download: filename,
        });
        if (link instanceof HTMLElement) {
          document.body.appendChild(link);
          link.click();
        }
      } finally {
        if (link instanceof HTMLElement) {
          link.remove();
        }
        if (objectUrl) {
          const urlToRevoke = objectUrl;
          setTimeout(() => {
            if (this.activeBlobUrls.has(urlToRevoke)) {
              URL.revokeObjectURL(urlToRevoke);
              this.activeBlobUrls.delete(urlToRevoke);
            }
          }, config.download.blobRevokeTime);
        }
      }
    }
  }

  // =================================================================================
  // SECTION: UI Manager
  // =================================================================================

  class UIManager {
    /**
     * @param {ConfigManager} configManager
     */
    constructor(configManager) {
      this.subscriptions = [];
      /** @type {ConfigManager} */
      this.configManager = configManager;
      /** @type {HTMLElement|null} */
      this.toastContainer = null;

      // Subscribe to config updates to refresh styles dynamically
      this._subscribe(EVENTS.CONFIG_UPDATED, () => this.updateDynamicStyles());
    }

    /**
     * Helper to subscribe to EventBus events with automatic key management.
     * @param {string} event - The event name to subscribe to.
     * @param {Function} listener - The callback function.
     * @private
     */
    _subscribe(event, listener) {
      const key = createEventKey(this, event);
      EventBus.subscribe(event, listener.bind(this), key);
      this.subscriptions.push({ event, key });
    }

    /**
     * Initializes the UI components that require the DOM.
     * Creates and appends the toast container to the document body.
     */
    init() {
      this._createToastContainer();
      this.injectStaticStyles();
      this.updateDynamicStyles();
    }

    /**
     * Injects the static CSS styles (UI templates + Modal styles).
     * These do not change during the session.
     */
    injectStaticStyles() {
      const id = `${APPID}-static-styles`;
      if (document.getElementById(id)) return;
      const styleElement = h('style', { id: id, type: 'text/css', 'data-owner': APPID }, UI_STYLES_TEMPLATE + MODAL_STYLES);
      document.head.appendChild(styleElement);
    }

    /**
     * Updates CSS styles that depend on configuration (e.g., showOnlyOnHover).
     * Called on init and when configuration changes.
     */
    updateDynamicStyles() {
      const config = this.configManager.get();
      const id = `${APPID}-dynamic-styles`;

      // Remove existing dynamic styles to re-apply
      let styleEl = document.getElementById(id);
      if (!styleEl) {
        const newStyleEl = h('style', { id: id, type: 'text/css' });
        if (newStyleEl instanceof HTMLElement) {
          styleEl = newStyleEl;
          document.head.appendChild(styleEl);
        }
      }

      if (!styleEl) return;

      // Define class names locally
      const CLS = {
        TILE_OPEN: `${APPID}-open-in-new-tab-btn`,
        TILE_DOWNLOAD: `${APPID}-tile-download-btn`,
        PREVIEW_OPEN: `${APPID}-preview-open-btn`,
        PREVIEW_DOWNLOAD: `${APPID}-preview-download-btn`,
      };

      let css = '';

      // Apply 'Show Only On Hover' logic
      if (config.common.showOnlyOnHover) {
        const createHoverStyle = (btnClass, parentSelector) => `
/* Default state: Hidden and non-clickable */
.${btnClass} {
opacity: 0;
pointer-events: none;
transition: opacity 0.2s ease-in-out;
}
/* Hover state: Visible and clickable */
${parentSelector}:hover .${btnClass} {
opacity: 1;
pointer-events: auto;
}
/* Mobile: Always visible (force override) */
.App.phone .${btnClass} {
opacity: 1 !important;
pointer-events: auto !important;
}
`;
        // Apply to all 4 button types
        css += createHoverStyle(CLS.TILE_OPEN, CONSTANTS.TILE_ITEM_SELECTOR);
        css += createHoverStyle(CLS.PREVIEW_OPEN, CONSTANTS.VIDEO_CONTAINER_SELECTOR);
        css += createHoverStyle(CLS.TILE_DOWNLOAD, CONSTANTS.TILE_ITEM_SELECTOR);
        css += createHoverStyle(CLS.PREVIEW_DOWNLOAD, CONSTANTS.VIDEO_CONTAINER_SELECTOR);
      }

      // Layout Adjustments (if Open in New Tab is disabled)
      if (!config.openInNewTab.enabled) {
        css += `
/* Move Download Button to top position */
.${CLS.TILE_DOWNLOAD} { top: 8px !important; }
.${CLS.PREVIEW_DOWNLOAD} { top: 8px !important; }

/* Mobile adjustment for Preview */
.App.phone .${CLS.PREVIEW_DOWNLOAD} { top: 64px !important; }

/* Hide existing buttons if they exist in DOM (for immediate update without reload) */
.${CLS.TILE_OPEN}, .${CLS.PREVIEW_OPEN} { display: none !important; }
`;
      }

      styleEl.textContent = css;
    }

    /**
     * Updates the visual state (icon and title) of all buttons matching the selector.
     * @param {string} selector - The CSS selector for the buttons.
     * @param {keyof ICONS} iconName - The new icon name.
     * @param {string} title - The new tooltip title.
     */
    updateButtonVisuals(selector, iconName, title) {
      const buttons = document.querySelectorAll(selector);
      buttons.forEach((btn) => {
        if (!(btn instanceof HTMLElement)) return;
        // Update Title
        btn.title = title;
        // Update Icon
        this._setButtonIcon(btn, iconName);
      });
    }

    /**
     * Creates and appends the toast container to the document body.
     * @private
     */
    _createToastContainer() {
      const container = h(`div.${APPID}-toast-container`);
      if (container instanceof HTMLElement) {
        this.toastContainer = container;
        document.body.appendChild(this.toastContainer);
      }
    }

    /**
     * Displays a toast notification.
     * @param {string} message The message to display.
     * @param {'info'|'success'|'error'} type The type of toast.
     */
    showToast(message, type) {
      if (!this.toastContainer) {
        Logger.error('UI ERROR', LOG_STYLES.RED, 'Toast container element not found. Cannot display toast.');
        return;
      }

      const toastClass = `${APPID}-toast-${type}`;
      const toastElement = h(`div.${APPID}-toast`, { className: toastClass }, message);

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

      if (button instanceof HTMLElement) {
        this._setButtonIcon(button, iconName);
        parentElement.appendChild(button);
      }
    }

    /**
     * Sets the icon for a given button.
     * @param {HTMLElement} button The button or anchor element to modify.
     * @param {string} iconName The name of the icon to set.
     * @private
     */
    _setButtonIcon(button, iconName) {
      const cachedIcon = CACHED_ICONS[iconName];
      if (!cachedIcon) {
        Logger.error('ICON ERROR', LOG_STYLES.RED, `Icon "${iconName}" not found.`);
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
        IDLE: { icon: 'DOWNLOAD', disabled: false, title: 'Download HD Video' },
        LOADING_LOCKED: { icon: 'SPINNER', disabled: true, title: 'Downloading... (Please wait)' }, // Cancel lock
        LOADING_CANCELLABLE: { icon: 'SPINNER', disabled: false, title: 'Click to Cancel Download' }, // Cancellable
        SUCCESS: { icon: 'SUCCESS', disabled: true, title: 'Download successful!' },
        ERROR: { icon: 'ERROR', disabled: true, title: 'Download failed.' },
      };

      const { icon, disabled, title } = stateMap[state] || stateMap.IDLE;
      this._setButtonIcon(button, icon);
      button.disabled = disabled;
      button.title = title;

      // Revert to IDLE state after a delay for success or error states.
      if (state === 'SUCCESS' || state === 'ERROR') {
        setTimeout(() => {
          this.updateButtonState(button, 'IDLE');
        }, CONSTANTS.ICON_REVERT_DELAY);
      }
    }

    /**
     * A generic helper to create and append a link button (<a> tag).
     * @param {object} options - The configuration for the button.
     * @param {HTMLElement} options.parentElement - The element to append the button to.
     * @param {string} options.className - The CSS class for the button.
     * @param {string} options.title - The button's tooltip text.
     * @param {string} options.iconName - The key of the icon in the ICONS object.
     * @param {string} options.href - The URL the link points to.
     * @param {(e: MouseEvent) => void} [options.clickHandler] - Optional click handler (e.g., for stopPropagation).
     */
    createLinkButton({ parentElement, className, title, iconName, href, clickHandler }) {
      // Prevent duplicate buttons
      if (parentElement.querySelector(`.${className}`)) {
        return;
      }

      const button = h(`a.${className}`, {
        href: href,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: title,
        draggable: 'false', // Prevent dragging the link image
        onclick: clickHandler,
      });

      if (button instanceof HTMLElement) {
        this._setButtonIcon(button, iconName);
        parentElement.appendChild(button);
      }
    }
  }

  // =================================================================================
  // SECTION: Annoyance Manager
  // =================================================================================

  class AnnoyanceManager {
    // --- Ad & Annoyance Selectors ---
    static LIVE_CAM_SELECTOR = '.StreamateCameraDispatcher'; // Live Cam streams (Streamate)
    static AD_SELECTORS = [
      '.metaInfo_isBoosted', // Boosted Ad Posts
    ];

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

/* Feed Modules (Suggested/Trending Niches, Suggested/Trending Creators, Mobile OF Creators, Niche Explorer) */
/* Backward compatibility: Keep existing class-based selectors combined with new attribute-based selectors */
.FeedModule:has(.nicheListWidget.trendingNiches),
.FeedModule:has(.seeMoreBlock.suggestedCreators),
.FeedModule:has(.seeMoreBlock.trendingCreators),
.FeedModule:has(.OnlyFansCreatorsModule),
.FeedModule:has(.nicheExplorer),
.FeedModule[data-feed-module-type="trending-niches"],
.FeedModule[data-feed-module-type="suggested-niches"],
.FeedModule[data-feed-module-type="trending-creators"],
.FeedModule[data-feed-module-type="suggested-creators"],
.FeedModule[data-feed-module-type="only-fans"],
.FeedModule[data-feed-module-type="live-cam"],
.FeedModule[data-feed-module-type="boost"] {
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
     * Registers Sentinel observers to hide elements that cannot be hidden by CSS alone or require dynamic content injection.
     * @param {Sentinel} sentinel - The Sentinel instance.
     */
    removeElements(sentinel) {
      // Helper to hide ad containers (VisibleOnly elements often cause layout shifts or blank spaces)
      const adHider = (adElement) => {
        const adContainer = adElement.closest(CONSTANTS.VISIBLE_VIDEO_CONTAINER_SELECTOR);
        if (adContainer instanceof HTMLElement) {
          // Do NOT use .remove() as it breaks the site's virtual DOM state.
          // Use inline style to force hide.
          adContainer.style.setProperty('display', 'none', 'important');
        }
      };

      // --- Unified Annoyance Hiding ---
      // Handles Live Cam streams (Streamate) on both Desktop and Mobile.
      sentinel.on(AnnoyanceManager.LIVE_CAM_SELECTOR, adHider);

      // Handle Ad and Promotional Videos
      AnnoyanceManager.AD_SELECTORS.forEach((selector) => {
        sentinel.on(selector, (element) => {
          const container = element.closest(CONSTANTS.VIDEO_CONTAINER_SELECTOR);
          if (container instanceof HTMLElement) {
            container.style.setProperty('display', 'none', 'important');
          }
        });
      });
    }
  }

  // =================================================================================
  // SECTION: Sentinel (DOM Node Insertion Observer)
  // =================================================================================

  /**
   * @class Sentinel
   * @description Detects DOM node insertion using a shared, prefixed CSS animation trick.
   * Designed as a persistent singleton per project prefix.
   * This class does not support explicit lifecycle destruction (no destroy method), as instances are intended to live indefinitely to ensure continuous DOM monitoring across scripts.
   * @property {Map<string, Set<(element: Element) => void>>} listeners
   * @property {Set<string>} rules
   * @property {HTMLElement | null} styleElement
   * @property {CSSStyleSheet | null} sheet
   * @property {WeakMap<CSSRule, string>} ruleSelectors
   */
  class Sentinel {
    static MAX_POLLS = 60;
    static POLL_INTERVAL = 50;

    /**
     * @param {string} prefix - A unique identifier for this Sentinel instance to avoid CSS conflicts. Required.
     */
    constructor(prefix) {
      if (!prefix) {
        throw new Error('[Sentinel] "prefix" argument is required to avoid CSS conflicts.');
      }

      // Validate prefix for CSS compatibility
      // 1. Must contain only alphanumeric characters, hyphens, or underscores.
      // 2. Cannot start with a digit.
      // 3. Cannot start with a hyphen followed by a digit.
      if (!/^[a-zA-Z0-9_-]+$/.test(prefix) || /^[0-9]|^-[0-9]/.test(prefix)) {
        throw new Error(`[Sentinel] Prefix "${prefix}" is invalid. It must contain only alphanumeric characters, hyphens, or underscores, and cannot start with a digit or a hyphen followed by a digit.`);
      }

      /** @type {Window & { __global_sentinel_instances__?: Record<string, Sentinel> }} */
      const globalScope = window;
      globalScope.__global_sentinel_instances__ ??= {};
      if (globalScope.__global_sentinel_instances__[prefix]) {
        return globalScope.__global_sentinel_instances__[prefix];
      }

      this.prefix = prefix;
      this.isSuspended = false;

      // Use a unique, prefixed animation name shared by all scripts in a project.
      this.animationName = `${prefix}-global-sentinel-animation`;
      this.styleId = `${prefix}-sentinel-global-rules`; // A single, unified style element
      this.listeners = new Map();
      this.rules = new Set(); // Tracks all active selectors
      this.styleElement = null; // Holds the reference to the single style element
      this.sheet = null; // Cache the CSSStyleSheet reference
      /** @type {WeakMap<CSSRule, string>} */
      this.ruleSelectors = new WeakMap(); // Tracks selector strings associated with CSSRule objects
      /** @type {Map<string, string>} */
      this.normalizedSelectors = new Map(); // Maps original selectors to browser-normalized selectors

      this._boundHandleAnimationStart = this._handleAnimationStart.bind(this);

      this._injectStyleElement();
      document.addEventListener('animationstart', this._boundHandleAnimationStart, true);

      globalScope.__global_sentinel_instances__[prefix] = this;
    }

    _injectStyleElement() {
      // Ensure the style element is injected only once per project prefix.
      this.styleElement = document.getElementById(this.styleId);

      if (this.styleElement instanceof HTMLStyleElement) {
        this.styleElement.disabled = this.isSuspended;
        this._waitForStylesheet();
        return;
      }

      // Create empty style element
      this.styleElement = document.createElement('style');
      this.styleElement.id = this.styleId;

      // CSP Fix: Try to fetch a valid nonce from existing scripts/styles
      // "nonce" property exists on HTMLScriptElement/HTMLStyleElement, not basic Element.
      let nonce;

      // 1. Try to get nonce from scripts collection
      const scripts = document.scripts;
      for (let i = 0; i < scripts.length; i++) {
        if (scripts[i].nonce) {
          nonce = scripts[i].nonce;
          break;
        }
      }

      // 2. Fallback: Using querySelector (content attribute)
      if (!nonce) {
        const style = document.querySelector('style[nonce]');
        const script = document.querySelector('script[nonce]');

        if (style instanceof HTMLStyleElement && style.nonce) {
          nonce = style.nonce;
        } else if (script instanceof HTMLScriptElement && script.nonce) {
          nonce = script.nonce;
        }
      }

      if (nonce) {
        this.styleElement.nonce = nonce;
      }

      if (this.styleElement instanceof HTMLStyleElement) {
        this.styleElement.disabled = this.isSuspended;
      }

      // Try to inject immediately.
      // If the document is not yet ready (e.g. extremely early document-start), wait for the root element.
      const target = document.head || document.documentElement;

      if (target) {
        target.appendChild(this.styleElement);
        this._waitForStylesheet();
      } else {
        const initObserver = new MutationObserver(() => {
          const retryTarget = document.head || document.documentElement;
          if (retryTarget) {
            initObserver.disconnect();

            retryTarget.appendChild(this.styleElement);
            this._waitForStylesheet();
          }
        });
        initObserver.observe(document, { childList: true });
      }
    }

    /**
     * Ensures the style element is connected to the DOM and restores rules if it was removed.
     */
    _ensureStyleGuard() {
      // Lazy Recovery: If the style element is connected but the stylesheet reference (this.sheet) was missed due to a timeout caused by a long task, recover it immediately here.
      if (this.styleElement instanceof HTMLStyleElement && this.styleElement.isConnected && !this.sheet && this.styleElement.sheet) {
        this._syncStylesheetRules();
      }

      if (this.styleElement && !this.styleElement.isConnected) {
        const target = document.head || document.documentElement;
        if (target) {
          this.sheet = null; // Clear stale stylesheet reference before reconnecting
          target.appendChild(this.styleElement);
          this._waitForStylesheet();
        }
      }
    }

    /**
     * Periodically checks for stylesheet availability and triggers full synchronization.
     * @private
     */
    _waitForStylesheet() {
      if (!(this.styleElement instanceof HTMLStyleElement) || !this.styleElement.isConnected) return;

      const styleNode = this.styleElement;
      let pollCount = 0;

      const poll = () => {
        if (!styleNode.isConnected) return;
        if (styleNode.sheet) {
          this._syncStylesheetRules();
        } else if (pollCount < Sentinel.MAX_POLLS) {
          pollCount++;
          console.debug(`[Sentinel] Polling sheet (Attempt ${pollCount}/${Sentinel.MAX_POLLS}). requestAnimationFrame check was insufficient.`);
          setTimeout(poll, Sentinel.POLL_INTERVAL);
        } else {
          // Calculate timeout in seconds dynamically based on constants
          const timeoutSeconds = (Sentinel.MAX_POLLS * Sentinel.POLL_INTERVAL) / 1000;
          console.error(`[Sentinel] Polling sheet timed out after ${timeoutSeconds} seconds.`);
        }
      };

      if (styleNode.sheet) {
        this._syncStylesheetRules();
      } else {
        requestAnimationFrame(() => {
          if (!styleNode.isConnected) return;
          if (styleNode.sheet) {
            this._syncStylesheetRules();
          } else {
            setTimeout(poll, Sentinel.POLL_INTERVAL);
          }
        });
      }
    }

    /**
     * Synchronizes all active rules directly onto the connected stylesheet.
     * @private
     */
    _syncStylesheetRules() {
      if (!(this.styleElement instanceof HTMLStyleElement) || !this.styleElement.isConnected || !this.styleElement.sheet) return;

      this.styleElement.disabled = this.isSuspended;
      this.sheet = this.styleElement.sheet;

      try {
        // Non-destructive cleanup: scan and remove only rules belonging to this instance's active selectors
        for (let i = this.sheet.cssRules.length - 1; i >= 0; i--) {
          const rule = this.sheet.cssRules[i];
          const recordedSelector = this.ruleSelectors.get(rule);
          if (this.rules.has(recordedSelector) || (rule instanceof CSSStyleRule && (this.rules.has(rule.selectorText) || [...this.rules].some((sel) => rule.selectorText === this.normalizedSelectors.get(sel))))) {
            this.sheet.deleteRule(i);
          }
        }

        // Non-destructive keyframes validation
        this._ensureKeyframesRule();
      } catch (e) {
        console.error('[Sentinel] Failed to clear or restore base rules:', e);
      }

      this.rules.forEach((selector) => {
        const success = this._insertRule(selector);
        if (!success) {
          // Rollback invalid selector to prevent infinite error loops on subsequent syncs
          this.rules.delete(selector);
          this.listeners.delete(selector);
        }
      });
    }

    /**
     * Ensures the shared keyframes rule exists in the stylesheet.
     */
    _ensureKeyframesRule() {
      let hasKeyframes = false;
      for (let i = 0; i < this.sheet.cssRules.length; i++) {
        const rule = this.sheet.cssRules[i];
        if (rule instanceof CSSKeyframesRule && rule.name === this.animationName) {
          hasKeyframes = true;
          break;
        }
      }
      if (!hasKeyframes) {
        const keyframes = `@keyframes ${this.animationName} { from { outline: 1px solid transparent; } to { outline: 0px solid transparent; } }`;
        this.sheet.insertRule(keyframes, 0);
      }
    }

    /**
     * Helper to insert a single rule into the stylesheet
     * @param {string} selector
     * @returns {boolean} True if insertion was successful, false otherwise
     */
    _insertRule(selector) {
      try {
        const index = this.sheet.cssRules.length;
        const ruleText = `${selector} { animation-duration: 0.001s; animation-name: ${this.animationName}; }`;
        this.sheet.insertRule(ruleText, index);
        // Associate the inserted rule with the selector via WeakMap for safer removal later.
        // This mimics sentinel.js behavior to handle index shifts and selector normalization.
        const insertedRule = this.sheet.cssRules[index];
        if (insertedRule) {
          this.ruleSelectors.set(insertedRule, selector);
          if (insertedRule instanceof CSSStyleRule) {
            this.normalizedSelectors.set(selector, insertedRule.selectorText);
          }
        }
        return true;
      } catch (e) {
        console.error(`[Sentinel] Rule insertion failed for selector "${selector}". The listener has been rejected and removed:`, e);
        return false;
      }
    }

    _handleAnimationStart(event) {
      if (this.isSuspended) return;

      // Check if the animation is the one we're listening for.
      if (event.animationName !== this.animationName) return;

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      // Check if the target element matches any of this instance's selectors.
      for (const [selector, callbacks] of this.listeners.entries()) {
        if (target.matches(selector)) {
          // Use a copy of the callbacks Set in case a callback removes itself.
          [...callbacks].forEach((cb) => {
            try {
              cb(target);
            } catch (e) {
              console.error(`[Sentinel] Listener error for selector "${selector}":`, e);
            }
          });
        }
      }
    }

    /**
     * @param {string} selector
     * @param {(element: Element) => void} callback
     */
    on(selector, callback) {
      this._ensureStyleGuard();

      // Add callback to listeners

      if (!this.listeners.has(selector)) {
        this.listeners.set(selector, new Set());
      }
      this.listeners.get(selector).add(callback);
      // If selector is already registered in rules, do nothing
      if (this.rules.has(selector)) return;
      this.rules.add(selector);

      // Apply rule
      if (this.sheet) {
        const success = this._insertRule(selector);
        if (!success) {
          // Rollback on immediate insertion failure
          this.listeners.delete(selector);
          this.rules.delete(selector);
        }
      }
    }

    /**
     * @param {string} selector
     * @param {(element: Element) => void} callback
     */
    off(selector, callback) {
      const callbacks = this.listeners.get(selector);
      if (!callbacks) return;

      const wasDeleted = callbacks.delete(callback);
      if (!wasDeleted) {
        return;
        // Callback not found, do nothing.
      }

      if (callbacks.size === 0) {
        // Remove listener and rule
        this.listeners.delete(selector);
        this.rules.delete(selector);
        this.normalizedSelectors.delete(selector);

        if (this.sheet) {
          // Iterate backwards to avoid index shifting issues during deletion
          for (let i = this.sheet.cssRules.length - 1; i >= 0; i--) {
            const rule = this.sheet.cssRules[i];
            // Check for recorded selector via WeakMap or fallback to selectorText match
            const recordedSelector = this.ruleSelectors.get(rule);
            if (recordedSelector === selector || (rule instanceof CSSStyleRule && (rule.selectorText === selector || rule.selectorText === this.normalizedSelectors.get(selector)))) {
              try {
                this.sheet.deleteRule(i);
              } catch (e) {
                console.error(`[Sentinel] Failed to delete rule for selector "${selector}":`, e);
              }
              // We assume one rule per selector, so we can break after deletion
              break;
            }
          }
        }
      }
    }

    suspend() {
      if (this.isSuspended) return;
      this.isSuspended = true;
      if (this.styleElement instanceof HTMLStyleElement) {
        this.styleElement.disabled = true;
      }
      console.debug('[Sentinel] Suspended.');
    }

    resume() {
      if (!this.isSuspended) return;
      this.isSuspended = false;
      if (this.styleElement instanceof HTMLStyleElement) {
        this.styleElement.disabled = false;
      }
      console.debug('[Sentinel] Resumed.');
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
      /** @type {ConfigManager} */
      this.configManager = new ConfigManager();
      /** @type {MediaInfoManager} */
      this.mediaInfoManager = new MediaInfoManager();
      /** @type {UIManager} */
      this.ui = new UIManager(this.configManager); // Pass configManager to UIManager
      /** @type {AnnoyanceManager} */
      this.annoyanceManager = new AnnoyanceManager();
      /** @type {DownloadManager} */
      this.downloadManager = new DownloadManager(this.configManager);
      /** @type {SettingsModal|null} */
      this.settingsModal = null;

      // Subscribe to config updates to refresh button icons
      EventBus.subscribe(EVENTS.CONFIG_UPDATED, (config) => this._handleConfigUpdate(config), createEventKey(this, EVENTS.CONFIG_UPDATED));
    }

    /**
     * Initializes the script.
     */
    async init() {
      // 1. Load configuration asynchronously
      await this.configManager.load();

      // 2. Initialize Settings Modal and register menu command
      this.settingsModal = new SettingsModal(this.configManager);
      GM.registerMenuCommand('Open Settings', () => {
        this.settingsModal.open();
      });

      // 3. Inject annoyance removal styles
      this.annoyanceManager.injectStyles();

      // 4. Inject script UI (buttons, toast) styles
      this.ui.init();

      const sentinel = new Sentinel(OWNERID);

      // 5. Register JS-based annoyance removal
      this.annoyanceManager.removeElements(sentinel);

      /**
       * Registers a Sentinel observer.
       * @param {string} selector The CSS selector to observe.
       * @param {(element: Element) => void} handler The callback handler for found elements.
       */
      const registerObserver = (selector, handler) => {
        sentinel.on(selector, handler);
      };

      // Shared ID extractor for dataset-based IDs
      const getFeedId = (el) => {
        // Ensure element is HTMLElement to access dataset
        if (!(el instanceof HTMLElement)) return null;

        // ID is in 'data-feed-item-id'
        const feedId = el.dataset.feedItemId;
        // Filter out non-video items (e.g. 'feed-module-...') and normalize to lowercase
        if (feedId && !feedId.startsWith('feed-module-')) {
          return feedId.toLowerCase();
        }
        // Fallback: Check for ID attribute if layout reverts or mixed
        // Tile IDs were just the ID, Preview IDs were 'gif_ID'
        if (el.id) {
          const idPart = el.id.startsWith('gif_') ? el.id.split('_')[1] : el.id;
          return idPart ? idPart.toLowerCase() : null;
        }
        return null;
      };

      // Set up the listener using Sentinel.
      // When Sentinel registers a new selector, it rewrites its stylesheet.
      // This triggers the animationstart event for both elements
      // that already exist in the DOM and elements added later.

      // Setup observer for Tile Items (Grid View)
      registerObserver(CONSTANTS.TILE_ITEM_SELECTOR, (element) => {
        if (element instanceof HTMLElement) {
          this._onElementFound(element, getFeedId, CONSTANTS.CONTEXT_TYPE.TILE);
        }
      });

      // Setup observer for Video Containers (Preview/Watch View)
      registerObserver(CONSTANTS.VIDEO_CONTAINER_SELECTOR, (element) => {
        if (element instanceof HTMLElement) {
          this._onElementFound(element, getFeedId, CONSTANTS.CONTEXT_TYPE.PREVIEW);
        }
      });

      Logger.log('INIT', LOG_STYLES.GREEN, 'Initialized and observing DOM for new content.');
    }

    /**
     * Generic handler for found elements.
     * @param {HTMLElement} element The found DOM element.
     * @param {(element: HTMLElement) => string|null} idExtractor A function to extract the media ID from the element.
     * @param {string} type The context type of the element (from CONSTANTS.CONTEXT_TYPE).
     * @private
     */
    _onElementFound(element, idExtractor, type) {
      if (!element) {
        return;
      }

      const mediaId = idExtractor(element);
      // Robust check: Ensure mediaId is truthy (not null, undefined, or empty string)
      if (mediaId) {
        this._addButtonsToElement(element, mediaId, type);
      }
    }

    /**
     * Adds dynamic interface controls to a verified element structure context.
     * @param {HTMLElement} element The parent element for the buttons.
     * @param {string} mediaId The media ID associated with the buttons.
     * @param {string} type The context type (from CONSTANTS.CONTEXT_TYPE).
     * @private
     */
    _addButtonsToElement(element, mediaId, type) {
      const isTile = type === CONSTANTS.CONTEXT_TYPE.TILE;
      // --- 1. Open in New Tab Button (Link) ---
      // Always create the button elements. Visibility is toggled via CSS based on settings.
      {
        const className = isTile ? `${APPID}-open-in-new-tab-btn` : `${APPID}-preview-open-btn`;
        const url = `${CONSTANTS.WATCH_URL_BASE}${mediaId}`;

        // Determine icon and title based on config
        const config = this.configManager.get();
        const isClean = config.openInNewTab.viewerType === 'clean';
        const iconName = isClean ? 'PLAY_ARROW' : 'OPEN_IN_NEW';
        const title = isClean ? 'Play in Clean Viewer' : 'Open in new tab';

        this.ui.createLinkButton({
          parentElement: element,
          className: className,
          title: title,
          iconName: iconName,
          href: url,
          // Intercept click if 'Clean Viewer' is enabled
          clickHandler: (e) => {
            // Re-check config at click time to ensure latest setting is used
            const currentConfig = this.configManager.get();
            if (currentConfig.openInNewTab.viewerType === 'clean') {
              e.preventDefault();
              e.stopPropagation();

              this.mediaInfoManager
                .getMediaInfo(mediaId)
                .then((mediaInfo) => {
                  if (mediaInfo) {
                    this._openCleanViewer(mediaInfo, mediaId);
                  } else {
                    // Fallback if info not cached: open standard page
                    window.open(url, '_blank');
                  }
                })
                .catch((err) => {
                  Logger.error('MEDIA ERROR', LOG_STYLES.RED, 'Asynchronous data resolution failed for Clean Viewer fallback execution:', err);
                  window.open(url, '_blank');
                });
            } else {
              // Default behavior: stop propagation to prevent parent navigation, but let the link work
              e.stopPropagation();
            }
          },
        });
      }

      // --- 2. Download Button (Action) ---
      {
        const className = isTile ? `${APPID}-tile-download-btn` : `${APPID}-preview-download-btn`;
        const clickHandler = (e) => this._handleDownloadClick(e, mediaId);
        this.ui.createButton({
          parentElement: element,
          className: className,
          title: 'Download HD Video',
          iconName: 'DOWNLOAD',
          clickHandler: clickHandler,
        });
      }
    }

    /**
     * Handles configuration updates to refresh UI components.
     * @param {object} config The new configuration object.
     * @private
     */
    _handleConfigUpdate(config) {
      const isClean = config.openInNewTab.viewerType === 'clean';
      const icon = isClean ? 'PLAY_ARROW' : 'OPEN_IN_NEW';
      const title = isClean ? 'Play in Clean Viewer' : 'Open in new tab';

      // Update Tile Buttons
      this.ui.updateButtonVisuals(`.${APPID}-open-in-new-tab-btn`, icon, title);
      // Update Preview Buttons
      this.ui.updateButtonVisuals(`.${APPID}-preview-open-btn`, icon, title);
    }

    /**
     * Handles the click event on the download button.
     * Manages download start, 1s lock, and cancellation.
     * @param {MouseEvent} e - The click event.
     * @param {string} mediaId - The ID of the media to download.
     * @private
     */
    async _handleDownloadClick(e, mediaId) {
      e.stopPropagation(); // Prevent parent elements from handling the click.

      const button = e.currentTarget;
      if (!(button instanceof HTMLButtonElement)) return; // Type Guard

      // Show loading state immediately to improve synchronous interface response UX
      this.ui.updateButtonState(button, 'LOADING_LOCKED');
      this.ui.showToast('Fetching media info...', 'info');

      try {
        const mediaInfo = await this.mediaInfoManager.getMediaInfo(mediaId);
        if (!mediaInfo) {
          this.ui.showToast('Could not retrieve media details.', 'error');
          this.ui.updateButtonState(button, 'ERROR');
          return;
        }

        await this.downloadManager.startDownload(
          mediaId,
          mediaInfo,
          {
            onStatusChange: (state) => this.ui.updateButtonState(button, state),
            onNotify: (message, type) => this.ui.showToast(message, type),
          },
          button
        );
      } catch (err) {
        Logger.error('DOWNLOAD ERROR', LOG_STYLES.RED, 'Critical error encountered inside download click handler execution loop:', err);
        this.ui.showToast('Download initialization failed.', 'error');
        this.ui.updateButtonState(button, 'ERROR');
      }
    }

    /**
     * Opens the media in a clean, minimalist viewer in a new tab.
     * For videos, it uses <video>; for images, it shows the image directly.
     * @param {object} mediaInfo - The cached media info.
     * @param {string} mediaId - The media ID.
     * @private
     */
    _openCleanViewer(mediaInfo, mediaId) {
      const { hdUrl, userName } = mediaInfo;
      const watchUrl = `${CONSTANTS.WATCH_URL_BASE}${mediaId}`;
      // Construct title: "UserName - MediaID" or fallback to "RedGIFs - MediaID"
      const pageTitle = userName ? `${userName} - ${mediaId}` : `RedGIFs - ${mediaId}`;

      const newWindow = window.open('', '_blank');
      if (!newWindow) {
        this.ui.showToast('Popup blocked. Please allow popups for this site.', 'error');
        return;
      }

      // Security: Disconnect opener reference safely
      try {
        newWindow.opener = null;
      } catch {
        // Ignore: Some browsers may disallow setting opener
      }

      const doc = newWindow.document;
      // DOM Initialization Safety
      // Ensure essential nodes exist. If document is fundamentally broken, fallback to standard page.
      try {
        if (!doc || !doc.documentElement) {
          throw new Error('Document structure is not ready');
        }
        // Auto-heal missing head/body (common in about:blank)
        if (!doc.head) doc.documentElement.appendChild(h('head'));
        if (!doc.body) doc.documentElement.appendChild(h('body'));
      } catch (e) {
        // Fallback: Navigate the blank window to the standard watch page
        newWindow.location.href = watchUrl;
        return;
      }

      doc.title = pageTitle;

      // Apply body styles directly
      Object.assign(doc.body.style, {
        margin: '0',
        padding: '0',
        backgroundColor: '#000',
        height: '100vh',
        width: '100vw',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      });

      // Determine if it's an image or video by extension
      const isImage = CONSTANTS.REGEX.IMAGE_EXT.test(getExtension(hdUrl));

      // Create styles for Buttons and Video/Image
      const styleEl = h('style', { type: 'text/css' });
      styleEl.textContent = UI_STYLES_TEMPLATE + CLEAN_VIEWER_STYLES;
      doc.head.appendChild(styleEl);

      if (isImage) {
        // Display image
        const imgEl = h('img', {
          src: hdUrl,
          style: {
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          },
        });
        doc.body.appendChild(imgEl);
      } else {
        // Display video
        const videoEl = h('video', {
          src: hdUrl,
        });

        // Explicitly assign properties to the HTMLVideoElement instance to satisfy
        // browser Autoplay Policies and ensure maximum flexibility for potential
        // dynamic UI/control bar toggling in future updates.
        if (videoEl instanceof HTMLVideoElement) {
          videoEl.autoplay = true;
          videoEl.loop = true;
          videoEl.muted = true;
          videoEl.playsInline = true;
          videoEl.controls = true;
        }
        doc.body.appendChild(videoEl);
      }

      // Create Toast Container for Child Window
      const toastContainer = h(`div.${APPID}-toast-container`);
      doc.body.appendChild(toastContainer);

      /**
       * Displays a toast notification inside the child window.
       * @param {string} message
       * @param {'info'|'success'|'error'} type
       */
      const showCleanToast = (message, type) => {
        const toastClass = `${APPID}-toast-${type}`;
        const toastElement = h(`div.${APPID}-toast`, { className: toastClass }, message);
        toastContainer.appendChild(toastElement);

        const duration = type === 'error' ? CONSTANTS.TOAST_ERROR_DURATION : CONSTANTS.TOAST_DURATION;

        setTimeout(() => {
          toastElement.classList.add('exiting');
          setTimeout(() => {
            toastElement.remove();
          }, CONSTANTS.TOAST_FADE_OUT_DURATION);
        }, duration);
      };

      // Create Open Button Element
      const openBtn = h('a.clean-open-btn', {
        href: watchUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: 'Open Original Page',
      });
      const openIcon = CACHED_ICONS['OPEN_IN_NEW'].cloneNode(true);
      if (openIcon) {
        openBtn.appendChild(openIcon);
      }
      doc.body.appendChild(openBtn);

      // Create Download Button Element
      const downloadBtn = h('button.clean-download-btn', {
        title: 'Download HD Video',
      });
      const downloadIcon = CACHED_ICONS['DOWNLOAD'].cloneNode(true);
      if (downloadIcon) {
        downloadBtn.appendChild(downloadIcon);
      }

      // Ensure the created element is a functional button before binding events
      if (downloadBtn instanceof HTMLButtonElement) {
        downloadBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.downloadManager
            .startDownload(
              mediaId,
              mediaInfo,
              {
                onStatusChange: (state) => this.ui.updateButtonState(downloadBtn, state),
                onNotify: showCleanToast,
              },
              downloadBtn
            )
            .catch((err) => {
              Logger.error('DOWNLOAD ERROR', LOG_STYLES.RED, 'Asynchronous operations tracking failed inside Clean Viewer handler scope:', err);
            });
        });
      }
      doc.body.appendChild(downloadBtn);
    }
  }

  // =================================================================================
  // SECTION: Entry Point
  // =================================================================================

  if (ExecutionGuard.hasExecuted()) return;
  ExecutionGuard.setExecuted();

  // 1. Instantiate controller immediately at document-start.
  const app = new AppController();

  // 2. Defer the UI initialization (init()) until the DOM is ready, as UIManager and Sentinel need access to document.body.
  // init() is now async because it loads configuration first.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      app.init().catch((e) => {
        Logger.error('INIT', LOG_STYLES.RED, 'Failed to initialize app:', e);
      });
    });
  } else {
    // Already 'interactive' or 'complete'
    app.init().catch((e) => {
      Logger.error('INIT', LOG_STYLES.RED, 'Failed to initialize app:', e);
    });
  }
})();

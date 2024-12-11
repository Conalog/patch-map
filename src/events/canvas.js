import { deepMerge } from '../utils';

const CONFIG = {
  canvas: {
    scale: { min: 0.5, max: 30 },
  },
};

export const CANVAS_EVENTS_CONFIG = {
  clampZoom: {
    minScale: CONFIG.canvas.scale.min,
    maxScale: CONFIG.canvas.scale.max,
  },
  drag: {},
  wheel: {},
  pinch: {},
  decelerate: {},
};

/**
 * Configures multiple canvas addons (plugins) on the viewport.
 *
 * @param {Viewport} viewport - The PixiJS Viewport instance where the addons will be applied.
 * @param {Object} events - An object mapping addon names to their options.
 *  - `true` to activate the addon with default options.
 *  - `false` to deactivate the addon.
 *  - An options object to customize and activate the addon.
 * @example
 * setCanvasEvents(viewport, {
 *   drag: { direction: 'x' },
 *   wheel: true,
 *   pinch: false,
 * });
 */
export function setCanvasEvents(viewport, events) {
  for (const [addonName, options] of Object.entries(events)) {
    try {
      toggleCanvasAddon(viewport, addonName, options);
    } catch (e) {
      console.error(`Failed to set addon: ${addonName}`, e);
    }
  }
}

/**
 * Toggles a single canvas addon (plugin) on the viewport.
 *
 * @param {Viewport} viewport - The PixiJS Viewport instance where the addon will be applied.
 * @param {string} addonName - The name of the addon to configure (e.g., 'drag', 'wheel').
 * @param {boolean|Object} [options=true] - The configuration for the addon:
 *  - `true` to activate the addon with default options.
 *  - `false` to deactivate the addon.
 *  - An object to customize and activate the addon.
 * @example
 * // Activate the drag addon with custom options
 * toggleCanvasAddon(viewport, 'drag', { direction: 'x' });
 *
 * // Activate the wheel addon with default options
 * toggleCanvasAddon(viewport, 'wheel');
 *
 * // Deactivate the pinch addon
 * toggleCanvasAddon(viewport, 'pinch', false);
 */
export function toggleCanvasAddon(viewport, addonName, options = true) {
  const addon = viewport.plugins.get(addonName);

  if (options === false) {
    if (addon) {
      viewport.plugins.pause(addonName);
    }
    return;
  }

  const mergedOptions =
    typeof options === 'object'
      ? deepMerge(CANVAS_EVENTS_CONFIG[addonName] || {}, options)
      : CANVAS_EVENTS_CONFIG[addonName] || {};
  if (addon) {
    if (typeof options === 'object') {
      viewport.plugins.remove(addonName);
      viewport[addonName](mergedOptions);
    } else {
      viewport.plugins.resume(addonName);
    }
  } else {
    viewport[addonName](mergedOptions);
  }
}

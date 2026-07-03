import { setActivePyodideSDLCanvas } from './pyodide-runtime-service';

/**
 * Escapes text for use in a regular expression.
 * @param {string} value - Literal text.
 * @returns {string} Escaped text.
 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts literal camera attachment sizes for a Miniworlds world variable.
 * @param {string} code - Learner code.
 * @param {string|null} worldName - Variable that stores the world.
 * @returns {{left: number, right: number, top: number, bottom: number}} Insets.
 */
function inferMiniworldsCameraAttachments(code, worldName) {
  const attachments = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  };

  if (!worldName) {
    return attachments;
  }

  const escapedWorldName = escapeRegExp(worldName);
  const attachmentPattern = new RegExp(
    `${escapedWorldName}\\.camera\\.add_(left|right|top|bottom)\\(([^)]*)\\)`,
    'g',
  );

  let match;
  while ((match = attachmentPattern.exec(code)) !== null) {
    const side = match[1];
    const args = match[2] || '';
    const sizeMatch = args.match(/(?:^|,)\s*size\s*=\s*(\d+)\b/)
      || args.match(/,\s*(\d+)\s*(?:,|\s*$)/);

    if (sizeMatch) {
      attachments[side] += Number(sizeMatch[1]);
    }
  }

  return attachments;
}

/**
 * Adds camera attachment space to a Miniworlds logical world size.
 * @param {{width: number, height: number}} size - Base world size.
 * @param {{left: number, right: number, top: number, bottom: number}} attachments - Camera attachments.
 * @returns {{width: number, height: number}} Total display size.
 */
function applyMiniworldsCameraAttachments(size, attachments) {
  return {
    width: size.width + attachments.left + attachments.right,
    height: size.height + attachments.top + attachments.bottom,
  };
}

/**
 * Returns JavaScript identifiers that can reference a Miniworlds export.
 * Supports direct imports such as `from miniworlds import World`,
 * aliases such as `from miniworlds import World as W`, and module aliases
 * such as `import miniworlds as mw` when used as `mw.World(...)`.
 * @param {string} code - Learner code.
 * @param {string} exportName - Miniworlds export name, e.g. World.
 * @returns {string[]} Escaped constructor references for regular expressions.
 */
function getMiniworldsConstructorReferences(code, exportName) {
  const references = new Set([`miniworlds\\.${exportName}`, exportName]);

  const moduleImportPattern = /(?:^|\n)\s*import\s+miniworlds(?:\s+as\s+([A-Za-z_]\w*))?/g;
  let moduleMatch;
  while ((moduleMatch = moduleImportPattern.exec(code)) !== null) {
    const alias = moduleMatch[1] || 'miniworlds';
    references.add(`${escapeRegExp(alias)}\\.${exportName}`);
  }

  const fromImportPattern = /(?:^|\n)\s*from\s+miniworlds\s+import\s+([^\n#]+)/g;
  let fromMatch;
  while ((fromMatch = fromImportPattern.exec(code)) !== null) {
    const importedNames = fromMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    importedNames.forEach((part) => {
      const importMatch = part.match(new RegExp(`^${exportName}(?:\\s+as\\s+([A-Za-z_]\\w*))?$`));
      if (importMatch) {
        references.add(escapeRegExp(importMatch[1] || exportName));
      }
    });
  }

  return [...references];
}

const ROBOT_WORLD_CONFIG_SIZES = Object.freeze({
  basic: Object.freeze({ columns: 10, rows: 10, tileSize: 40 }),
  sequence_path: Object.freeze({ columns: 6, rows: 4, tileSize: 40 }),
  variables_path: Object.freeze({ columns: 6, rows: 4, tileSize: 40 }),
  function_path: Object.freeze({ columns: 6, rows: 4, tileSize: 40 }),
  loop_square: Object.freeze({ columns: 6, rows: 6, tileSize: 40 }),
  leaf_line: Object.freeze({ columns: 7, rows: 3, tileSize: 40 }),
  obstacle_garden: Object.freeze({ columns: 7, rows: 5, tileSize: 40 }),
  with_position: Object.freeze({ columns: 10, rows: 10, tileSize: 40 }),
});

/**
 * Returns JavaScript identifiers that can reference miniworlds_robot.load_world.
 * @param {string} code - Learner code.
 * @returns {string[]} Escaped function references for regular expressions.
 */
function getMiniworldsRobotLoadWorldReferences(code) {
  const references = new Set(['miniworlds_robot\\.load_world']);

  const moduleImportPattern = /(?:^|\n)\s*import\s+miniworlds_robot(?:\s+as\s+([A-Za-z_]\w*))?/g;
  let moduleMatch;
  while ((moduleMatch = moduleImportPattern.exec(code)) !== null) {
    const alias = moduleMatch[1] || 'miniworlds_robot';
    references.add(`${escapeRegExp(alias)}\\.load_world`);
  }

  const fromImportPattern = /(?:^|\n)\s*from\s+miniworlds_robot\s+import\s+([^\n#]+)/g;
  let fromMatch;
  while ((fromMatch = fromImportPattern.exec(code)) !== null) {
    const importedNames = fromMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    importedNames.forEach((part) => {
      const importMatch = part.match(/^load_world(?:\s+as\s+([A-Za-z_]\w*))?$/);
      if (importMatch) {
        references.add(escapeRegExp(importMatch[1] || 'load_world'));
      }
    });
  }

  return [...references];
}

/**
 * Reads a positive integer argument from a simple Python call argument list.
 * @param {string} args - Raw call argument text.
 * @param {number} positionalIndex - Zero-based positional argument index.
 * @param {string[]} keywordNames - Supported keyword names.
 * @returns {number|null} Parsed number or null.
 */
function readIntegerArgument(args, positionalIndex, keywordNames = []) {
  const cleanedArgs = String(args || '').replace(/#.*$/gm, '');
  const keywordAlternation = keywordNames.map(escapeRegExp).join('|');

  if (keywordAlternation) {
    const keywordMatch = cleanedArgs.match(new RegExp(`(?:^|,)\\s*(?:${keywordAlternation})\\s*=\\s*(\\d+)\\b`));
    if (keywordMatch) {
      return Number(keywordMatch[1]);
    }
  }

  const positionalArgs = cleanedArgs
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !part.includes('='));

  const positionalMatch = positionalArgs[positionalIndex]?.match(/^(\d+)\b/);
  return positionalMatch ? Number(positionalMatch[1]) : null;
}

/**
 * Reads a simple string literal argument from a Python call argument list.
 * @param {string} args - Raw call argument text.
 * @param {number} positionalIndex - Zero-based positional argument index.
 * @param {string[]} keywordNames - Supported keyword names.
 * @returns {string|null} Parsed string or null.
 */
function readStringArgument(args, positionalIndex, keywordNames = []) {
  const cleanedArgs = String(args || '').replace(/#.*$/gm, '');
  const stringPattern = String.raw`(['"])([^'"]+)\1`;
  const keywordAlternation = keywordNames.map(escapeRegExp).join('|');

  if (keywordAlternation) {
    const keywordMatch = cleanedArgs.match(new RegExp(`(?:^|,)\\s*(?:${keywordAlternation})\\s*=\\s*${stringPattern}`));
    if (keywordMatch) {
      return keywordMatch[2];
    }
  }

  const positionalArgs = cleanedArgs
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !part.includes('='));
  const positionalMatch = positionalArgs[positionalIndex]?.match(new RegExp(`^${stringPattern}`));

  return positionalMatch ? positionalMatch[2] : null;
}

/**
 * Finds the first Miniworlds constructor call that can be statically sized.
 * @param {string} code - Learner code.
 * @param {string} exportName - Constructor export name.
 * @returns {{worldName: string|null, args: string}|null} Constructor call.
 */
function findMiniworldsConstructorCall(code, exportName) {
  const constructors = getMiniworldsConstructorReferences(code, exportName).join('|');
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:(\\w+)\\s*=\\s*)?(?:${constructors})\\(\\s*([^)]*?)\\s*\\)`,
  );
  const match = code.match(pattern);

  if (!match) {
    return null;
  }

  return {
    worldName: match[1] || null,
    args: match[2] || '',
  };
}

/**
 * Finds the first miniworlds_robot.load_world call that can be statically sized.
 * @param {string} code - Learner code.
 * @returns {{worldName: string|null, args: string}|null} Loader call.
 */
function findMiniworldsRobotLoadWorldCall(code) {
  const references = getMiniworldsRobotLoadWorldReferences(code).join('|');
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:(\\w+)\\s*=\\s*)?(?:${references})\\(\\s*([^)]*?)\\s*\\)`,
  );
  const match = code.match(pattern);

  if (!match) {
    return null;
  }

  return {
    worldName: match[1] || null,
    args: match[2] || '',
  };
}

/**
 * Binds SDL rendering to the current visible canvas.
 * @param {object} runner - PyodideRunner instance.
 * @param {boolean} [focus] - Whether keyboard focus should move to the canvas.
 * @returns {void}
 */
export function bindSDLCanvas(runner, focus = false) {
  if (!runner.sdlCanvas) {
    return;
  }

  setActivePyodideSDLCanvas(runner.sdlCanvas);
  runner.pyodide?.canvas?.setCanvas2D?.(runner.sdlCanvas);

  if (focus && runner.sdlCanvas.isConnected && typeof runner.sdlCanvas.focus === 'function') {
    runner.sdlCanvas.focus({ preventScroll: true });
  }
}

/**
 * Attempts to infer static SDL world dimensions from learner code.
 * Supports common literal forms for miniworlds and pygame.
 * @param {object} runner - PyodideRunner instance.
 * @returns {{width: number, height: number}|null} Inferred logical size.
 */
export function inferSDLLogicalSize(runner) {
  const code = runner.runtime?.getAnalysisCode?.();

  if (!code) {
    return null;
  }

  const robotWorldCall = findMiniworldsRobotLoadWorldCall(code);
  if (robotWorldCall) {
    const configName = readStringArgument(robotWorldCall.args, 0, ['config']) || 'basic';
    const configSize = ROBOT_WORLD_CONFIG_SIZES[configName] || ROBOT_WORLD_CONFIG_SIZES.basic;
    const columns = readIntegerArgument(robotWorldCall.args, 1, ['columns']) || configSize.columns;
    const rows = readIntegerArgument(robotWorldCall.args, 2, ['rows']) || configSize.rows;
    const tileSize = readIntegerArgument(robotWorldCall.args, 3, ['tile_size', 'tileSize']) || configSize.tileSize;
    const size = {
      width: columns * tileSize,
      height: rows * tileSize,
    };

    return applyMiniworldsCameraAttachments(
      size,
      inferMiniworldsCameraAttachments(code, robotWorldCall.worldName),
    );
  }

  const worldCall = findMiniworldsConstructorCall(code, 'World');
  if (worldCall) {
    const width = readIntegerArgument(worldCall.args, 0, ['width']);
    const height = readIntegerArgument(worldCall.args, 1, ['height']);

    if (width && height) {
      const size = { width, height };
      return applyMiniworldsCameraAttachments(
        size,
        inferMiniworldsCameraAttachments(code, worldCall.worldName),
      );
    }

    // miniworlds.World() or World() – default 400×400 px
    return applyMiniworldsCameraAttachments(
      { width: 400, height: 400 },
      inferMiniworldsCameraAttachments(code, worldCall.worldName),
    );
  }

  const tiledCall = findMiniworldsConstructorCall(code, 'TiledWorld');
  if (tiledCall) {
    const columns = readIntegerArgument(tiledCall.args, 0, ['columns', 'cols']);
    const rows = readIntegerArgument(tiledCall.args, 1, ['rows']);
    const tileSize = readIntegerArgument(tiledCall.args, 2, ['tile_size', 'tileSize']) || 40;

    if (columns && rows) {
      const size = {
        width: columns * tileSize,
        height: rows * tileSize,
      };
      return applyMiniworldsCameraAttachments(
        size,
        inferMiniworldsCameraAttachments(code, tiledCall.worldName),
      );
    }

    // miniworlds.TiledWorld() or TiledWorld() – default 20×16 tiles × 40 px = 800×640
    return applyMiniworldsCameraAttachments(
      { width: 800, height: 640 },
      inferMiniworldsCameraAttachments(code, tiledCall.worldName),
    );
  }

  // pygame.display.set_mode((width, height))
  const pygameMatch = code.match(/pygame\.display\.set_mode\(\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*\)/);
  if (pygameMatch) {
    return { width: Number(pygameMatch[1]), height: Number(pygameMatch[2]) };
  }

  return null;
}

/**
 * Seeds the SDL canvas with a statically inferred logical size when SDL has
 * not yet resized it away from the 1x1 placeholder.
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function primeSDLCanvasLogicalSize(runner) {
  if (!runner.sdlCanvas) {
    return;
  }

  if (runner.sdlCanvas.width > 1 && runner.sdlCanvas.height > 1) {
    return;
  }

  const inferredSize = inferSDLLogicalSize(runner);
  if (!inferredSize) {
    return;
  }

  runner.sdlCanvas.width = inferredSize.width;
  runner.sdlCanvas.height = inferredSize.height;
}

/**
 * Applies CSS display sizing to the visible SDL canvas.
 * @param {HTMLCanvasElement} canvas - Visible SDL canvas.
 * @param {number} width - CSS width in pixels.
 * @param {string} aspectRatio - CSS aspect ratio value.
 * @returns {void}
 */
function applySDLCanvasDisplaySize(canvas, width, aspectRatio) {
  canvas.style.width = `${width}px`;
  canvas.style.height = 'auto';
  canvas.style.aspectRatio = aspectRatio;
}

/**
 * Synchronizes the SDL canvas display size with its current host dimensions.
 *
 * Uses CSS style scaling rather than changing canvas.width/canvas.height so
 * that the logical coordinate space set by pygame.display.set_mode() is
 * preserved. Changing the pixel dimensions would shift SDL's coordinate origin
 * and cause mouse events to map to wrong game positions.
 *
 * Strategy: display the canvas at its natural 1:1 logical size, but cap it at
 * the container width via max-width:100% (set once in setupSDLCanvas).
 * Setting height:auto + aspect-ratio instead of an explicit pixel height means
 * that CSS scaling is self-consistent: if the container narrows after setup,
 * both width and height shrink proportionally without distortion, even without
 * a ResizeObserver.
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function syncSDLCanvasSize(runner) {
  if (!runner.sdlCanvas || !runner.canvasDiv) {
    return;
  }

  const containerW = runner.canvasDiv.clientWidth;

  if (containerW <= 0) {
    return;
  }

  const logicalW = runner.sdlCanvas.width;
  const logicalH = runner.sdlCanvas.height;
  const hasInitializedLogicalSize = logicalW > 1 && logicalH > 1;

  if (hasInitializedLogicalSize) {
    // Natural 1:1 size; max-width:100% (set on the element) caps it at the
    // container width. height:auto derives from width via aspect-ratio.
    applySDLCanvasDisplaySize(runner.sdlCanvas, logicalW, `${logicalW} / ${logicalH}`);
  }
  else {
    // Canvas not yet initialised. setupSDLCanvas starts at 1x1 on purpose so
    // any later set_mode() call changes both attributes and trips the observer.
    // Treat that placeholder like an uninitialised canvas so it stays visible
    // at a sensible size instead of collapsing to a 1px dot.
    // Use container width with a 4:3 placeholder so the div has visible height.
    applySDLCanvasDisplaySize(runner.sdlCanvas, containerW, '4 / 3');
  }
}

/**
 * Rebinds SDL canvas over multiple ticks to avoid browser-specific timing races.
 * @param {object} runner - PyodideRunner instance.
 * @returns {void}
 */
export function scheduleSDLCanvasRebind(runner) {
  runner.syncSDLCanvasSize();
  runner.bindSDLCanvas();

  if (typeof window?.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      runner.syncSDLCanvasSize();
      runner.bindSDLCanvas();
    });
  }
}

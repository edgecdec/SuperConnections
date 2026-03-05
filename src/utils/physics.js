/**
 * SHARED PHYSICS ENGINE
 * This logic is used by both the Client and Server to ensure 
 * perfectly synchronized board layouts.
 */

function applyGridPhysics(tiles, settings, tilesPerRow, survivorId = null) {
  if (!settings || (!settings.popToTop && settings.gravity !== 'up')) {
    return tiles;
  }

  const numCols = tilesPerRow;
  const colBuckets = Array.from({ length: numCols }, () => []);

  // 1. Sort tiles into their permanent vertical tracks
  tiles.forEach(tile => {
    // If a tile doesn't have a column yet (e.g. from an old save), 
    // we assign one based on its current index to prevent crashes.
    const col = (tile.col !== undefined) ? tile.col : (tiles.indexOf(tile) % numCols);
    if (colBuckets[col]) {
      colBuckets[col].push(tile);
    }
  });

  // 2. Apply physics within each vertical track
  colBuckets.forEach(bucket => {
    if (bucket.length === 0) return;

    // Separate the bucket into states
    const active = bucket.filter(t => !t.hidden && !t.locked && t.id !== survivorId);
    const hidden = bucket.filter(t => t.hidden || t.locked);
    const survivor = bucket.find(t => t.id === survivorId);

    // Rebuild the column: [Survivor (if exists)] -> [Active Tiles] -> [Hidden/Locked Tiles]
    // This creates the "Fall Upwards" effect.
    bucket.length = 0;
    if (survivor && settings.popToTop) {
      bucket.push(survivor);
    } else if (survivor) {
      // If popToTop is off but gravity is on, survivor stays in active pool
      active.unshift(survivor);
    }

    if (settings.gravity === 'up') {
      bucket.push(...active, ...hidden);
    } else {
      // If gravity is off, we must preserve the relative order of active/hidden 
      // but the survivor has already been moved to the top if popToTop was on.
      bucket.push(...active, ...hidden);
    }
  });

  // 3. Re-flatten the columns back into a row-major 1D array for rendering
  const flattened = [];
  const maxRows = Math.max(...colBuckets.map(b => b.length));

  for (let r = 0; r < maxRows; r++) {
    for (let c = 0; c < numCols; c++) {
      if (colBuckets[c][r]) {
        flattened.push(colBuckets[c][r]);
      }
    }
  }

  return flattened;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applyGridPhysics };
} else {
  // For client-side usage if not using a bundler that handles module.exports
  window.applyGridPhysics = applyGridPhysics;
}

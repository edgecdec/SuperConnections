/**
 * SHARED PHYSICS ENGINE
 * This logic is used by both the Client and Server to ensure 
 * perfectly synchronized board layouts.
 */

export function applyGridPhysics(tiles: any[], settings: any, tilesPerRow: number, survivorId: string | null = null) {
  if (!settings || (!settings.popToTop && settings.gravity !== 'up')) {
    return tiles;
  }

  const numCols = tilesPerRow;
  const colBuckets = Array.from({ length: numCols }, () => [] as any[]);

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
    bucket.length = 0;
    if (survivor && settings.popToTop) {
      bucket.push(survivor);
    } else if (survivor) {
      active.unshift(survivor);
    }

    if (settings.gravity === 'up') {
      bucket.push(...active, ...hidden);
    } else {
      bucket.push(...active, ...hidden);
    }
  });

  // 3. Re-flatten the columns back into a row-major 1D array for rendering
  const flattened: any[] = [];
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

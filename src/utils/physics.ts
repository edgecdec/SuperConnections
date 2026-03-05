/**
 * SHARED PHYSICS ENGINE
 * This logic is used by both the Client and Server to ensure 
 * perfectly synchronized board layouts.
 */

export function applyGridPhysics(tiles: any[], settings: any, numCols: number, survivorId: string | null = null) {
  if (!settings || (!settings.popToTop && settings.gravity !== 'up')) {
    return tiles;
  }

  // Ensure numCols is valid
  const columns = numCols || 25;
  const colBuckets = Array.from({ length: columns }, () => [] as any[]);

  // 1. Sort tiles into their permanent vertical tracks
  tiles.forEach(tile => {
    // We strictly respect tile.col. If missing, we fallback to 0.
    const col = (tile.col !== undefined) ? tile.col : 0;
    if (colBuckets[col]) {
      colBuckets[col].push(tile);
    } else {
      // Fallback for safety: if col is out of bounds, put in col 0
      colBuckets[0].push(tile);
    }
  });

  // 2. Apply physics within each vertical track
  colBuckets.forEach(bucket => {
    if (bucket.length === 0) return;

    // Filter into pools to maintain relative order
    const active = bucket.filter(t => !t.hidden && !t.locked && t.id !== survivorId);
    const hiddenOrLocked = bucket.filter(t => t.hidden || t.locked);
    const survivor = bucket.find(t => t.id === survivorId);

    bucket.length = 0;
    
    // Rebuild the column: [Survivor] -> [Active] -> [Hidden]
    if (survivor && settings.popToTop) {
      bucket.push(survivor);
    } else if (survivor) {
      active.unshift(survivor);
    }

    if (settings.gravity === 'up') {
      bucket.push(...active, ...hiddenOrLocked);
    } else {
      bucket.push(...active, ...hiddenOrLocked);
    }
  });

  // 3. Re-flatten row-by-row (Deterministic Flattening)
  const flattened: any[] = [];
  const maxRows = Math.max(...colBuckets.map(b => b.length));

  for (let r = 0; r < maxRows; r++) {
    for (let c = 0; c < columns; c++) {
      const tile = colBuckets[c][r];
      if (tile) flattened.push(tile);
    }
  }

  return flattened;
}

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
  // We use tile.col which MUST be assigned during board generation.
  tiles.forEach(tile => {
    const col = (tile.col !== undefined) ? tile.col : 0;
    if (colBuckets[col]) {
      colBuckets[col].push(tile);
    }
  });

  // 2. Apply physics within each vertical track
  colBuckets.forEach(bucket => {
    if (bucket.length === 0) return;

    // Filter into three pools to maintain relative order of active tiles
    const active = bucket.filter(t => !t.hidden && !t.locked && t.id !== survivorId);
    const hiddenOrLocked = bucket.filter(t => t.hidden || t.locked);
    const survivor = bucket.find(t => t.id === survivorId);

    // Rebuild the column:
    // [Survivor] (if popped to top)
    // [Active Tiles] (in their previous relative order)
    // [Hidden/Locked Tiles] (sunk to the bottom)
    
    bucket.length = 0;
    
    if (survivor && settings.popToTop) {
      bucket.push(survivor);
    } else if (survivor) {
      // If survivor shouldn't pop, keep it at the top of active pool
      active.unshift(survivor);
    }

    if (settings.gravity === 'up') {
      bucket.push(...active, ...hiddenOrLocked);
    } else {
      // If no gravity, we should technically keep original positions, 
      // but "Pop to Top" already forced a reorder. 
      // For consistency, we maintain the active -> hidden split.
      bucket.push(...active, ...hiddenOrLocked);
    }
  });

  // 3. Re-flatten the columns back into a row-major 1D array for rendering
  // Row 0: [C0, C1, C2...]
  // Row 1: [C0, C1, C2...]
  const flattened: any[] = [];
  const maxRows = Math.max(...colBuckets.map(b => b.length));

  for (let r = 0; r < maxRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const tile = colBuckets[c][r];
      if (tile) {
        flattened.push(tile);
      }
    }
  }

  return flattened;
}

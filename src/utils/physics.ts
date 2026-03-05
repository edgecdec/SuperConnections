/**
 * SHARED PHYSICS ENGINE
 * This logic is used by both the Client and Server to ensure 
 * perfectly synchronized board layouts.
 */

export function applyGridPhysics(tiles: any[], settings: any, tilesPerRow: number, survivorId: string | null = null) {
  const numCols = tilesPerRow || 25;
  
  // 1. Separate active from inactive tiles
  // Inactive tiles (locked or hidden) don't participate in gravity
  const activeTiles = tiles.filter(t => !t.hidden && !t.locked);
  const inactiveTiles = tiles.filter(t => t.hidden || t.locked);

  // 2. Bucket active tiles by their current column to prevent left/right shifting
  const colBuckets = Array.from({ length: numCols }, () => [] as any[]);

  activeTiles.forEach(tile => {
    // Fallback to col or array index if durableKey is missing
    const currentKey = tile.durableKey !== undefined ? tile.durableKey : (tile.col !== undefined ? tile.col : tiles.indexOf(tile));
    let col = currentKey % numCols;
    if (isNaN(col) || col < 0 || col >= numCols) col = 0;
    colBuckets[col].push(tile);
  });

  // 3. Process each column: Sort vertically, apply Pop to Top, then Compact
  const nextActive: any[] = [];
  
  colBuckets.forEach((bucket, colIdx) => {
    // Preserve relative vertical ordering using the existing durableKey
    bucket.sort((a, b) => {
      const keyA = a.durableKey !== undefined ? a.durableKey : (a.order !== undefined ? a.order : tiles.indexOf(a));
      const keyB = b.durableKey !== undefined ? b.durableKey : (b.order !== undefined ? b.order : tiles.indexOf(b));
      return keyA - keyB;
    });

    // Handle "Pop to Top" for the survivor or manual move
    if (survivorId && (settings?.popToTop || survivorId === survivorId)) {
      const sIdx = bucket.findIndex(t => t.id === survivorId);
      if (sIdx !== -1) {
        const sTile = bucket.splice(sIdx, 1)[0];
        bucket.unshift(sTile);
      }
    }

    // Assign new explicit compacted durableKey purely upward
    // Key = colIdx + (rowIdx * numCols)
    bucket.forEach((tile, rowIdx) => {
      tile.durableKey = colIdx + (rowIdx * numCols);
      // Keep legacy properties in sync for safety
      tile.col = colIdx;
      tile.order = tile.durableKey; 
      nextActive.push(tile);
    });
  });

  // 4. Sort the active array by durableKey so it's row-major for rendering
  nextActive.sort((a, b) => a.durableKey - b.durableKey);

  // 5. Append inactive tiles to the end
  return [...nextActive, ...inactiveTiles];
}

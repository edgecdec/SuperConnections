/**
 * SHARED PHYSICS ENGINE
 * This logic is used by both the Client and Server to ensure 
 * perfectly synchronized board layouts.
 */

export function applyGridPhysics(tiles: any[], settings: any, tilesPerRow: number, survivorId: string | null = null) {
  const numCols = tilesPerRow || Math.max(1, settings?.numCategories || 4);
  
  // 1. Separate active from inactive tiles
  const activeTiles = tiles.filter(t => !t.hidden && !t.locked);
  const inactiveTiles = tiles.filter(t => t.hidden || t.locked);

  // 2. Bucket active tiles by their current column to prevent left/right shifting
  const colBuckets = Array.from({ length: numCols }, () => [] as any[]);

  activeTiles.forEach(tile => {
    // Fallback to array index if durableKey is missing (e.g. init or old state)
    const currentKey = tile.durableKey !== undefined ? tile.durableKey : tiles.indexOf(tile);
    let col = currentKey % numCols;
    // Safety check just in case math is off
    if (isNaN(col) || col < 0 || col >= numCols) col = 0;
    colBuckets[col].push(tile);
  });

  // 3. Sort each column vertically by their old durableKey, then compact them upward
  const nextActive: any[] = [];
  
  colBuckets.forEach((bucket, colIdx) => {
    // Preserve relative vertical ordering
    bucket.sort((a, b) => {
      const keyA = a.durableKey !== undefined ? a.durableKey : tiles.indexOf(a);
      const keyB = b.durableKey !== undefined ? b.durableKey : tiles.indexOf(b);
      return keyA - keyB;
    });

    // If popToTop is enabled (e.g., from a double-click reorder or explicit setting), move survivor to the top of its column
    if (survivorId && settings?.popToTop) {
      const survivorIdx = bucket.findIndex(t => t.id === survivorId);
      if (survivorIdx > 0) { // If it's 0, it's already top
        const survivor = bucket.splice(survivorIdx, 1)[0];
        bucket.unshift(survivor);
      }
    }

    // Assign new explicit compacted durableKey purely upward
    bucket.forEach((tile, rowIdx) => {
      tile.durableKey = colIdx + (rowIdx * numCols);
      nextActive.push(tile);
    });
  });

  // 4. Sort the active array row-by-row for the React rendering map
  nextActive.sort((a, b) => a.durableKey - b.durableKey);

  // 5. Append inactive tiles to the end of the state so they don't disrupt the flow
  return [...nextActive, ...inactiveTiles];
}

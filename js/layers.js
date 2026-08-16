/**
 * Walk a layer tree in display order (depth first, parent before children).
 *
 * The entry point may be a template object, an array of layers, or one layer.
 * Keeping that small amount of flexibility makes the helpers useful to both
 * the renderer and tests without coupling them to a particular template.
 */
function *walkLayers(source, visited = new WeakSet()) {
  if (Array.isArray(source)) {
    if (visited.has(source)) return;
    visited.add(source);
    for (const layer of source) yield *walkLayers(layer, visited);
    return;
  }

  if (!source || typeof source !== "object" || visited.has(source)) return;
  visited.add(source);

  // A template is a container, not a layer itself.
  if (Array.isArray(source.layers)) {
    yield *walkLayers(source.layers, visited);
    return;
  }

  yield source;
  if (Array.isArray(source.children)) {
    yield *walkLayers(source.children, visited);
  }
}

/**
 * Return the first layer whose id exactly matches `id`, or null.
 */
export function findLayerById(source, id) {
  for (const layer of walkLayers(source)) {
    if (layer.id === id) return layer;
  }
  return null;
}

/**
 * Return every layer whose id exactly matches `id` in depth-first order.
 */
export function findAllLayersById(source, id) {
  const matches = [];
  for (const layer of walkLayers(source)) {
    if (layer.id === id) matches.push(layer);
  }
  return matches;
}

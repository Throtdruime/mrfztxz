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

export function findLayerById(source, id) {
  for (const layer of walkLayers(source)) {
    if (layer.id === id) return layer;
  }
  return null;
}

export function findAllLayersById(source, id) {
  const matches = [];
  for (const layer of walkLayers(source)) {
    if (layer.id === id) matches.push(layer);
  }
  return matches;
}

export function isDetectorEnabled(detectorId, overrides = {}) {
  return overrides?.[detectorId]?.enabled !== false;
}

export function enabledDetectors(detectors, overrides = {}) {
  return detectors.filter((detector) => isDetectorEnabled(detector.id, overrides));
}

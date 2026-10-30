/** Offline geometry: distances, bearings and a flat projection for the offline map. */
export interface Point { latitude: number; longitude: number }

const rad = (deg: number) => deg * Math.PI / 180;

export function distanceKm(a: Point, b: Point): number {
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: Point, b: Point): number {
  const y = Math.sin(rad(b.longitude - a.longitude)) * Math.cos(rad(b.latitude));
  const x = Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) - Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(rad(b.longitude - a.longitude));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function compass(deg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** Fit points into a width x height box (equirectangular, corrected for latitude). */
export function projector(points: Point[], width: number, height: number, padding = 24) {
  const lats = points.map(p => p.latitude), lons = points.map(p => p.longitude);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos(rad(midLat));
  const minX = Math.min(...lons) * kx, maxX = Math.max(...lons) * kx, minY = Math.min(...lats), maxY = Math.max(...lats);
  const span = Math.max(maxX - minX, maxY - minY, 0.01);
  const scale = Math.min((width - padding * 2) / span, (height - padding * 2) / span);
  const offsetX = (width - (maxX - minX) * scale) / 2, offsetY = (height - (maxY - minY) * scale) / 2;
  return {
    project: (p: Point) => ({ x: offsetX + (p.longitude * kx - minX) * scale, y: height - (offsetY + (p.latitude - minY) * scale) }),
    /** Kilometres represented by `px` screen pixels. */
    kmPerPixel: 111.32 / scale,
  };
}

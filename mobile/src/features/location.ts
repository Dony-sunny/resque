import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { directionsUrl, validPoint, type TravelMode } from '../core/facilities';
import type { Point } from '../core/geo';
import * as service from '../core/services';
import type { LocationFix } from '../core/types';
import { word, type Language } from '../ui/words';

function withTimeout<T>(task: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([task, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms); })]).finally(() => clearTimeout(timer));
}
const toFix = (position: Location.LocationObject, source: LocationFix['source']): LocationFix => ({
  latitude: Number(position.coords.latitude.toFixed(6)), longitude: Number(position.coords.longitude.toFixed(6)),
  accuracy: position.coords.accuracy ?? null, source, at: position.timestamp || Date.now(),
});

/** Location fallback chain for when satellites are blocked (indoors, under rain cloud, phone without GPS):
 * 1 fresh GPS → 2 network/cell-assisted fix → 3 Android last-known fix → 4 last fix this app saved.
 * Returns null when nothing is available; the caller then relies on the typed landmark. */
export async function locateWithFallback(onStep?: (step: string) => void, fast = false): Promise<LocationFix | null> {
  let permitted = false;
  try { permitted = (await Location.requestForegroundPermissionsAsync()).status === 'granted'; } catch { /* Fall through to the saved fix. */ }
  if (permitted) {
    onStep?.('gps');
    const gps = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null), fast ? 7000 : 12000);
    if (gps) return remember(toFix(gps, 'gps'));
    onStep?.('network');
    const network = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }).catch(() => null), fast ? 4000 : 8000);
    if (network) return remember(toFix(network, 'network'));
    onStep?.('last-known');
    const last = await Location.getLastKnownPositionAsync({ maxAge: 6 * 3600 * 1000 }).catch(() => null);
    if (last) return remember(toFix(last, 'last-known'));
  }
  onStep?.('saved');
  try { const saved = await service.loadLastFix(); return saved ? { ...saved, source: 'saved' } : null; } catch { return null; }
}
/** A position that is genuinely current (GPS, network, or a phone fix under 5 minutes old), or null.
 * Unlike locateWithFallback this never returns an old saved fix, so it is safe to use as a route origin. */
export async function currentPosition(): Promise<{ fix: LocationFix | null; denied: boolean }> {
  let permitted = false;
  try { permitted = (await Location.requestForegroundPermissionsAsync()).status === 'granted'; } catch { /* treated as denied */ }
  if (!permitted) return { fix: null, denied: true };
  const gps = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null), 8000);
  if (gps) return { fix: await remember(toFix(gps, 'gps')), denied: false };
  const network = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }).catch(() => null), 5000);
  if (network) return { fix: await remember(toFix(network, 'network')), denied: false };
  const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);
  return { fix: last ? toFix(last, 'last-known') : null, denied: false };
}

/** Opens Google Maps directions: origin = current position when available, destination = the selected facility.
 * Without a current position the origin is omitted and Google Maps uses the device location or asks for a start. */
export async function openGoogleMapsDirections(destination: Point, travelMode: TravelMode, known?: LocationFix | null): Promise<{ usedOrigin: boolean; denied: boolean }> {
  if (!validPoint(destination)) throw new Error('This facility has no valid coordinates, so directions cannot be opened.');
  const fresh = known && Date.now() - known.at < 5 * 60 * 1000 && known.source !== 'saved' ? { fix: known, denied: false } : await currentPosition();
  await Linking.openURL(directionsUrl(destination, fresh.fix, travelMode));
  return { usedOrigin: !!fresh.fix, denied: fresh.denied };
}
async function remember(fix: LocationFix): Promise<LocationFix> {
  try { await service.saveLastFix(fix); } catch { /* A missing cache only weakens the next fallback. */ }
  return fix;
}

/** Human description stored in the landmark so responders know how much to trust the coordinates. */
export function describeFix(fix: LocationFix, language: Language): string {
  const minutes = Math.max(0, Math.round((Date.now() - fix.at) / 60000));
  const accuracy = fix.accuracy ? ` ±${Math.round(fix.accuracy)} m` : '';
  const age = minutes < 2 ? word(language, 'now', 'ഇപ്പോൾ') : minutes < 120 ? word(language, `${minutes} min old`, `${minutes} മിനിറ്റ് മുമ്പ്`) : word(language, `${Math.round(minutes / 60)} h old`, `${Math.round(minutes / 60)} മണിക്കൂർ മുമ്പ്`);
  const source = { gps: word(language, 'GPS', 'GPS'), network: word(language, 'network location', 'നെറ്റ്‌വർക്ക് ലൊക്കേഷൻ'), 'last-known': word(language, 'last known location', 'അവസാനം അറിഞ്ഞ സ്ഥലം'), saved: word(language, 'last location saved by this app', 'ആപ്പ് സൂക്ഷിച്ച അവസാന സ്ഥലം') }[fix.source];
  return `${source}${accuracy}, ${age}`;
}
export function stepLabel(step: string, language: Language): string {
  return ({ gps: word(language, 'Trying GPS satellites...', 'GPS ഉപഗ്രഹങ്ങൾ ശ്രമിക്കുന്നു...'), network: word(language, 'GPS weak. Trying network location...', 'GPS ദുർബലം. നെറ്റ്‌വർക്ക് ലൊക്കേഷൻ ശ്രമിക്കുന്നു...'), 'last-known': word(language, 'Using the phone\'s last known location...', 'ഫോണിന്റെ അവസാന സ്ഥലം ഉപയോഗിക്കുന്നു...'), saved: word(language, 'Checking the last location saved by this app...', 'ആപ്പ് സൂക്ഷിച്ച അവസാന സ്ഥലം പരിശോധിക്കുന്നു...') } as Record<string, string>)[step] || step;
}

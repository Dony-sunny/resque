import * as Location from 'expo-location';
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

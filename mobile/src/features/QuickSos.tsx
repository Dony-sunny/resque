import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, Vibration, View } from 'react-native';
import type { Report, Role } from '../core/types';
import * as service from '../core/services';
import { Icon } from '../ui/components';
import { colors } from '../ui/theme';
import { localizeMessage, word, type Language } from '../ui/words';
import { describeFix, locateWithFallback, stepLabel } from './location';

export function call112() { void Linking.openURL('tel:112'); }

/** One tap: find the best available location, save an SOS on the device, and start delivery. */
export function QuickSos({ role, language, onCreated }: { role: Role; language: Language; onCreated: (report: Report) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function sos() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); Vibration.vibrate(80);
    try {
      const fix = await locateWithFallback(next => setStep(stepLabel(next, language)), true);
      setStep(word(language, 'Saving SOS on this phone...', 'SOS ഫോണിൽ സേവ് ചെയ്യുന്നു...'));
      const report = await service.createReport(role, {
        incident_type: 'other', affected_count: 1,
        description: 'ONE-TAP SOS: person needs urgent help. Details not yet provided; try calling back or send a responder.',
        location: fix
          ? { label: `One-tap SOS · ${describeFix(fix, 'en')}`, latitude: fix.latitude, longitude: fix.longitude }
          : { label: 'One-tap SOS · location unknown (no GPS, network or saved fix)', latitude: null, longitude: null },
        // The button asks "In danger right now?": treat it as a reported immediate life threat until an official verifies it.
        details: { people: { trapped: 0, injured: 0, children: 0, elderly: 0, disabled: 0 }, life_threat: true, assistance: ['rescue'] },
      });
      Vibration.vibrate([0, 200, 100, 200]);
      await onCreated(report);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save SOS.'); }
    finally { lock.current = false; setBusy(false); setStep(''); }
  }
  return <View style={{ gap: 10 }}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={word(language, 'One-tap SOS', 'ഒറ്റ ടാപ്പ് SOS')} disabled={busy} onPress={() => void sos()}
        style={({ pressed }) => ({ flex: 2, minHeight: 92, borderRadius: 20, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.8 : 1, borderWidth: 4, borderColor: '#FFC9CC' })}>
        {busy ? <ActivityIndicator color="#FFFFFF" size="large" /> : <Text style={{ color: '#FFFFFF', fontSize: 30, fontWeight: '900', letterSpacing: 2 }}>SOS</Text>}
        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>{word(language, 'ONE TAP · SENDS LOCATION', 'ഒറ്റ ടാപ്പ് · സ്ഥലം അയയ്ക്കും')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={word(language, 'Call 112 emergency', '112 വിളിക്കുക')} onPress={call112}
        style={({ pressed }) => ({ flex: 1, minHeight: 92, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 2, opacity: pressed ? 0.7 : 1, borderWidth: 2, borderColor: colors.red })}>
        <Icon name="call" color={colors.red} size={26} />
        <Text style={{ color: colors.red, fontSize: 22, fontWeight: '900' }}>112</Text>
        <Text style={{ color: colors.red, fontSize: 10, fontWeight: '800', textAlign: 'center' }}>{word(language, 'WORKS WITHOUT SIM', 'SIM ഇല്ലാതെയും')}</Text>
      </Pressable>
    </View>
    {step ? <Text accessibilityLiveRegion="polite" style={{ color: '#FFFFFF', fontSize: 13 }}>{step}</Text> : null}
    {error ? <Text style={{ color: '#FFD2D5', fontSize: 13 }}>{localizeMessage(language, error)}</Text> : null}
  </View>;
}

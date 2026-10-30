import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, ui } from './theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, color = colors.teal, size = 22 }: { name: IconName; color?: string; size?: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function Button({ title, onPress, tone = 'primary', icon, disabled, loading, style }: {
  title: string; onPress: () => void; tone?: 'primary' | 'secondary' | 'danger' | 'quiet'; icon?: IconName;
  disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const bg = tone === 'primary' ? colors.teal : tone === 'danger' ? colors.red : tone === 'secondary' ? colors.tealLight : 'transparent';
  const fg = tone === 'primary' || tone === 'danger' ? '#FFFFFF' : colors.teal;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || loading, busy: loading }}
    disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [{ minHeight: 50, borderRadius: 13, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', gap: 9, opacity: disabled || loading ? 0.45 : pressed ? 0.75 : 1 }, style]}>
    {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} color={fg} size={20} /> : null}
    <Text style={{ color: fg, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
  </Pressable>;
}
export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: IconName }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!active }} accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [{ paddingHorizontal: 13, paddingVertical: 11, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: active ? colors.teal : colors.line, backgroundColor: active ? colors.tealLight : colors.paper, flexDirection: 'row', alignItems: 'center', gap: 7, opacity: pressed ? 0.7 : 1 }]}>
    {icon ? <Icon name={icon} size={19} color={active ? colors.teal : colors.muted} /> : null}
    <Text style={{ color: active ? colors.teal : colors.navy, fontWeight: active ? '700' : '500', fontSize: 14 }}>{label}</Text>
  </Pressable>;
}
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const styles = { neutral: [colors.blueLight, colors.navy], success: [colors.greenLight, colors.greenDark], warning: [colors.amberLight, colors.amber], danger: [colors.redLight, colors.red] }[tone];
  return <View style={{ borderRadius: 7, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: styles[0], alignSelf: 'flex-start' }}><Text style={{ fontSize: 11, fontWeight: '800', color: styles[1], letterSpacing: 0.2 }}>{label}</Text></View>;
}
export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return <View><Text style={ui.label}>{label}</Text><TextInput placeholderTextColor="#657D83" accessibilityLabel={label} {...props} style={[ui.input, props.multiline && ui.multiline, props.style]} />{hint ? <Text style={[ui.small, { marginTop: 5 }]}>{hint}</Text> : null}</View>;
}
export function Notice({ title, text, tone = 'info', children }: { title?: string; text: string; tone?: 'info' | 'warning' | 'error'; children?: React.ReactNode }) {
  const fg = tone === 'error' ? colors.red : tone === 'warning' ? colors.amber : colors.teal;
  const bg = tone === 'error' ? colors.redLight : tone === 'warning' ? colors.amberLight : colors.tealLight;
  return <View accessibilityRole="summary" style={{ padding: 15, borderRadius: 14, backgroundColor: bg, gap: 5 }}><View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}><Icon name={tone === 'error' ? 'alert-circle-outline' : tone === 'warning' ? 'time-outline' : 'information-circle-outline'} color={fg} size={20} /><View style={{ flex: 1 }}>{title ? <Text style={{ color: fg, fontSize: 14, fontWeight: '800', marginBottom: 3 }}>{title}</Text> : null}<Text style={{ color: fg, fontSize: 13, lineHeight: 20 }}>{text}</Text></View></View>{children}</View>;
}
export function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return <View style={{ gap: 5 }}><Text style={ui.h2}>{title}</Text>{caption ? <Text style={ui.subtitle}>{caption}</Text> : null}</View>;
}
export function Empty({ title, text, icon = 'file-tray-outline' }: { title: string; text: string; icon?: IconName }) {
  return <View style={[ui.card, { paddingVertical: 30, alignItems: 'center' }]}><View style={{ padding: 16, backgroundColor: colors.tealLight, borderRadius: 24 }}><Icon name={icon} size={28} /></View><Text style={ui.h3}>{title}</Text><Text style={[ui.subtitle, { textAlign: 'center' }]}>{text}</Text></View>;
}

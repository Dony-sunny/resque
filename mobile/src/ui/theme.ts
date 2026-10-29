import { StyleSheet } from 'react-native';

export const colors = {
  canvas: '#F5F7F5', paper: '#FFFFFF', navy: '#102E38', muted: '#536B72',
  line: '#DCE5E2', teal: '#08796D', tealLight: '#E4F3EE', red: '#B52B3A',
  redLight: '#FFF0F0', amber: '#805119', amberLight: '#FFF2DB', blueLight: '#EAF1FA',
};

export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20, paddingBottom: 30, gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  card: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, padding: 18, borderRadius: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7, color: colors.navy },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  h2: { color: colors.navy, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  h3: { color: colors.navy, fontSize: 17, fontWeight: '700' },
  text: { color: colors.navy, fontSize: 16, lineHeight: 24 },
  small: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  eyebrow: { color: colors.teal, fontSize: 11, letterSpacing: 1.8, fontWeight: '800' },
  label: { color: colors.navy, fontSize: 14, fontWeight: '700', marginBottom: 7 },
  input: { backgroundColor: '#FBFCFB', color: colors.navy, borderColor: '#B9CBC6', borderWidth: 1, borderRadius: 12, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  multiline: { minHeight: 104, textAlignVertical: 'top' },
  divider: { height: 1, backgroundColor: colors.line },
});

import { StyleSheet } from 'react-native';

/** RESQ design system: navy chrome, primary blue actions, red critical, orange high, green success. */
export const colors = {
  canvas: '#F3F6FA', paper: '#FFFFFF', navy: '#09182B', navySoft: '#1C2E45', muted: '#4D5B6E',
  line: '#DCE3EC', teal: '#147DDB', tealLight: '#E6F1FC', red: '#DC3545',
  redLight: '#FDECEE', amber: '#8A5300', amberLight: '#FEF3DC', orange: '#F59E0B', blueLight: '#EDF2F8',
  green: '#16A34A', greenDark: '#0F7A37', greenLight: '#E7F6EC',
};

export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, paddingBottom: 30, gap: 14, width: '100%', maxWidth: 760, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  card: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, padding: 16, borderRadius: 16, gap: 10 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: colors.navy },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  h2: { color: colors.navy, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  h3: { color: colors.navy, fontSize: 17, fontWeight: '700' },
  text: { color: colors.navy, fontSize: 16, lineHeight: 24 },
  small: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  eyebrow: { color: colors.teal, fontSize: 11, letterSpacing: 1.6, fontWeight: '800' },
  label: { color: colors.navy, fontSize: 14, fontWeight: '700', marginBottom: 7 },
  input: { backgroundColor: '#FBFCFE', color: colors.navy, borderColor: '#B8C4D4', borderWidth: 1, borderRadius: 12, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  multiline: { minHeight: 104, textAlignVertical: 'top' },
  divider: { height: 1, backgroundColor: colors.line },
});

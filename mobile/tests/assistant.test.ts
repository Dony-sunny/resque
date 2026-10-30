import { describe, expect, it } from 'vitest';
import { actionsFor, intentOf, localAnswer } from '../src/core/assistant';
import type { Report } from '../src/core/types';

const mine = { id: 'abcdef12-0000-4000-8000-000000000001', incident_type: 'flood', location: { label: 'Kumarakom jetty', latitude: null, longitude: null }, delivery_state: 'pending', mission_status: 'unassigned', source: 'own', relief: [] } as unknown as Report;
const other = { ...mine, id: 'ffffffff-0000-4000-8000-000000000009', source: 'seed', location: { label: 'Someone else', latitude: null, longitude: null } } as unknown as Report;

describe('offline safety guide', () => {
  it('sends urgent messages straight to SOS and 112', () => {
    const reply = localAnswer('I am trapped and water is rising', 'citizen', []);
    expect(reply.mode).toBe('offline');
    expect(reply.answer).toContain('112');
    expect(reply.actions).toEqual([{ label: 'Send SOS now', route: 'create' }, { label: 'Call 112', call: '112' }]);
  });

  it('answers status only from this phone’s own reports', () => {
    const reply = localAnswer('Track my SOS', 'citizen', [mine, other]);
    expect(reply.answer).toContain('#abcdef12');
    expect(reply.answer).toContain('saved on this phone');
    expect(reply.answer).not.toContain('Someone else');
    expect(reply.answer).toContain('does not estimate arrival');
  });

  it('gives curated hazard guidance and admits what it cannot know offline', () => {
    expect(localAnswer('Flood safety', 'citizen', []).answer).toContain('moving water');
    expect(localAnswer('Find shelter', 'citizen', []).answer).toContain('cannot tell you which camp has room');
    expect(localAnswer('what is the weather on mars', 'citizen', []).answer).toContain('Offline I can help with');
  });

  it('only offers navigation or dialling, never record changes, and staff get no victim shortcuts', () => {
    for (const q of ['Report emergency', 'Track my SOS', 'Find shelter', 'Emergency contacts', 'Flood safety', 'help me']) {
      for (const a of actionsFor(intentOf(q), 'citizen')) expect(Object.keys(a).every(k => ['label', 'route', 'call'].includes(k))).toBe(true);
    }
    expect(actionsFor('report', 'coordinator')).toEqual([]);
    expect(actionsFor('urgent', 'relief')).toEqual([{ label: 'Call 112', call: '112' }]);
  });
});

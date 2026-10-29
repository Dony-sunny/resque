import { describe, expect, it } from 'vitest';
import { connectWorkspace, emptyWorkspaceIndex, resolveWorkspace } from '../src/core/workspace';

const local = 'http://127.0.0.1:8000', lan = 'http://192.168.1.20:8000';
const firstId = '40000000-0000-4000-8000-000000000001', secondId = '40000000-0000-4000-8000-000000000002';
describe('persistent backend identity and transport aliases', () => {
  it('keeps a never-confirmed offline workspace when the first real API address is entered', () => {
    const result = connectWorkspace(emptyWorkspaceIndex(), local, lan, firstId, false);
    expect(result.key).toBe(local);
    expect(result.carriedLocalReports).toBe(true);
    expect(resolveWorkspace(result.index, lan)).toBe(local);
    expect(result.index.bindings[local]).toBe(firstId);
  });
  it('retains the same workspace and pending queue when a tunnel URL identifies the same backend', () => {
    const first = connectWorkspace(emptyWorkspaceIndex(), local, lan, firstId, false);
    const tunnel = 'https://demo.example.org';
    const alias = connectWorkspace(first.index, lan, tunnel, firstId, true);
    expect(alias.key).toBe(local);
    expect(resolveWorkspace(alias.index, lan)).toBe(local);
    expect(resolveWorkspace(alias.index, tunnel)).toBe(local);
  });
  it('isolates a different authority and restores the old one without overwriting its binding', () => {
    const first = connectWorkspace(emptyWorkspaceIndex(), local, lan, firstId, false);
    const another = connectWorkspace(first.index, lan, 'https://another.example.org', secondId, true);
    expect(another.key).not.toBe(local);
    expect(resolveWorkspace(another.index, lan)).toBe(local);
    expect(another.index.bindings[local]).toBe(firstId);
    const restored = connectWorkspace(another.index, 'https://another.example.org', lan, firstId, true);
    expect(restored.key).toBe(local);
  });
  it('does not attach old legacy confirmed reports to an unverified backend identity', () => {
    const result = connectWorkspace(emptyWorkspaceIndex(), local, lan, firstId, true);
    expect(result.key).not.toBe(local);
    expect(resolveWorkspace(result.index, local)).toBe(local);
  });
  it('rejects malformed health identity before selecting a destination', () => {
    expect(() => connectWorkspace(emptyWorkspaceIndex(), local, lan, 'not-a-backend-id', false)).toThrow('persistent identity');
  });
});

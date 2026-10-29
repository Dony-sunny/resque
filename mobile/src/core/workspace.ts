/** Durable authority binding. URL aliases are transports, not separate incident owners. */
export interface WorkspaceIndex {
  urls: Record<string, string>;
  identities: Record<string, string>;
  bindings: Record<string, string>;
}
export const emptyWorkspaceIndex = (): WorkspaceIndex => ({ urls: {}, identities: {}, bindings: {} });
export const resolveWorkspace = (index: WorkspaceIndex, url: string): string => index.urls[url] || url;
export function connectWorkspace(index: WorkspaceIndex, currentUrl: string, nextUrl: string, backendId: string, currentHasConfirmedData: boolean): { index: WorkspaceIndex; key: string; carriedLocalReports: boolean } {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(backendId)) throw new Error('Backend did not provide a valid persistent identity. Update the backend before connecting.');
  const currentKey = resolveWorkspace(index, currentUrl);
  const currentId = index.bindings[currentKey];
  const knownKey = index.identities[backendId];
  // A never-confirmed offline workspace follows its first real backend. Once bound,
  // cross-authority moves select another workspace and preserve the previous data.
  const canCarry = !currentId && !currentHasConfirmedData;
  const key = knownKey || (currentId === backendId || canCarry ? currentKey : `backend:${backendId}`);
  return {
    key,
    carriedLocalReports: key === currentKey && canCarry && currentUrl !== nextUrl,
    index: {
      urls: { ...index.urls, ...(canCarry ? { [currentUrl]: key } : {}), [nextUrl]: key },
      identities: { ...index.identities, [backendId]: key },
      bindings: { ...index.bindings, [key]: backendId },
    },
  };
}

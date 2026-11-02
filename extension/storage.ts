import { normalizePreferences, type Preferences } from '../shared/model';

type ExtensionApi = {
  storage: { local: { get: (key: string) => Promise<Record<string, unknown>>; set: (value: Record<string, unknown>) => Promise<void> }; onChanged: { addListener: (callback: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => void } };
};
export const KEY = 'pureddit.preferences.v1';
export function extensionApi() {
  const scope = globalThis as typeof globalThis & { browser?: ExtensionApi; chrome?: ExtensionApi };
  return scope.browser || scope.chrome;
}
export async function loadPreferences() {
  const api = extensionApi(); if (!api) throw new Error('Extension storage is unavailable.');
  const values = await api.storage.local.get(KEY); return normalizePreferences(values[KEY]);
}
export async function savePreferences(value: Preferences) {
  const api = extensionApi(); if (!api) throw new Error('Extension storage is unavailable.');
  await api.storage.local.set({ [KEY]: normalizePreferences(value) });
}

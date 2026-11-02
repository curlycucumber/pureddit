import { useEffect, useState } from 'react';

export type Profile = { id: string; name: string; karma: number; created: number };
export async function api<T>(resource: string, parameters: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  return request<T>(`/api/reddit?${new URLSearchParams({ resource, ...parameters })}`, { signal });
}
export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  let data;
  try { data = await response.json(); } catch { throw new Error('The account service is unavailable. Please try again.'); }
  if (!response.ok) throw new Error(data.error || 'Reddit could not complete this request.');
  return data as T;
}
export function action<T = { success: boolean }>(input: Record<string, unknown>) {
  return request<T>('/api/reddit', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pureddit-Request': '1' }, body: JSON.stringify(input) });
}
const authMessages: Record<string, string> = {
  not_configured: 'Reddit sign-in is not configured yet. The site owner needs to add the Reddit app credentials in Vercel.',
  invalid_state: 'This sign-in link has expired or could not be verified. Please start again.',
  denied: 'You cancelled Reddit authorization. Your account has not been connected.',
  authorization_failed: 'Reddit could not authorize this account. Check the app configuration or try again.',
};
export function useReddit() {
  const [user, setUser] = useState<Profile | null>(null);
  const [configured, setConfigured] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(() => authMessages[new URLSearchParams(location.search).get('auth_error') || ''] || '');
  useEffect(() => {
    if (new URLSearchParams(location.search).has('auth_error')) history.replaceState(null, '', location.pathname + location.hash);
    const controller = new AbortController();
    request<{ configured: boolean; authenticated: boolean; user?: Profile; error?: string }>('/api/auth/session', { signal: controller.signal })
      .then(data => { setConfigured(data.configured); if (data.error) setError(data.error); setUser(data.authenticated && data.user ? data.user : null); })
      .catch(error => { if (error.name !== 'AbortError') setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, []);
  async function logout() {
    const result = await request<{ revoked: boolean }>('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pureddit-Request': '1' }, body: '{}' });
    setUser(null);
    return result.revoked;
  }
  return { user, configured, checking, error, setError, logout };
}

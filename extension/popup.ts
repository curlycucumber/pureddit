import { loadPreferences, savePreferences } from './storage';
const enabled = document.querySelector<HTMLInputElement>('#enabled')!;
const status = document.querySelector<HTMLElement>('#status')!;
enabled.disabled = true;
loadPreferences().then(value => { enabled.checked = value.enabled; enabled.disabled = false; document.documentElement.dataset.theme = value.colorScheme; }).catch(() => { status.textContent = 'Browser storage is unavailable. Please reopen this popup.'; });
enabled.addEventListener('change', async () => {
  enabled.disabled = true;
  try { const value = await loadPreferences(); await savePreferences({ ...value, enabled: enabled.checked }); status.textContent = enabled.checked ? 'Reading view enabled on Reddit feed pages.' : 'Reddit’s original view restored.'; }
  catch { enabled.checked = !enabled.checked; status.textContent = 'The change could not be saved.'; }
  finally { enabled.disabled = false; }
});
document.querySelector('#clear')!.addEventListener('click', async () => {
  try { const value = await loadPreferences(); await savePreferences({ ...value, pins: [], recent: [] }); status.textContent = 'Local shortcuts and recent communities cleared. Reddit subscriptions are unchanged.'; }
  catch { status.textContent = 'Preferences could not be cleared.'; }
});

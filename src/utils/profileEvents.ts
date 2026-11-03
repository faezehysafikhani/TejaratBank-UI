/** Fired (by the header's avatar menu) to bring the profile page to the front, optionally on one tab. */
export const OPEN_PROFILE_EVENT = 'nexuscore:open-profile';

/** Fired (by the header's book button) to bring a main tab of the settings page to the front. */
export const OPEN_SETTINGS_TAB_EVENT = 'nexuscore:open-settings-tab';
let pendingSettingsTab: string | null = null;
/** The settings page may not be mounted yet when the button is pressed: it reads this when it opens. */
export const requestSettingsTab = (tab: string) => {
  pendingSettingsTab = tab;
  window.setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_TAB_EVENT, { detail: { tab } })), 0);
};
export const takePendingSettingsTab = (): string | null => {
  const tab = pendingSettingsTab;
  pendingSettingsTab = null;
  return tab;
};

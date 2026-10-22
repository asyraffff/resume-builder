/** Everything this app stores in the browser uses this prefix, so "delete all my data" can find it all. */
export const STORAGE_PREFIX = "resume-tailor";

/** Bump when the data-handling notice changes materially, so people see and accept the new version. */
export const CONSENT_VERSION = 1;
const CONSENT_KEY = `${STORAGE_PREFIX}-consent`;

export function hasConsent(): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null");
    return v?.version === CONSENT_VERSION;
  } catch {
    return false;
  }
}

export function giveConsent() {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: CONSENT_VERSION, at: new Date().toISOString() }));
  } catch {
    /* storage unavailable: the notice will simply show again next time */
  }
}

/** Removes every key this app stored in this browser. Returns how many were removed. */
export function deleteAllLocalData(): number {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_PREFIX));
    keys.forEach((k) => localStorage.removeItem(k));
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(STORAGE_PREFIX))
      .forEach((k) => sessionStorage.removeItem(k));
    return keys.length;
  } catch {
    return 0;
  }
}

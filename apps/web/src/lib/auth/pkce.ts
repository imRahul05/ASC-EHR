let memoryVerifier: string | undefined;

const STORAGE_KEY = "asc_pkce_code_verifier";

export function setPendingCodeVerifier(verifier: string | undefined): void {
  memoryVerifier = verifier;
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      if (verifier === undefined) {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } else {
        window.sessionStorage.setItem(STORAGE_KEY, verifier);
      }
    } catch {
      // Storage unavailable or disabled
    }
  }
}

export function getPendingCodeVerifier(): string {
  if (memoryVerifier !== undefined && memoryVerifier.length > 0) {
    return memoryVerifier;
  }
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  }
  return "";
}

export function clearPendingCodeVerifier(): void {
  memoryVerifier = undefined;
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable or disabled
    }
  }
}

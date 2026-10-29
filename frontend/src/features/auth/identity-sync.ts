const channelName = "assets-creation:identity";
export const identityStorageKey = "assets-creation:identity-change";

/** Share only an invalidation signal. Each tab confirms the owner with Java. */
export function connectIdentitySync(changed: () => void) {
  try {
    if (typeof window.BroadcastChannel === "function") {
      const channel = new window.BroadcastChannel(channelName);
      channel.onmessage = event => { if (event.data === "changed") changed(); };
      return { publish: () => { try { channel.postMessage("changed"); } catch { /* Local auth still completes. */ } }, dispose: () => channel.close() };
    }
  } catch { /* Storage events also work when BroadcastChannel is unavailable. */ }
  const receive = (event: StorageEvent) => {
    if (event.key === identityStorageKey && event.newValue) changed();
  };
  window.addEventListener("storage", receive);
  return {
    publish: () => {
      try { window.localStorage.setItem(identityStorageKey, crypto.randomUUID()); }
      catch { /* A browser that disables both transports can still restore on reload. */ }
    },
    dispose: () => window.removeEventListener("storage", receive),
  };
}

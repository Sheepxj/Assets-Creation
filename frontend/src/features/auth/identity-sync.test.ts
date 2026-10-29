import { afterEach, expect, it, vi } from "vitest";
import { connectIdentitySync, identityStorageKey } from "./identity-sync";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("sends only invalidation signals between channels and closes the subscription", () => {
  const channels: FakeChannel[] = [];
  class FakeChannel {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    closed = false;
    constructor(readonly name: string) { channels.push(this); }
    postMessage(data: unknown) { channels.filter(channel => channel !== this && !channel.closed && channel.name === this.name).forEach(channel => channel.onmessage?.({ data })); }
    close() { this.closed = true; }
  }
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  const firstChanged = vi.fn(), secondChanged = vi.fn();
  const first = connectIdentitySync(firstChanged), second = connectIdentitySync(secondChanged);
  const sent = vi.spyOn(channels[0], "postMessage");
  try {
    first.publish(); expect(secondChanged).toHaveBeenCalledOnce(); expect(firstChanged).not.toHaveBeenCalled();
    expect(sent).toHaveBeenCalledWith("changed");
    second.dispose(); first.publish(); expect(secondChanged).toHaveBeenCalledOnce();
  } finally { first.dispose(); second.dispose(); }
});

it("falls back to storage events without storing identity or credentials and disposes the listener", () => {
  vi.stubGlobal("BroadcastChannel", undefined);
  const changed = vi.fn(), write = vi.spyOn(Storage.prototype, "setItem");
  const sync = connectIdentitySync(changed);
  try {
    sync.publish(); expect(write).toHaveBeenCalledWith(identityStorageKey, expect.any(String));
    expect(write.mock.calls[0][1]).toMatch(/^[0-9a-f-]{36}$/);
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", newValue: "value" }));
    expect(changed).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent("storage", { key: identityStorageKey, newValue: "signal" }));
    expect(changed).toHaveBeenCalledOnce();
    sync.dispose(); window.dispatchEvent(new StorageEvent("storage", { key: identityStorageKey, newValue: "later" }));
    expect(changed).toHaveBeenCalledOnce();
  } finally { sync.dispose(); }
});

it("does not break local auth when browser storage and channels are disabled", () => {
  vi.stubGlobal("BroadcastChannel", class { constructor() { throw new Error("disabled"); } });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("disabled"); });
  const sync = connectIdentitySync(vi.fn());
  try { expect(() => sync.publish()).not.toThrow(); } finally { sync.dispose(); }
});

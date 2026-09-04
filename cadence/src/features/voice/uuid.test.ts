// The id is chosen on the device and reused across retries, so it has to be a real
// v4 every time and unique every time — whichever generator the runtime offers.

import { isUuidV4, uuidv4 } from './uuid';

type MutableGlobal = {
  crypto?: unknown;
  expo?: { uuidv4?: () => string };
};

const g = globalThis as unknown as MutableGlobal;

function withoutCrypto<T>(run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try {
    return run();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else delete g.crypto;
  }
}

describe('uuidv4', () => {
  // expo-modules-core installs a real `globalThis.expo`, and jest-expo's own teardown
  // reads `globalThis.expo.EventEmitter`. Deleting the object outright takes the whole
  // suite down with "Cannot read properties of undefined (reading 'EventEmitter')".
  //
  // This was invisible until expo-modules-core was hoisted to a top-level dependency:
  // while it resolved only from expo/node_modules, jest-expo could not load it, no
  // `globalThis.expo` existed, and deleting nothing was harmless. Save and restore
  // instead, so the stub these tests install is removed without taking the real one.
  const realExpo = Object.getOwnPropertyDescriptor(globalThis, 'expo');

  afterEach(() => {
    if (realExpo) Object.defineProperty(globalThis, 'expo', realExpo);
    else delete g.expo;
  });

  it('produces a well-formed v4 from whatever the runtime provides', () => {
    expect(isUuidV4(uuidv4())).toBe(true);
  });

  it('never repeats', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(uuidv4());
    expect(seen.size).toBe(2000);
  });

  it('uses the native expo generator when crypto.randomUUID is absent', () => {
    withoutCrypto(() => {
      g.expo = { uuidv4: () => '1b4e28ba-2fa1-4d3b-8f0a-1f2e3d4c5b6a' };
      expect(uuidv4()).toBe('1b4e28ba-2fa1-4d3b-8f0a-1f2e3d4c5b6a');
    });
  });

  it('falls back to a pure implementation with the right version and variant bits', () => {
    withoutCrypto(() => {
      const id = uuidv4();
      expect(isUuidV4(id)).toBe(true);
      expect(id[14]).toBe('4');
      expect('89ab').toContain(id[19]);
    });
  });

  it('ignores a native generator that returns garbage', () => {
    withoutCrypto(() => {
      g.expo = { uuidv4: () => 'not-a-uuid' };
      expect(isUuidV4(uuidv4())).toBe(true);
    });
  });
});

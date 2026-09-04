// A v4 UUID without a dependency. P06.
//
// The recording's id is chosen on the device before anything touches the network,
// because the Storage object name needs it before the row can exist, and because the
// same id has to survive a retry: an upload whose response was lost must land on the
// same object and the same row, not create a second copy. So it cannot be the
// database's gen_random_uuid().
//
// expo-crypto is not installed and adding packages is off the table (see
// cadence/AGENTS.md), so this leans on what the runtime already provides:
//
//   1. crypto.randomUUID  — present on web and on newer Hermes builds.
//   2. globalThis.expo.uuidv4 — the native generator expo-modules-core installs in
//      every Expo app, Expo Go included. It is what expo-modules-core's own `uuid`
//      export calls.
//   3. Math.random — last resort. Not cryptographic, but these ids only need to be
//      unique, not unguessable: the Storage policy is keyed on the user id folder,
//      not on secrecy of the file name.

type RuntimeWithUuid = {
  crypto?: { randomUUID?: () => string };
  expo?: { uuidv4?: () => string };
};

const V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uuidv4(): string {
  const g = globalThis as unknown as RuntimeWithUuid;

  try {
    const native = g.crypto?.randomUUID?.();
    if (native && isUuidV4(native)) return native.toLowerCase();
  } catch {
    // fall through
  }

  try {
    const expo = g.expo?.uuidv4?.();
    if (expo && isUuidV4(expo)) return expo.toLowerCase();
  } catch {
    // fall through
  }

  return fallbackV4();
}

export function isUuidV4(value: string): boolean {
  return V4_PATTERN.test(value);
}

function fallbackV4(): string {
  const bytes = new Array<number>(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

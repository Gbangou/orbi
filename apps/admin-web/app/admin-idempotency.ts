export function createAdminIdempotencyKey(prefix: string) {
  const normalizedPrefix = prefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  const entropy =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  const key = `${normalizedPrefix || 'admin'}-${entropy}`;

  return key.slice(0, 128);
}

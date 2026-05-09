const localDocumentHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function resolveSafeDocumentUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol === 'https:') {
      return url.toString();
    }

    if (url.protocol === 'http:' && localDocumentHosts.has(url.hostname)) {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

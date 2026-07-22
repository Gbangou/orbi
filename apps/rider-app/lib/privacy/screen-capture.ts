export function preventSensitiveScreenCapture() {
  // Field testing and support need screenshots on real devices.
  // Keep this hook as a no-op so sensitive screens can opt back in later
  // through a single policy point instead of scattered native calls.
}

export function restoreSensitiveScreenCapture() {
  // Screenshots are allowed by default.
}

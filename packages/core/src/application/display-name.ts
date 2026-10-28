/** Display-only privacy guard, shared by both persona styles. Never fall back to an identity. */
export function displayName(name: string): string {
  if (!name.trim() || /@|\+?\d(?:[\s().-]?\d){6,}|[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u.test(name)) return 'integrante AERO';
  return name;
}

export type ReadingHeading = { id: string; label: string; level: 2 | 3 };
export type HeadingPosition = { id: string; top: number };

export function slugifyReadingHeading(value: string, fallbackIndex: number) {
  const slug = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || `section-${fallbackIndex + 1}`;
}

export function uniqueReadingHeadingId(base: string, used: Set<string>) {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function calculateReadingProgress(scrollY: number, start: number, end: number) {
  if (end <= start) return scrollY >= end ? 100 : 0;
  return Math.min(100, Math.max(0, ((scrollY - start) / (end - start)) * 100));
}

export function findActiveReadingHeading(positions: HeadingPosition[], scrollY: number, offset = 160) {
  if (!positions.length) return "";
  let active = positions[0].id;
  for (const heading of positions) {
    if (heading.top > scrollY + offset) break;
    active = heading.id;
  }
  return active;
}

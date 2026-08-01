export type ReadingHeading = { id: string; label: string; level: 2 | 3 };
export type HeadingPosition = { id: string; top: number };

type ReadingFrameSchedulerOptions = {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
  collectLayout: () => void;
  updateState: () => void;
};

type PostLayoutActionSchedulerOptions = {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
};

export function createPostLayoutActionScheduler({ requestFrame, cancelFrame }: PostLayoutActionSchedulerOptions) {
  let frame = 0;
  let generation = 0;

  function schedule(action: () => void) {
    generation += 1;
    const scheduledGeneration = generation;
    if (frame) cancelFrame(frame);
    frame = requestFrame(() => {
      if (scheduledGeneration !== generation) return;
      frame = 0;
      action();
    });
  }

  function dispose() {
    generation += 1;
    if (frame) cancelFrame(frame);
    frame = 0;
  }

  return { schedule, dispose };
}

export function scheduleReadingHeadingNavigation(
  collapseToc: () => void,
  scheduler: { schedule: (action: () => void) => void },
  navigate: () => void,
) {
  collapseToc();
  scheduler.schedule(navigate);
}

export function readingScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}

export function createReadingFrameScheduler({
  requestFrame,
  cancelFrame,
  collectLayout,
  updateState,
}: ReadingFrameSchedulerOptions) {
  let frame = 0;
  let layoutChanged = false;

  function schedule(remeasureLayout = false) {
    layoutChanged ||= remeasureLayout;
    if (frame) cancelFrame(frame);
    frame = requestFrame(() => {
      frame = 0;
      if (layoutChanged) {
        layoutChanged = false;
        collectLayout();
      }
      updateState();
    });
  }

  function dispose() {
    if (frame) cancelFrame(frame);
    frame = 0;
    layoutChanged = false;
  }

  return { schedule, dispose };
}

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

export function calculateReadingEnd(start: number, contentHeight: number, viewportHeight: number) {
  return start + contentHeight - viewportHeight;
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

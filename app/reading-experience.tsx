"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  calculateReadingEnd,
  calculateReadingProgress,
  createPostLayoutActionScheduler,
  createReadingFrameScheduler,
  findActiveReadingHeading,
  readingScrollBehavior,
  scheduleReadingHeadingNavigation,
  slugifyReadingHeading,
  uniqueReadingHeadingId,
  type HeadingPosition,
  type ReadingHeading,
} from "@/lib/reading-experience";

type Props = { articleRef: RefObject<HTMLElement | null>; active: boolean; articleKey: string };

export function ReadingExperience({ articleRef, active, articleKey }: Props) {
  const [headings, setHeadings] = useState<ReadingHeading[]>([]);
  const [activeId, setActiveId] = useState("");
  const [progress, setProgress] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const positionsRef = useRef<HeadingPosition[]>([]);
  const activeIdRef = useRef("");
  const [headingNavigationScheduler] = useState(() => createPostLayoutActionScheduler({
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (frame) => window.cancelAnimationFrame(frame),
  }));

  useEffect(() => {
    return () => headingNavigationScheduler.dispose();
  }, [headingNavigationScheduler]);

  useEffect(() => {
    if (!active) return;
    const article = articleRef.current;
    if (!article) return;
    const articleElement: HTMLElement = article;

    function collectHeadings() {
      const used = new Set<string>();
      const elements = Array.from(articleElement.querySelectorAll<HTMLHeadingElement>(".prose h2, .prose h3"));
      const outline = elements.flatMap<ReadingHeading>((heading, index) => {
        const label = heading.textContent?.trim();
        if (!label) return [];
        const preferred = heading.id || slugifyReadingHeading(label, index);
        const id = uniqueReadingHeadingId(preferred, used);
        heading.id = id;
        return [{ id, label, level: heading.tagName === "H3" ? 3 : 2 }];
      });
      positionsRef.current = elements
        .filter((heading) => heading.id)
        .map((heading) => ({ id: heading.id, top: window.scrollY + heading.getBoundingClientRect().top }))
        .sort((left, right) => left.top - right.top);
      setHeadings(outline);
    }

    function updateReadingState() {
      const rect = articleElement.getBoundingClientRect();
      const start = window.scrollY + rect.top;
      const end = calculateReadingEnd(start, articleElement.scrollHeight, window.innerHeight);
      const nextProgress = calculateReadingProgress(window.scrollY, start, end);
      const nextActiveId = findActiveReadingHeading(positionsRef.current, window.scrollY);
      setProgress(nextProgress);
      setShowBackToTop(nextProgress > 12);
      if (nextProgress <= 1) {
        activeIdRef.current = "";
        setActiveId("");
        if (window.location.hash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        return;
      }
      if (nextActiveId && nextActiveId !== activeIdRef.current) {
        activeIdRef.current = nextActiveId;
        setActiveId(nextActiveId);
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${encodeURIComponent(nextActiveId)}`);
      }
    }

    const scheduler = createReadingFrameScheduler({
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (frame) => window.cancelAnimationFrame(frame),
      collectLayout: collectHeadings,
      updateState: updateReadingState,
    });
    const scheduleScrollUpdate = () => scheduler.schedule();
    const scheduleLayoutUpdate = () => scheduler.schedule(true);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleLayoutUpdate);

    scheduler.schedule(true);
    resizeObserver?.observe(articleElement);
    window.addEventListener("scroll", scheduleScrollUpdate, { passive: true });
    window.addEventListener("resize", scheduleLayoutUpdate);
    window.addEventListener("orientationchange", scheduleLayoutUpdate);
    return () => {
      scheduler.dispose();
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", scheduleScrollUpdate);
      window.removeEventListener("resize", scheduleLayoutUpdate);
      window.removeEventListener("orientationchange", scheduleLayoutUpdate);
    };
  }, [active, articleKey, articleRef]);

  if (!active) return null;

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function goToHeading(id: string) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${encodeURIComponent(id)}`);
    activeIdRef.current = id;
    setActiveId(id);
    scheduleReadingHeadingNavigation(
      () => setTocOpen(false),
      headingNavigationScheduler,
      () => {
        const heading = articleRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
        if (!heading) return;
        heading.scrollIntoView({ behavior: readingScrollBehavior(prefersReducedMotion()), block: "start" });
      },
    );
  }

  function backToTop() {
    const top = Math.max(0, (articleRef.current?.offsetTop ?? 0) - 72);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  return (
    <>
      <div className="reading-progress" role="progressbar" aria-label="文章阅读进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <span style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
      <aside className={tocOpen ? "reading-toc open" : "reading-toc"}>
        <button
          type="button"
          className="reading-toc-toggle"
          aria-expanded={tocOpen}
          aria-controls="reading-toc-links"
          onClick={() => setTocOpen((current) => !current)}
        >
          <span>本文目录</span><span aria-hidden="true">{tocOpen ? "−" : "+"}</span>
        </button>
        <nav id="reading-toc-links" aria-label="文章目录">
          <b>本文目录</b>
          {headings.length ? headings.map((heading, index) => (
            <button
              type="button"
              key={heading.id}
              className={heading.level === 3 ? "toc-level-3" : undefined}
              aria-current={heading.id === activeId ? "location" : undefined}
              onClick={() => goToHeading(heading.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>{heading.label}
            </button>
          )) : <span className="reading-toc-empty">正文暂无章节标题</span>}
        </nav>
      </aside>
      <button
        type="button"
        className={showBackToTop ? "back-to-top visible" : "back-to-top"}
        onClick={backToTop}
        aria-label="返回文章顶部"
        tabIndex={showBackToTop ? 0 : -1}
      ><span aria-hidden="true">↑</span></button>
    </>
  );
}

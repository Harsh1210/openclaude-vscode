import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAutoScrollOptions {
  /** Threshold in pixels from bottom to consider "at bottom" */
  threshold?: number;
}

export function useAutoScroll(options: UseAutoScrollOptions = {}) {
  const { threshold = 50 } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // Check if the container is scrolled to the bottom
  const checkIsAtBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, [threshold]);

  // Handle scroll events to detect manual scroll-up
  const handleScroll = useCallback(() => {
    const atBottom = checkIsAtBottom();
    setIsAtBottom(atBottom);

    if (atBottom) {
      // User scrolled back to bottom — resume auto-scroll
      setUserScrolledUp(false);
    } else {
      // User scrolled up — pause auto-scroll
      setUserScrolledUp(true);
    }
  }, [checkIsAtBottom]);

  // Scroll to bottom programmatically
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior,
    });
    setUserScrolledUp(false);
    setIsAtBottom(true);
  }, []);

  // Auto-scroll when content changes (call this after new messages/deltas)
  const autoScroll = useCallback(() => {
    if (!userScrolledUp) {
      // Use instant scroll during streaming for smoother UX
      scrollToBottom('instant' as ScrollBehavior);
    }
  }, [userScrolledUp, scrollToBottom]);

  // Attach scroll listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return {
    containerRef,
    isAtBottom,
    userScrolledUp,
    scrollToBottom,
    autoScroll,
  };
}

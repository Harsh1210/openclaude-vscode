import React, { useState, useEffect, useRef } from 'react';

interface SpinnerStatusProps {
  isActive: boolean;
  customVerbs: string[];
  customTips: string[];
  tipsEnabled: boolean;
  reducedMotion: boolean;
}

const DEFAULT_VERBS = ['Thinking', 'Working', 'Processing', 'Analyzing'];
const DEFAULT_TIPS = [
  'Tip: Use @file to reference specific files',
  'Tip: Use /help to see all commands',
  'Tip: Press Escape to cancel',
];

export const SpinnerStatus: React.FC<SpinnerStatusProps> = ({
  isActive,
  customVerbs,
  customTips,
  tipsEnabled,
  reducedMotion,
}) => {
  const verbs = customVerbs.length > 0 ? customVerbs : DEFAULT_VERBS;
  const tips = customTips.length > 0 ? customTips : DEFAULT_TIPS;

  const [verbIndex, setVerbIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const verbIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tipIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isActive) {
      setVerbIndex(0);
      setTipIndex(0);
      return;
    }

    verbIntervalRef.current = setInterval(() => {
      setVerbIndex((prev) => (prev + 1) % verbs.length);
    }, 3000);

    tipIntervalRef.current = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 8000);

    return () => {
      if (verbIntervalRef.current) clearInterval(verbIntervalRef.current);
      if (tipIntervalRef.current) clearInterval(tipIntervalRef.current);
    };
  }, [isActive, verbs.length, tips.length]);

  if (!isActive) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--vscode-descriptionForeground)]">
      <div
        className={`w-3 h-3 border-2 border-[var(--vscode-foreground)]/20 border-t-[var(--vscode-focusBorder)] rounded-full ${
          reducedMotion ? '' : 'animate-spin'
        }`}
        role="status"
        aria-label="Loading"
      />
      <span>{verbs[verbIndex]}...</span>
      {tipsEnabled && (
        <span className="ml-auto text-[var(--vscode-foreground)]/30 truncate max-w-[200px]">
          {tips[tipIndex]}
        </span>
      )}
    </div>
  );
};

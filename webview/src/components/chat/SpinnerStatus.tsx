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
    <div className="spinner-row" style={{ gap: 8, padding: '0 16px', fontSize: '0.85em', color: 'var(--app-secondary-foreground)' }}>
      <div
        style={{
          width: 12,
          height: 12,
          border: '2px solid var(--app-input-border)',
          borderTopColor: 'var(--app-spinner-foreground)',
          borderRadius: '50%',
          animation: reducedMotion ? 'none' : 'spin 1s linear infinite',
        }}
        role="status"
        aria-label="Loading"
      />
      <span>{verbs[verbIndex]}...</span>
      {tipsEnabled && (
        <span style={{ marginLeft: 'auto', opacity: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
          {tips[tipIndex]}
        </span>
      )}
    </div>
  );
};

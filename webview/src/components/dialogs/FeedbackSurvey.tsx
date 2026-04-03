import React, { useState, useCallback } from 'react';
import { vscode } from '../../vscode';

interface FeedbackSurveyProps {
  onDismiss: () => void;
}

export const FeedbackSurvey: React.FC<FeedbackSurveyProps> = ({ onDismiss }) => {
  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(() => {
    vscode.postMessage({
      type: 'feedback_survey',
      rating,
      feedback: feedback.trim() || null,
    });
    setSubmitted(true);
    setTimeout(onDismiss, 1500);
  }, [rating, feedback, onDismiss]);

  if (submitted) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-vscode-bg border border-vscode-border rounded-lg shadow-xl p-4 max-w-sm">
        <div className="flex items-center gap-2 text-sm text-green-400">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Thank you for your feedback!
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-xl max-w-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--vscode-foreground)]">How was this session?</h3>
        <button
          className="p-0.5 text-[var(--vscode-foreground)]/40 hover:text-[var(--vscode-foreground)] bg-transparent border-none cursor-pointer"
          onClick={onDismiss}
          aria-label="Dismiss survey"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 16 16">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Star rating */}
        <div className="flex gap-1 justify-center">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              className={`p-1 bg-transparent border-none cursor-pointer transition-colors ${
                rating !== null && star <= rating
                  ? 'text-yellow-400'
                  : 'text-[var(--vscode-foreground)]/20 hover:text-yellow-400/60'
              }`}
              onClick={() => setRating(star)}
              aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          ))}
        </div>

        <textarea
          className="w-full px-2 py-1.5 text-xs rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] outline-none resize-none focus:border-[var(--vscode-focusBorder)]"
          placeholder="Any additional feedback? (optional)"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
        />

        <button
          className="w-full px-3 py-1.5 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSubmit}
          disabled={rating === null}
        >
          Submit Feedback
        </button>
      </div>
    </div>
  );
};

/**
 * Determines whether to show the feedback survey based on configured rate.
 */
export function shouldShowSurvey(feedbackSurveyRate: number): boolean {
  if (feedbackSurveyRate <= 0) return false;
  if (feedbackSurveyRate >= 1) return true;
  return Math.random() < feedbackSurveyRate;
}

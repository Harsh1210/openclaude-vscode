import React from 'react';

interface Announcement {
  id: string;
  message: string;
  severity?: 'info' | 'warning' | 'error';
  dismissible?: boolean;
}

interface CompanyAnnouncementProps {
  announcements: Announcement[];
  onDismiss: (id: string) => void;
}

const severityStyles: Record<string, string> = {
  info: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  error: 'bg-red-500/10 border-red-500/30 text-red-400',
};

const severityIcons: Record<string, React.ReactNode> = {
  info: (
    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  ),
};

export const CompanyAnnouncement: React.FC<CompanyAnnouncementProps> = ({
  announcements,
  onDismiss,
}) => {
  if (announcements.length === 0) return null;

  return (
    <div className="space-y-1 px-3 pt-2">
      {announcements.map((announcement) => {
        const severity = announcement.severity ?? 'info';
        return (
          <div
            key={announcement.id}
            className={`flex items-start gap-2 px-3 py-2 rounded border text-xs ${severityStyles[severity]}`}
            role="alert"
          >
            {severityIcons[severity]}
            <span className="flex-1">{announcement.message}</span>
            {announcement.dismissible !== false && (
              <button
                className="flex-shrink-0 p-0.5 hover:bg-white/10 rounded bg-transparent border-none cursor-pointer text-current"
                onClick={() => onDismiss(announcement.id)}
                aria-label="Dismiss announcement"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

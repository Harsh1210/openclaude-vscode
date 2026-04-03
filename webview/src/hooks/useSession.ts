import { useState, useEffect, useCallback } from 'react';
import { vscode } from '../vscode';

export interface SessionData {
  id: string;
  title: string;
  model: string;
  timestamp: string;   // ISO 8601
  createdAt: string;    // ISO 8601
  messageCount: number;
  cwd: string;
  gitBranch: string;
}

export interface GroupedSessionData {
  group: string;       // 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Older'
  sessions: SessionData[];
}

export interface UseSessionReturn {
  groupedSessions: GroupedSessionData[];
  allSessions: SessionData[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredSessions: SessionData[];
  isSessionListOpen: boolean;
  setSessionListOpen: (open: boolean) => void;
  activeSessionId: string | null;
  sessionTitle: string;
  resumeSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  newConversation: () => void;
  isLoading: boolean;
}

export function useSession(): UseSessionReturn {
  const [groupedSessions, setGroupedSessions] = useState<GroupedSessionData[]>([]);
  const [allSessions, setAllSessions] = useState<SessionData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSessions, setFilteredSessions] = useState<SessionData[]>([]);
  const [isSessionListOpen, setSessionListOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState('New Conversation');
  const [isLoading, setIsLoading] = useState(true);

  // Listen for messages from the extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.type) {
        case 'sessionsData': {
          setGroupedSessions(msg.grouped);
          const flat: SessionData[] = msg.grouped.flatMap(
            (g: GroupedSessionData) => g.sessions,
          );
          setAllSessions(flat);
          setIsLoading(false);
          break;
        }
        case 'sessionsUpdated': {
          setAllSessions(msg.sessions);
          // Re-request grouped view
          vscode.postMessage({ type: 'get_sessions' });
          break;
        }
        case 'sessionDeleted': {
          if (msg.success && msg.sessionId === activeSessionId) {
            setActiveSessionId(null);
            setSessionTitle('New Conversation');
          }
          break;
        }
        case 'sessionResumed': {
          setActiveSessionId(msg.sessionId);
          setSessionTitle(msg.title || 'Resumed Session');
          setSessionListOpen(false);
          break;
        }
        case 'sessionTitleUpdate': {
          if (msg.sessionId === activeSessionId || !activeSessionId) {
            setSessionTitle(msg.title);
            setActiveSessionId(msg.sessionId);
          }
          break;
        }
      }
    };

    window.addEventListener('message', handler);
    // Request initial data
    vscode.postMessage({ type: 'get_sessions' });
    return () => window.removeEventListener('message', handler);
  }, [activeSessionId]);

  // Client-side search filtering (instant, no round-trip)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredSessions([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredSessions(
      allSessions.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.model.toLowerCase().includes(q) ||
          s.gitBranch.toLowerCase().includes(q),
      ),
    );
  }, [searchQuery, allSessions]);

  const resumeSession = useCallback((sessionId: string) => {
    vscode.postMessage({ type: 'resume_session', sessionId });
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    vscode.postMessage({ type: 'delete_session', sessionId });
  }, []);

  const newConversation = useCallback(() => {
    vscode.postMessage({ type: 'new_conversation' });
    setActiveSessionId(null);
    setSessionTitle('New Conversation');
    setSessionListOpen(false);
  }, []);

  return {
    groupedSessions,
    allSessions,
    searchQuery,
    setSearchQuery,
    filteredSessions,
    isSessionListOpen,
    setSessionListOpen,
    activeSessionId,
    sessionTitle,
    resumeSession,
    deleteSession,
    newConversation,
    isLoading,
  };
}

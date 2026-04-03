import { useState, useEffect } from 'react';

export interface ActiveFileInfo {
  filePath: string;
  fileName: string;
  languageId: string;
}

interface UseActiveFileReturn {
  activeFile: ActiveFileInfo | null;
}

/**
 * Hook for tracking the currently active file in the VS Code editor.
 * Receives `active_file_changed` messages from the extension host.
 */
export function useActiveFile(): UseActiveFileReturn {
  const [activeFile, setActiveFile] = useState<ActiveFileInfo | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'active_file_changed') {
        if (message.filePath) {
          setActiveFile({
            filePath: message.filePath,
            fileName: message.fileName || message.filePath.split('/').pop() || '',
            languageId: message.languageId || '',
          });
        } else {
          setActiveFile(null);
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return { activeFile };
}

import { useState, useEffect, useMemo } from 'react';
import { fuzzySearch } from '../utils/fuzzySearch';

export interface SlashCommandDef {
  name: string;
  description: string;
  argumentHint: string;
}

interface UseSlashCommandsReturn {
  commands: SlashCommandDef[];
  filteredCommands: (query: string) => SlashCommandDef[];
  isLoaded: boolean;
}

/**
 * Hook for slash command menu. Listens for the command list from the
 * initialize response (sent by extension host as `slash_commands_available`).
 */
export function useSlashCommands(): UseSlashCommandsReturn {
  const [commands, setCommands] = useState<SlashCommandDef[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'slash_commands_available') {
        setCommands(message.commands);
        setIsLoaded(true);
      }
      // Also extract slash_commands from system/init message
      // Note: system/init has slash_commands as string[] (names only)
      // Full command objects come via slash_commands_available from the initialize response
      if (message.type === 'cli_output') {
        const data = message.data as Record<string, unknown> | undefined;
        if (data?.type === 'system' && data.subtype === 'init' && Array.isArray(data.slash_commands)) {
          // slash_commands in system/init are just strings (command names), not objects
          // Only use them as fallback if we have no commands yet
          if (commands.length === 0) {
            const cmds = (data.slash_commands as string[]).map((name) => ({
              name: typeof name === 'string' ? name : (name as Record<string, unknown>).name as string || '',
              description: typeof name === 'object' ? (name as Record<string, unknown>).description as string || '' : '',
              argumentHint: typeof name === 'object' ? (name as Record<string, unknown>).argument_hint as string || '' : '',
            })).filter((c) => c.name);
            if (cmds.length > 0) {
              setCommands(cmds);
              setIsLoaded(true);
            }
          }
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const filteredCommands = useMemo(() => {
    return (query: string): SlashCommandDef[] => {
      if (!query) return commands;

      // Strip leading / if present
      const q = query.startsWith('/') ? query.slice(1) : query;
      const matches = fuzzySearch(q, commands, (cmd) => cmd.name);
      return matches.map((m) => m.item);
    };
  }, [commands]);

  return { commands, filteredCommands, isLoaded };
}

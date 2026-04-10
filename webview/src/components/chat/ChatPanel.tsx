import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useChat } from '../../hooks/useChat';
import { useSession } from '../../hooks/useSession';
import { useProcessState } from '../../hooks/useProcessState';
import { useSlashCommands } from '../../hooks/useSlashCommands';
import { useAtMentions } from '../../hooks/useAtMentions';
import { useActiveFile } from '../../hooks/useActiveFile';
import { ChatHeader } from '../header/ChatHeader';
import { SessionList } from '../header/SessionList';
import { MessageList } from './MessageList';
import { CostDisplay } from '../shared/CostDisplay';
import { PermissionModeIndicator } from '../input/PermissionModeIndicator';
import type { PermissionModeValue } from '../input/ModeSelector';
import { vscode } from '../../vscode';
import { ProviderBadge } from '../input/ProviderBadge';
import { ModelSelector } from '../input/ModelSelector';
import { FastModeToggle } from '../input/FastModeToggle';
import { EffortSelector } from '../input/EffortSelector';
import { CompanyAnnouncement } from './CompanyAnnouncement';
import { SpinnerStatus } from './SpinnerStatus';
import { ErrorBanner } from './ErrorBanner';
import { AtMentionPicker } from '../input/AtMentionPicker';
import { SlashCommandMenu } from '../input/SlashCommandMenu';
import { AttachmentBar, type AttachmentItem } from '../input/AttachmentBar';
import { McpServerManager } from '../dialogs/McpServerManager';
import { PluginManager } from '../dialogs/PluginManager';
import { OnboardingChecklist } from '../onboarding/OnboardingChecklist';
import type { AtMentionResult } from '../../hooks/useAtMentions';
import type { ToolActivity } from '../../hooks/useChat';

export function ChatPanel() {
  const {
    messages,
    cost,
    isStreaming,
    model,
    error,
    rateLimitInfo,
    promptSuggestions,
    processState,
    fastModeState,
    setFastModeState,
    availableModels,
    effortLevel,
    setEffortLevel,
    toolActivity,
    sendMessage,
    interrupt,
  } = useChat();

  const {
    status: processStatus,
    authError,
  } = useProcessState();

  const {
    groupedSessions,
    filteredSessions,
    searchQuery,
    setSearchQuery,
    isSessionListOpen,
    setSessionListOpen,
    activeSessionId,
    sessionTitle,
    resumeSession,
    deleteSession,
    newConversation,
  } = useSession();

  const [permissionMode, setPermissionMode] = useState<PermissionModeValue>('default');
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState<Set<string>>(new Set());
  const [announcements, setAnnouncements] = useState<Array<{ id: string; message: string; severity?: 'info' | 'warning' | 'error'; dismissible?: boolean }>>([]);
  const [showMcpManager, setShowMcpManager] = useState(false);
  const [showPluginManager, setShowPluginManager] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('openclaude.onboarding.dismissed');
  });

  // Listen for system init messages to get the initial permission mode
  useEffect(() => {
    const unsub = vscode.onMessage('cli_output', (message) => {
      const data = message.data as Record<string, unknown> | undefined;
      if (data?.type === 'system' && data.subtype === 'init' && typeof data.permissionMode === 'string') {
        setPermissionMode(data.permissionMode as PermissionModeValue);
      }
      // Load company announcements from init
      if (data?.type === 'system' && data.subtype === 'init' && Array.isArray(data.companyAnnouncements)) {
        setAnnouncements(data.companyAnnouncements as typeof announcements);
      }
    });
    return unsub;
  }, []);

  // Listen for open_plugin_manager and hide_onboarding messages
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'open_plugin_manager') setShowPluginManager(true);
      if (e.data?.type === 'hide_onboarding') {
        setShowOnboarding(false);
        localStorage.setItem('openclaude.onboarding.dismissed', '1');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Rate limit countdown timer is now handled inside ErrorBanner component

  const handleModeChange = useCallback((mode: PermissionModeValue) => {
    setPermissionMode(mode);
    vscode.postMessage({ type: 'set_permission_mode', mode });
  }, []);

  const isStarting = processState === 'starting';

  return (
    <div
      style={{
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
        flexDirection: 'column',
        flex: 1,
        lineHeight: 1.5,
        height: '100vh',
        backgroundColor: 'var(--app-root-background)',
        color: 'var(--app-primary-foreground)',
      }}
    >
      {/* Header + Session list overlay wrapper */}
      <div style={{ position: 'relative', flexShrink: 0, zIndex: 10 }}>
        <ChatHeader
          sessionTitle={sessionTitle}
          isSessionListOpen={isSessionListOpen}
          onToggleSessionList={() => setSessionListOpen(!isSessionListOpen)}
          onNewConversation={newConversation}
        />

        {/* Session list overlay */}
        {isSessionListOpen && (
          <SessionList
            groupedSessions={groupedSessions}
            filteredSessions={filteredSessions}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeSessionId={activeSessionId}
            onResumeSession={resumeSession}
            onDeleteSession={deleteSession}
            onClose={() => setSessionListOpen(false)}
          />
        )}
      </div>

      {/* Message list */}
      <MessageList messages={messages} isStreaming={isStreaming} processState={processState} />

      {/* Onboarding checklist */}
      {showOnboarding && (
        <div style={{ padding: '0 16px' }}>
          <OnboardingChecklist
            visible={showOnboarding}
            onDismiss={() => {
              setShowOnboarding(false);
              localStorage.setItem('openclaude.onboarding.dismissed', '1');
              vscode.postMessage({ type: 'hide_onboarding' });
            }}
            onOpenWalkthrough={() => vscode.postMessage({ type: 'open_walkthrough' })}
          />
        </div>
      )}
      {/* Company announcements */}
      <CompanyAnnouncement
        announcements={announcements.filter((a) => !dismissedAnnouncementIds.has(a.id))}
        onDismiss={(id) => setDismissedAnnouncementIds((prev) => new Set(prev).add(id))}
      />

      {/* Spinner status during tool execution */}
      <SpinnerStatus
        isActive={isStreaming}
        customVerbs={[]}
        customTips={[]}
        tipsEnabled={true}
        reducedMotion={false}
      />

      {/* Prompt suggestions */}
      {promptSuggestions.length > 0 && !isStreaming && (
        <div style={{ padding: '4px 16px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {promptSuggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s)}
              style={{
                padding: '2px 10px',
                fontSize: 11,
                borderRadius: 'var(--corner-radius-small)',
                border: '1px solid var(--app-input-border)',
                background: 'transparent',
                color: 'var(--app-secondary-foreground)',
                cursor: 'pointer',
              }}
            >
              {s.length > 60 ? s.slice(0, 57) + '...' : s}
            </button>
          ))}
        </div>
      )}

      {/* Error / rate limit banner */}
      <ErrorBanner
        status={processStatus}
        rateLimitInfo={rateLimitInfo}
        authError={authError}
        error={error}
      />

      {/* Input area — Claude Code positions this absolutely; we use flow layout */}
      <div style={{ padding: '12px 16px', flexShrink: 0 }}>
        <div className="input-wrapper">
          <div
            className="input-container"
            data-permission-mode={permissionMode}
          >
            <InputArea
              isStreaming={isStreaming}
              isStarting={isStarting}
              onSend={sendMessage}
              onInterrupt={interrupt}
              effortLevel={effortLevel}
              onEffortChange={setEffortLevel}
              toolActivity={toolActivity}
              permissionMode={permissionMode}
            />
          </div>
        </div>

        {/* Footer: permission mode + cost + provider */}
        <div style={{ marginTop: 6, paddingLeft: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PermissionModeIndicator
              currentMode={permissionMode}
              onModeChange={handleModeChange}
            />
            <ProviderBadge />
            <ModelSelector currentModel={model} availableModels={availableModels} />
            <FastModeToggle
              isEnabled={fastModeState.enabled}
              canToggle={fastModeState.canToggle}
              onToggle={() => {
                const newEnabled = !fastModeState.enabled;
                setFastModeState({ ...fastModeState, enabled: newEnabled });
                vscode.postMessage({ type: 'toggle_fast_mode', enabled: newEnabled });
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setShowMcpManager(true)}
              title="MCP Servers"
              style={{
                fontSize: 10, padding: '1px 5px', cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--app-input-border)',
                borderRadius: 'var(--corner-radius-small)',
                color: 'var(--app-secondary-foreground)',
              }}
            >
              MCP
            </button>
            <button
              onClick={() => setShowPluginManager(true)}
              title="Plugins"
              style={{
                fontSize: 10, padding: '1px 5px', cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--app-input-border)',
                borderRadius: 'var(--corner-radius-small)',
                color: 'var(--app-secondary-foreground)',
              }}
            >
              Plugins
            </button>
            <CostDisplay cost={cost} className="" />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <McpServerManager isOpen={showMcpManager} onClose={() => setShowMcpManager(false)} />
      <PluginManager isOpen={showPluginManager} onClose={() => setShowPluginManager(false)} />
    </div>
  );
}

// ============================================================================
// Input area — styled to match Claude Code's input container
// ============================================================================

interface InputAreaProps {
  isStreaming: boolean;
  isStarting: boolean;
  onSend: (text: string) => void;
  onInterrupt: () => void;
  effortLevel: string;
  onEffortChange: (level: string) => void;
  permissionMode?: string;
  toolActivity: ToolActivity | null;
}

function InputArea({ isStreaming, isStarting, onSend, onInterrupt, effortLevel, onEffortChange, toolActivity, permissionMode }: InputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  // Slash commands
  const { filteredCommands, isLoaded: slashCommandsLoaded } = useSlashCommands();
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const { results: atResults, isLoading: atLoading, query: queryAtMentions, clear: clearAtMentions } = useAtMentions();
  const [atPickerVisible, setAtPickerVisible] = useState(false);
  const atStartPosRef = useRef(-1);

  // Active file
  const { activeFile } = useActiveFile();

  // Listen for file picker results
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'file_picker_result') {
        const newAttachments: AttachmentItem[] = (message.files ?? []).map((f: { type: string; name: string; content: string }) => ({
          type: f.type as AttachmentItem['type'],
          name: f.name,
          content: f.content,
        }));
        setAttachments((prev) => [...prev, ...newAttachments]);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const doSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text && attachments.length === 0) return;
    if (isStreaming || isStarting) return;
    onSend(text);
    setInputValue('');
    setAttachments([]);
    setSlashMenuVisible(false);
    setAtPickerVisible(false);
    clearAtMentions();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [inputValue, attachments, isStreaming, isStarting, onSend, clearAtMentions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // If a picker is open, let it handle arrow keys / enter
    if (atPickerVisible || slashMenuVisible) {
      if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(e.key)) {
        return; // pickers handle these via capture listener
      }
      if (e.key === 'Escape') {
        setAtPickerVisible(false);
        setSlashMenuVisible(false);
        clearAtMentions();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        // Claude Code: Enter during streaming interrupts the current turn
        onInterrupt();
      } else {
        doSend();
      }
    }
    // Escape also stops streaming (like Claude Code)
    if (e.key === 'Escape' && isStreaming) {
      e.preventDefault();
      onInterrupt();
    }
  };

  const detectTriggers = useCallback((text: string, cursorPos: number) => {
    // Slash command: / at position 0
    if (text.startsWith('/')) {
      const query = text.slice(1);
      setSlashQuery(query);
      setSlashMenuVisible(true);
      setAtPickerVisible(false);
      clearAtMentions();
      return;
    } else if (slashMenuVisible) {
      setSlashMenuVisible(false);
      setSlashQuery('');
    }

    // @-mention: walk back from cursor to find @
    let atPos = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      const char = text[i];
      if (char === '@') {
        if (i === 0 || /\s/.test(text[i - 1])) {
          atPos = i;
        }
        break;
      }
      if (/\s/.test(char)) break;
    }

    if (atPos >= 0) {
      const query = text.slice(atPos + 1, cursorPos);
      atStartPosRef.current = atPos;
      setAtPickerVisible(true);
      queryAtMentions(query);
    } else if (atPickerVisible) {
      setAtPickerVisible(false);
      atStartPosRef.current = -1;
      clearAtMentions();
    }
  }, [slashMenuVisible, atPickerVisible, queryAtMentions, clearAtMentions]);

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const newValue = el.value;
    setInputValue(newValue);
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    detectTriggers(newValue, el.selectionStart);
  };

  const handleAtSelect = useCallback((result: AtMentionResult) => {
    const atPos = atStartPosRef.current;
    if (atPos < 0 || !textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const before = inputValue.slice(0, atPos);
    const after = inputValue.slice(cursorPos);
    const newText = before + result.insertText + ' ' + after;
    setInputValue(newText);
    setAtPickerVisible(false);
    atStartPosRef.current = -1;
    clearAtMentions();
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newPos = atPos + result.insertText.length + 1;
        textareaRef.current.selectionStart = newPos;
        textareaRef.current.selectionEnd = newPos;
        textareaRef.current.focus();
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
      }
    });
  }, [inputValue, clearAtMentions]);

  const handleSlashSelect = useCallback((command: { name: string; argumentHint: string }) => {
    if (!command.argumentHint) {
      // No args needed — send directly as a user message
      onSend('/' + command.name);
      setInputValue('');
      setSlashMenuVisible(false);
      setSlashQuery('');
    } else {
      // Set input to the command so user can type args
      const newText = `/${command.name} `;
      setInputValue(newText);
      setSlashMenuVisible(false);
      setSlashQuery('');
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [onSend]);

  const handleSlashButtonClick = useCallback(() => {
    if (slashMenuVisible) {
      setSlashMenuVisible(false);
    } else {
      setSlashMenuVisible(true);
      setSlashQuery('');
    }
  }, [slashMenuVisible]);

  const handlePaperclipClick = useCallback(() => {
    vscode.postMessage({ type: 'file_picker_request' });
  }, []);

  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const handleAddClick = useCallback(() => {
    setAddMenuVisible((prev) => !prev);
  }, []);

  // Click outside to dismiss add menu
  useEffect(() => {
    if (!addMenuVisible) return;
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuVisible(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [addMenuVisible]);

  const handleActiveFileClick = useCallback(() => {
    if (!activeFile) return;
    const mention = `@${activeFile.filePath} `;
    if (textareaRef.current) {
      const pos = textareaRef.current.selectionStart;
      const before = inputValue.slice(0, pos);
      const after = inputValue.slice(pos);
      setInputValue(before + mention + after);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [activeFile, inputValue]);

  const placeholder = isStarting
    ? 'Starting OpenClaude...'
    : 'How can I help? (@ to mention files, / for commands)';

  // Claude Code: textarea is NEVER disabled during streaming — user can type while generating
  // Only disable during initial CLI startup
  const textareaDisabled = isStarting;
  // Send button disabled only during startup (not streaming — streaming shows stop button)
  const sendDisabled = isStarting;

  return (
    <div style={{ position: 'relative' }}>
      {/* Floating pickers — positioned above the input container */}
      <AtMentionPicker
        results={atResults}
        isLoading={atLoading}
        isVisible={atPickerVisible}
        onSelect={handleAtSelect}
        onDismiss={() => { setAtPickerVisible(false); clearAtMentions(); }}
      />
      <SlashCommandMenu
        commands={filteredCommands(slashQuery)}
        isVisible={slashMenuVisible}
        isLoaded={slashCommandsLoaded}
        query={slashQuery}
        onSelect={handleSlashSelect}
        onDismiss={() => { setSlashMenuVisible(false); setSlashQuery(''); }}
      />

      {/* Attachment bar */}
      <AttachmentBar
        attachments={attachments}
        onRemove={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
      />

      {/* Textarea row — matches Claude Code .messageInputContainer_cKsPxg layout */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          className="input"
          value={inputValue}
          placeholder={placeholder}
          disabled={textareaDisabled}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onChange={() => {/* controlled via onInput */}}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--app-input-foreground)',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            lineHeight: 1.5,
            maxHeight: 200,
            overflowY: 'auto',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            padding: '10px 14px',
            minHeight: '1.5em',
            alignSelf: 'stretch',
          }}
        />

        {/* Send / Stop button — uses CSS .sendButton class (exact from Claude Code) */}
        <button
          className="sendButton"
          disabled={sendDisabled}
          onClick={() => {
            if (isStreaming) {
              onInterrupt();
            } else {
              doSend();
            }
          }}
          title={isStreaming ? 'Stop generation (Escape)' : 'Send message (Enter)'}
          data-permission-mode={permissionMode}
          style={{ flexShrink: 0, margin: '0 6px 8px 0' }}
        >
          {isStreaming ? (
            /* Stop icon */
            <svg className="stopIcon" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="3" width="10" height="10" rx="2" />
            </svg>
          ) : (
            /* Send icon — arrow up */
            <svg className="sendIcon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 12V4M4 8l4-4 4 4" />
            </svg>
          )}
        </button>
      </div>

      {/* Toolbar row — matches Claude Code .inputFooter_gGYT1w */}
      <div className="input-footer">
        {/* Left: action buttons */}
        <ToolbarIconButton onClick={handleSlashButtonClick} title="Slash commands" disabled={textareaDisabled}>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>/</span>
        </ToolbarIconButton>

        <ToolbarIconButton onClick={handlePaperclipClick} title="Attach file" disabled={textareaDisabled}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.5 7.5l-6 6a4 4 0 01-5.66-5.66l6-6a2.5 2.5 0 013.54 3.54l-6 6a1 1 0 01-1.42-1.42l5.5-5.5" />
          </svg>
        </ToolbarIconButton>

        <div style={{ position: 'relative' }} ref={addMenuRef}>
          <ToolbarIconButton onClick={handleAddClick} title="Add content" disabled={textareaDisabled}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </ToolbarIconButton>
          {addMenuVisible && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                marginBottom: 4,
                minWidth: 200,
                background: 'var(--app-panel-background, var(--vscode-editorWidget-background))',
                border: '1px solid var(--app-input-border)',
                borderRadius: 'var(--corner-radius-small)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                zIndex: 50,
                overflow: 'hidden',
              }}
            >
              <AddContentMenuItem
                icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 7.5l-6 6a4 4 0 01-5.66-5.66l6-6a2.5 2.5 0 013.54 3.54l-6 6a1 1 0 01-1.42-1.42l5.5-5.5" /></svg>}
                label="Upload from computer"
                onClick={() => {
                  vscode.postMessage({ type: 'file_picker_request' });
                  setAddMenuVisible(false);
                }}
              />
              <AddContentMenuItem
                icon={<span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>@</span>}
                label="Add context"
                onClick={() => {
                  setAddMenuVisible(false);
                  if (textareaRef.current) {
                    const pos = textareaRef.current.selectionStart;
                    const before = inputValue.slice(0, pos);
                    const after = inputValue.slice(pos);
                    setInputValue(before + '@' + after);
                    requestAnimationFrame(() => {
                      if (textareaRef.current) {
                        const newPos = pos + 1;
                        textareaRef.current.selectionStart = newPos;
                        textareaRef.current.selectionEnd = newPos;
                        textareaRef.current.focus();
                        detectTriggers(before + '@' + after, newPos);
                      }
                    });
                  }
                }}
              />
              <AddContentMenuItem
                icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 1.5C6 4 5 6 5 8s1 4 3 6.5M8 1.5C10 4 11 6 11 8s-1 4-3 6.5M1.5 8h13"/></svg>}
                label="Browse the web"
                onClick={() => {
                  setAddMenuVisible(false);
                  if (textareaRef.current) {
                    const pos = textareaRef.current.selectionStart;
                    const before = inputValue.slice(0, pos);
                    const after = inputValue.slice(pos);
                    const mention = '@browser ';
                    setInputValue(before + mention + after);
                    requestAnimationFrame(() => {
                      if (textareaRef.current) {
                        const newPos = pos + mention.length;
                        textareaRef.current.selectionStart = newPos;
                        textareaRef.current.selectionEnd = newPos;
                        textareaRef.current.focus();
                      }
                    });
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right: effort selector + active file indicator */}
        <EffortSelector
          currentEffort={effortLevel}
          disabled={textareaDisabled}
          onEffortChange={(level) => {
            onEffortChange(level);
            vscode.postMessage({ type: 'set_effort_level', level });
          }}
        />

        {/* Right: active file indicator */}
        {activeFile && (
          <button
            onClick={handleActiveFileClick}
            title={`Active: ${activeFile.filePath} — click to reference`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              borderRadius: 'var(--corner-radius-small)',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--app-secondary-foreground)',
              maxWidth: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.6 }}>
              <path d="M13.85 4.44l-3.28-3.3A.5.5 0 0010.21 1H3.5A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5V4.8a.5.5 0 00-.15-.36zM10.5 2.12L12.88 4.5H10.5V2.12zM13 13.5a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5H9.5V5h4v8.5z" />
            </svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeFile.fileName}</span>
          </button>
        )}
      </div>

      {/* Tool activity indicator */}
      {toolActivity && isStreaming && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 12px 2px',
          fontSize: 11,
          color: 'var(--app-secondary-foreground)',
          opacity: 0.8,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}>
          <span style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--vscode-charts-green, #66bb6a)',
            flexShrink: 0,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {toolActivity.description}
          </span>
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
        </div>
      )}
    </div>
  );
}

function ToolbarIconButton({
  onClick,
  title,
  disabled = false,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: 'var(--corner-radius-small)',
        border: 'none',
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: 'var(--app-secondary-foreground)',
        opacity: disabled ? 0.4 : 1,
        padding: 0,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--app-ghost-button-hover-background)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

function AddContentMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '6px 12px',
        border: 'none',
        background: 'transparent',
        color: 'var(--app-primary-foreground)',
        fontSize: 12,
        cursor: 'pointer',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--app-ghost-button-hover-background, var(--vscode-list-hoverBackground))';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, flexShrink: 0, opacity: 0.7 }}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

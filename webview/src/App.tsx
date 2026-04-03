import { useState, useEffect } from 'react';
import { ChatPanel } from './components/chat/ChatPanel';
import { PermissionDialog } from './components/dialogs/PermissionDialog';
import { FeedbackSurvey, shouldShowSurvey } from './components/dialogs/FeedbackSurvey';
import { TeleportDialog } from './components/dialogs/TeleportDialog';
import { ElicitationDialog } from './components/dialogs/ElicitationDialog';
import { usePermissions } from './hooks/usePermissions';
import { vscode } from './vscode';
import type { TeleportState, ElicitationState } from './types/interactions';

function App() {
  const { currentRequest, pendingCount, respond } = usePermissions();
  const [showSurvey, setShowSurvey] = useState(false);
  const [teleportState, setTeleportState] = useState<TeleportState>({
    isVisible: false,
    info: null,
  });
  const [elicitationState, setElicitationState] = useState<ElicitationState>({
    isVisible: false,
    request: null,
  });

  // Listen for teleport and elicitation messages from the extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'show_teleport') {
        setTeleportState({
          isVisible: true,
          info: {
            remoteSessionId: data.remoteSessionId as string,
            branch: data.branch as string,
            messageCount: data.messageCount as number,
            sourceDevice: data.sourceDevice as string,
            timestamp: data.timestamp as string,
          },
        });
        return;
      }

      if (data.type === 'show_elicitation') {
        setElicitationState({
          isVisible: true,
          request: {
            requestId: data.requestId as string,
            message: data.message as string,
            fields: (data.fields as unknown[]) ?? [],
          },
        });
        return;
      }

      if (data.type === 'dismiss_elicitation') {
        setElicitationState({ isVisible: false, request: null });
        return;
      }

      const msg = data.type === 'cli_output' ? data.data : data;
      if (!msg || typeof msg !== 'object') return;

      const msgAny = msg as Record<string, unknown>;
      if (msgAny.type === 'result' && !msgAny.is_error) {
        const rate = (msgAny.feedbackSurveyRate as number) ?? 0;
        if (shouldShowSurvey(rate)) {
          setShowSurvey(true);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <>
      <ChatPanel />

      {/* Permission dialog overlay */}
      {currentRequest && (
        <PermissionDialog
          request={currentRequest}
          pendingCount={pendingCount}
          onAllow={(id) => respond(id, true)}
          onAlwaysAllow={(id) => respond(id, true, true)}
          onDeny={(id) => respond(id, false)}
        />
      )}

      {/* Post-session feedback survey */}
      {showSurvey && <FeedbackSurvey onDismiss={() => setShowSurvey(false)} />}

      {/* Teleport dialog overlay */}
      {teleportState.isVisible && teleportState.info && (
        <TeleportDialog
          info={teleportState.info}
          onAccept={() => {
            vscode.postMessage({
              type: 'teleport_accept',
              remoteSessionId: teleportState.info!.remoteSessionId,
            });
            setTeleportState({ isVisible: false, info: null });
          }}
          onReject={() => {
            vscode.postMessage({
              type: 'teleport_reject',
              remoteSessionId: teleportState.info!.remoteSessionId,
            });
            setTeleportState({ isVisible: false, info: null });
          }}
        />
      )}

      {/* Elicitation dialog overlay */}
      {elicitationState.isVisible && elicitationState.request && (
        <ElicitationDialog
          request={elicitationState.request}
          onSubmit={(values) => {
            vscode.postMessage({
              type: 'elicitation_response',
              requestId: elicitationState.request!.requestId,
              values,
            });
            setElicitationState({ isVisible: false, request: null });
          }}
          onCancel={() => {
            vscode.postMessage({
              type: 'elicitation_cancel',
              requestId: elicitationState.request!.requestId,
            });
            setElicitationState({ isVisible: false, request: null });
          }}
        />
      )}
    </>
  );
}

export default App;

import type { ChatMessage } from '../../types/chat';
import { MessageActions } from './MessageActions';

interface UserMessageProps {
  message: ChatMessage;
  onEdit?: (uuid: string, newContent: string) => void;
}

/**
 * User message bubble — exact Claude Code styling:
 * .userMessageContainer_07S1Yg: display:inline-block; position:relative; margin:4px 0
 * .userMessage_07S1Yg: white-space:pre-wrap; border:1px solid var(--app-input-border);
 *   border-radius:6px; background:var(--app-input-background); padding:4px 6px
 */
export function UserMessage({ message, onEdit }: UserMessageProps) {
  return (
    <div style={{ textAlign: 'left', position: 'relative', width: '100%', padding: '0 16px' }}>
      <div className="group" style={{ display: 'inline-block', position: 'relative', margin: '4px 0', width: '100%' }}>
        <div className="user-message-bubble">
          {message.text || ''}
        </div>
        <div className="flex justify-end mt-1">
          <MessageActions
            messageRole="user"
            content={message.text || ''}
            uuid={message.id}
            onEdit={onEdit}
          />
        </div>
      </div>
    </div>
  );
}

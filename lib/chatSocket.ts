import { io, type Socket } from 'socket.io-client';

import {
  API_URL,
  type SupportConversation,
  type SupportMessage,
} from '@/components/api';

export type ChatConnectionState = 'connecting' | 'connected' | 'disconnected';

type ChatSocketOptions = {
  token: string;
  role?: 'customer' | 'visitor';
  conversationId?: string;
  onMessage?: (message: SupportMessage) => void;
  onConversation?: (conversation: SupportConversation) => void;
  onTyping?: (event: {
    conversation_id: string;
    role?: 'customer' | 'admin';
    sender_id?: string;
    is_typing: boolean;
  }) => void;
  onConnectionChange?: (state: ChatConnectionState) => void;
};

export type ChatSocketSession = {
  socket: Socket;
  teardown: () => void;
};

function eventData<T>(payload: T | { data?: T }): T | null {
  if (!payload || typeof payload !== 'object') return null;
  if ('data' in payload && payload.data) return payload.data;
  return payload as T;
}

/** Abre uma sessão Socket.IO autenticada e devolve um teardown idempotente. */
export function connectChatSocket({
  token,
  role = 'customer',
  conversationId,
  onMessage,
  onConversation,
  onTyping,
  onConnectionChange,
}: ChatSocketOptions): ChatSocketSession {
  let closed = false;
  onConnectionChange?.('connecting');

  const socket = io(API_URL, {
    auth: { token, role },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8_000,
    randomizationFactor: 0.35,
    timeout: 12_000,
    transports: ['websocket', 'polling'],
  });

  const handleConnect = () => {
    onConnectionChange?.('connected');
    if (conversationId) socket.emit('support:join', { conversation_id: conversationId });
  };
  const handleDisconnect = () => {
    if (!closed) onConnectionChange?.('disconnected');
  };
  const handleError = () => {
    if (!closed) onConnectionChange?.('disconnected');
  };
  const handleMessage = (payload: SupportMessage | { data?: SupportMessage }) => {
    const message = eventData(payload);
    if (message?.id) onMessage?.(message);
  };
  const handleConversation = (
    payload: SupportConversation | { data?: SupportConversation },
  ) => {
    const conversation = eventData(payload);
    if (conversation?.id) onConversation?.(conversation);
  };
  const handleTyping = (payload: {
    conversation_id?: string;
    role?: 'customer' | 'admin';
    sender_id?: string;
    is_typing?: boolean;
  }) => {
    if (!payload?.conversation_id) return;
    onTyping?.({
      conversation_id: payload.conversation_id,
      role: payload.role,
      sender_id: payload.sender_id,
      is_typing: payload.is_typing === true,
    });
  };

  socket.on('connect', handleConnect);
  socket.on('disconnect', handleDisconnect);
  socket.on('connect_error', handleError);
  socket.on('support:message', handleMessage);
  socket.on('support:conversation', handleConversation);
  socket.on('support:typing', handleTyping);

  return {
    socket,
    teardown: () => {
      if (closed) return;
      closed = true;
      if (conversationId) socket.emit('support:leave', { conversation_id: conversationId });
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleError);
      socket.off('support:message', handleMessage);
      socket.off('support:conversation', handleConversation);
      socket.off('support:typing', handleTyping);
      socket.disconnect();
      onConnectionChange?.('disconnected');
    },
  };
}

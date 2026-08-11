import { io, type Socket } from 'socket.io-client';

import {
  API_URL,
  type DirectConversation,
  type SupportConversation,
  type SupportMessage,
} from '@/components/api';

export type ChatConnectionState = 'connecting' | 'connected' | 'disconnected';

type ChatSocketOptions = {
  token: string;
  conversationId?: string;
  channel?: 'support' | 'direct';
  onMessage?: (message: SupportMessage) => void;
  onConversation?: (conversation: SupportConversation | DirectConversation) => void;
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
  conversationId,
  channel = 'support',
  onMessage,
  onConversation,
  onTyping,
  onConnectionChange,
}: ChatSocketOptions): ChatSocketSession {
  let closed = false;
  onConnectionChange?.('connecting');

  const socket = io(API_URL, {
    auth: { token, role: 'customer' },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8_000,
    randomizationFactor: 0.35,
    timeout: 12_000,
    transports: ['websocket', 'polling'],
  });

  const joinEvent = channel === 'direct' ? 'direct:join' : 'support:join';
  const leaveEvent = channel === 'direct' ? 'direct:leave' : 'support:leave';
  const messageEvent = channel === 'direct' ? 'direct:message' : 'support:message';
  const conversationEvent = channel === 'direct' ? 'direct:conversation' : 'support:conversation';
  const typingEvent = channel === 'direct' ? 'direct:typing' : 'support:typing';

  const handleConnect = () => {
    onConnectionChange?.('connected');
    if (conversationId) socket.emit(joinEvent, { conversation_id: conversationId });
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
    payload: SupportConversation | DirectConversation | { data?: SupportConversation | DirectConversation },
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
  socket.on(messageEvent, handleMessage);
  socket.on(conversationEvent, handleConversation);
  socket.on(typingEvent, handleTyping);

  return {
    socket,
    teardown: () => {
      if (closed) return;
      closed = true;
      if (conversationId) socket.emit(leaveEvent, { conversation_id: conversationId });
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleError);
      socket.off(messageEvent, handleMessage);
      socket.off(conversationEvent, handleConversation);
      socket.off(typingEvent, handleTyping);
      socket.disconnect();
      onConnectionChange?.('disconnected');
    },
  };
}

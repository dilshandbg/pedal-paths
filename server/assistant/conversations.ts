import { randomUUID } from 'node:crypto';
import type { ChatMessage } from './llm/types';

/*
 * Assistant conversations, in the backend's memory only (OD-33): lost when it stops. At most
 * `maxConversations` are kept; the least recently used is dropped first.
 */

export const MAX_CONVERSATIONS = 20;

export interface ConversationStore {
  create(): string;
  has(id: string): boolean;
  messages(id: string): readonly ChatMessage[] | null;
  /** Appends a completed turn. Returns false when the conversation no longer exists. */
  append(id: string, messages: readonly ChatMessage[]): boolean;
  /** Marks a question in progress; false when one already is, or the conversation is gone. */
  begin(id: string): boolean;
  end(id: string): void;
  remove(id: string): void;
}

interface Conversation {
  messages: readonly ChatMessage[];
  busy: boolean;
}

export function createConversationStore(
  maxConversations = MAX_CONVERSATIONS,
  newId: () => string = randomUUID,
): ConversationStore {
  // A Map keeps insertion order: re-inserting on use makes the first entry the least recent.
  const conversations = new Map<string, Conversation>();
  const touch = (id: string) => {
    const conversation = conversations.get(id);
    if (conversation) {
      conversations.delete(id);
      conversations.set(id, conversation);
    }
    return conversation;
  };
  return {
    create() {
      const id = newId();
      conversations.set(id, { messages: [], busy: false });
      while (conversations.size > maxConversations) {
        const oldest = [...conversations.entries()].find(([, c]) => !c.busy)?.[0];
        if (oldest === undefined) break;
        conversations.delete(oldest);
      }
      return id;
    },
    has: (id) => conversations.has(id),
    messages: (id) => touch(id)?.messages ?? null,
    append(id, messages) {
      const conversation = touch(id);
      if (!conversation) return false;
      conversation.messages = [...conversation.messages, ...messages];
      return true;
    },
    begin(id) {
      const conversation = touch(id);
      if (!conversation || conversation.busy) return false;
      conversation.busy = true;
      return true;
    },
    end(id) {
      const conversation = conversations.get(id);
      if (conversation) conversation.busy = false;
    },
    remove: (id) => void conversations.delete(id),
  };
}

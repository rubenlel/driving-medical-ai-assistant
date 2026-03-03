export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ConversationState {
  id: string;
  history: ConversationMessage[];
  turn: number;
  /** Accumulated clinical context from all user messages */
  cumulative_context: string;
  /** Facts accumulated across the conversation */
  cumulative_facts: Record<string, boolean | null> | null;
}

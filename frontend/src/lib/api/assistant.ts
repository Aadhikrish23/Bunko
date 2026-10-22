import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

/** One reply from POST /assistant/chat (openapi AssistantReply, SRS §20.6). */
export interface AssistantReply {
  success: boolean;
  status: 'SUCCESS' | 'PARTIAL' | 'CLARIFICATION_REQUIRED' | 'CONFIRMATION_REQUIRED' | 'CANCELLED' | 'LIMITED' | 'FAILED';
  message: string;
  clarificationRequest?: {
    question?: string;
    reason?: string;
    candidates: { id: string; label: string }[];
  };
}

// Everything the assistant can change; refreshed after a reply that may have changed something.
const LIBRARY_KEYS = [['works'], ['shelves'], ['review'], ['notes'], ['statistics'], ['journal'], ['shelf-arrangement']];

export function useAssistantChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => api.post<AssistantReply>('/assistant/chat', { message }),
    onSuccess: (reply) => {
      if (reply.status === 'SUCCESS' || reply.status === 'PARTIAL') {
        for (const queryKey of LIBRARY_KEYS) void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}

export function useResetAssistant() {
  return useMutation({ mutationFn: () => api.post<{ cleared: boolean }>('/assistant/reset') });
}

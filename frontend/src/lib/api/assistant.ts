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
        // A book the assistant adds without a cover gets one found on the server a few
        // seconds later (library.service.ts fillCoverInBackground); nothing pushes that
        // update to the client, so the library grid kept the placeholder until the
        // reader happened to revisit later (R5-08).
        setTimeout(() => queryClient.invalidateQueries({ queryKey: ['works'] }), 6_000);
      }
    },
  });
}

export function useResetAssistant() {
  return useMutation({ mutationFn: () => api.post<{ cleared: boolean }>('/assistant/reset') });
}

import { useState, useCallback } from 'react';
import { generateId } from '@/lib/utils';

export type InfoBarSeverity = 'success' | 'warning' | 'error' | 'info';

export interface InfoBarMessage {
  id: string;
  severity: InfoBarSeverity;
  title: string;
  description?: string;
  autoDismissMs?: number;
}

export function useInfoBar() {
  const [messages, setMessages] = useState<InfoBarMessage[]>([]);

  const dismissMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addMessage = useCallback(
    (msg: Omit<InfoBarMessage, 'id'>) => {
      const id = generateId();
      const full: InfoBarMessage = { ...msg, id };
      setMessages((prev) => [...prev, full]);
      if (msg.autoDismissMs) {
        setTimeout(() => dismissMessage(id), msg.autoDismissMs);
      }
      return id;
    },
    [dismissMessage],
  );

  return { messages, addMessage, dismissMessage };
}

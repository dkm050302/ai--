import { api } from './api';
import type { ActionCategory } from '@/types/action';

interface ActionEvent {
  category: ActionCategory;
  action: string;
  detail?: any;
  page?: string;
}

let buffer: ActionEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function getCurrentPage(): string {
  return window.location.pathname;
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, buffer.length);
    try {
      await api.post('/api/actions/log-batch', { actions: batch });
    } catch {
      // 静默失败，不阻塞用户体验
    }
  }, 2000);
}

export function trackAction(
  category: ActionCategory,
  action: string,
  detail?: any,
): void {
  buffer.push({
    category,
    action,
    detail,
    page: getCurrentPage(),
  });
  scheduleFlush();
}

export function trackPageVisit(path: string): void {
  trackAction('page_visit', `visit:${path}`, { path });
}

export function trackAIQuestion(question: string, pageTitle: string): void {
  trackAction('ai_question', 'ask_page_assistant', { question, pageTitle });
}

export function trackSuggestion(content: string): void {
  trackAction('suggestion', 'submit_feedback', { content });
}

export function flushActions(): void {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  const token = localStorage.getItem('token');
  try {
    navigator.sendBeacon(
      '/api/actions/log-batch',
      JSON.stringify({ actions: batch, token }),
    );
  } catch {
    // 静默失败
  }
}

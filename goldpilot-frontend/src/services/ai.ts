/**
 * AI分析服务
 */

import { authFetch } from '@/utils/apiConfig';
import type { PaperAccount } from './research';

/**
 * AI分析请求数据
 */
export interface AIAnalysisRequest {
  candles: any[];
  currentPrice: number;
  events: any[];
  flashes: any[];
  signals: any[];
}

/**
 * AI分析结果
 */
export interface AIAnalysisResult {
  reportId?: string;
  createdAt?: string;
  decision: {
    headline: string;
    summary: string;
    eventCountdown: string;
    aiReason: string;
  };
  probability: {
    upProb: number;
    downProb: number;
    reason: string;
  };
  risk: {
    risk: number;
    riskLevel: 'low' | 'medium' | 'high';
    positionAdvice: number;
    stopLoss: number;
    reason: string;
  };
  actions: Array<{
    title: string;
    text: string;
  }>;
  paperTrading?: {
    decisions: Array<{
      profileId: string;
      name: string;
      action: string;
      direction?: 'long' | 'short';
      volume?: number;
      reason: string;
    }>;
    accounts: PaperAccount[];
  };
}

export interface AIAnalysisStreamCallbacks {
  onStatus?: (message: string) => void;
  onToken?: (token: string) => void;
  onResult?: (result: AIAnalysisResult) => void;
  onDone?: () => void;
}

export interface PageAssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PageAssistantResponse {
  mode: 'llm' | 'local';
  modelName?: string;
  answer: string;
  suggestedQuestions: string[];
}

export interface PageAssistantStreamCallbacks {
  onStatus?: (message: string) => void;
  onToken?: (token: string) => void;
}

class AIService {
  /**
   * 页面上下文助手
   */
  async askPageAssistant(data: {
    pageTitle: string;
    question: string;
    context: unknown;
    history: PageAssistantMessage[];
  }): Promise<PageAssistantResponse> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 35000);

    try {
      const response = await authFetch('/api/ai/page-assistant', {
        method: 'POST',
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || `页面助手请求失败: ${response.status}`);
      }

      return result.data;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  /**
   * 页面上下文助手（流式）
   */
  async askPageAssistantStream(
    data: {
      pageTitle: string;
      question: string;
      context: unknown;
      history: PageAssistantMessage[];
    },
    callbacks: PageAssistantStreamCallbacks = {}
  ): Promise<PageAssistantResponse> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);

    try {
      const response = await authFetch('/api/ai/page-assistant-stream', {
        method: 'POST',
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.message || `页面助手请求失败: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';
      let finalMeta: Omit<PageAssistantResponse, 'answer'> | undefined;

      const handleBlock = (block: string) => {
        let event = 'message';
        const dataLines: string[] = [];

        block.split('\n').forEach((line) => {
          if (line.startsWith('event:')) {
            event = line.replace(/^event:\s*/, '').trim();
          }

          if (line.startsWith('data:')) {
            dataLines.push(line.replace(/^data:\s*/, ''));
          }
        });

        if (!dataLines.length) return;
        const payload = JSON.parse(dataLines.join('\n'));

        if (event === 'status') {
          callbacks.onStatus?.(payload.message || '');
        } else if (event === 'token') {
          const token = payload.token || '';
          answer += token;
          callbacks.onToken?.(token);
        } else if (event === 'done') {
          finalMeta = {
            mode: payload.mode || 'local',
            modelName: payload.modelName,
            suggestedQuestions: Array.isArray(payload.suggestedQuestions) ? payload.suggestedQuestions : [],
          };
        } else if (event === 'error') {
          throw new Error(payload.message || '页面助手回答失败');
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        const blocks = buffer.split(/\n\n/);
        buffer = blocks.pop() || '';
        for (const block of blocks) {
          handleBlock(block);
        }
      }

      if (buffer.trim()) {
        handleBlock(buffer);
      }

      if (!answer.trim()) {
        throw new Error('页面助手没有返回内容');
      }

      const meta = finalMeta as Omit<PageAssistantResponse, 'answer'> | undefined;

      return {
        mode: meta?.mode || 'local',
        modelName: meta?.modelName,
        suggestedQuestions: meta?.suggestedQuestions || [],
        answer,
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  /**
   * 执行AI市场分析
   */
  async analyzeMarket(data: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const response = await authFetch('/api/ai/analyze', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'AI分析失败');
    }

    return result.data;
  }

  /**
   * 执行AI市场分析（流式）
   */
  async analyzeMarketStream(
    data: AIAnalysisRequest,
    callbacks: AIAnalysisStreamCallbacks = {}
  ): Promise<AIAnalysisResult> {
    const response = await authFetch('/api/ai/analyze-stream', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (!response.ok || !response.body) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(errorBody?.message || `AI分析失败: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: AIAnalysisResult | null = null;

    const handleBlock = (block: string) => {
      let event = 'message';
      const dataLines: string[] = [];

      block.split('\n').forEach((line) => {
        if (line.startsWith('event:')) {
          event = line.replace(/^event:\s*/, '').trim();
        }

        if (line.startsWith('data:')) {
          dataLines.push(line.replace(/^data:\s*/, ''));
        }
      });

      if (dataLines.length === 0) {
        return;
      }

      const payload = JSON.parse(dataLines.join('\n'));

      if (event === 'status') {
        callbacks.onStatus?.(payload.message || '');
      } else if (event === 'token') {
        callbacks.onToken?.(payload.token || '');
      } else if (event === 'result') {
        finalResult = payload as AIAnalysisResult;
        callbacks.onResult?.(finalResult);
      } else if (event === 'done') {
        callbacks.onDone?.();
      } else if (event === 'error') {
        throw new Error(payload.message || 'AI分析失败');
      }
    };

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const blocks = buffer.split(/\n\n/);
      buffer = blocks.pop() || '';
      blocks.forEach(handleBlock);
    }

    if (buffer.trim()) {
      handleBlock(buffer);
    }

    if (!finalResult) {
      throw new Error('AI分析没有返回结果');
    }

    return finalResult;
  }
}

export const aiService = new AIService();

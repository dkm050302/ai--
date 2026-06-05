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

class AIService {
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

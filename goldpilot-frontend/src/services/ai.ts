/**
 * AI分析服务
 */

import { authFetch } from '@/utils/apiConfig';

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
}

export const aiService = new AIService();

/**
 * AI分析控制器 - 处理市场分析相关请求
 */

import { Request, Response } from 'express';
import { getUserApiKey } from './ai';
import { logger } from '../utils/logger';

/**
 * AI分析请求接口
 */
interface AnalysisRequest {
  candles: any[];
  currentPrice: number;
  events: any[];
  flashes: any[];
  signals: any[];
}

/**
 * AI分析响应接口
 */
interface AnalysisResult {
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

/**
 * 执行AI市场分析
 * POST /api/ai/analyze
 */
export async function analyzeMarket(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const { candles, currentPrice, events, flashes, signals } = req.body as AnalysisRequest;

    // 获取用户的API Key
    const apiKey = await getUserApiKey(req.user.accountId);

    if (!apiKey) {
      res.status(400).json({
        success: false,
        message: '未配置AI服务，请先在AI账号页面配置DeepSeek API Key'
      });
      return;
    }

    logger.info(`[AI分析] 用户 ${req.user.accountId} 请求市场分析`);

    // 构建分析提示词
    const prompt = buildAnalysisPrompt({
      candles: candles?.slice(-50), // 只用最近50根K线
      currentPrice,
      events: events?.slice(0, 5), // 最近5条事件
      flashes: flashes?.slice(0, 5), // 最近5条快讯
      signals: signals?.slice(-3), // 最近3个信号
    });

    // 调用DeepSeek API
    const analysis = await callDeepSeekAPI(apiKey, prompt);

    logger.info(`[AI分析] 分析完成`);
    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    logger.error('[AI分析] 分析失败:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'AI分析失败'
    });
  }
}

/**
 * 构建AI分析提示词
 */
function buildAnalysisPrompt(data: any): string {
  const { candles, currentPrice, events, flashes, signals } = data;

  // 计算基本指标
  const latestCandle = candles?.[candles.length - 1];
  const price = currentPrice || latestCandle?.close || 0;

  // 格式化K线数据摘要
  const candleSummary = candles
    ? `最近${candles.length}根K线，开盘${candles[0]?.close?.toFixed(2)}，当前${price.toFixed(2)}，` +
      `最高${Math.max(...candles.map(c => c.high)).toFixed(2)}，` +
      `最低${Math.min(...candles.map(c => c.low)).toFixed(2)}`
    : '无K线数据';

  // 格式化事件
  const eventsText = events && events.length > 0
    ? events.map((e: any) => `[${e.time}] ${e.text}`).join('\n')
    : '无重要事件';

  // 格式化快讯
  const flashesText = flashes && flashes.length > 0
    ? flashes.slice(0, 3).map((f: any) => `[${f.time}] ${f.text}${f.hot ? ' 🔥' : ''}`).join('\n')
    : '无市场快讯';

  // 格式化信号
  const signalsText = signals && signals.length > 0
    ? signals.map((s: any) =>
      `${s.direction === 'long' ? '做多' : '做空'} @${s.entryPrice} TP:${s.takeProfit} ${s.status}`
    ).join('\n')
    : '无交易信号';

  return `你是一个专业的黄金交易分析师。请基于以下数据进行分析，并返回JSON格式结果。

## 当前数据
- 黄金价格：${price.toFixed(2)}美元/盎司
- ${candleSummary}

## 近期事件
${eventsText}

## 市场快讯
${flashesText}

## 交易信号
${signalsText}

## 分析要求
请提供专业的黄金市场分析，返回严格的JSON格式：

\`\`\`json
{
  "decision": {
    "headline": "简短标题（10-15字）",
    "summary": "综合分析摘要（30-50字）",
    "eventCountdown": "重点关注事项",
    "aiReason": "分析依据（50-80字）"
  },
  "probability": {
    "upProb": 0-100之间的数字,
    "downProb": 0-100之间的数字,
    "reason": "涨跌概率分析依据"
  },
  "risk": {
    "risk": 0-100之间的数字,
    "riskLevel": "low"或"medium"或"high",
    "positionAdvice": 0-100之间的建议仓位百分比,
    "stopLoss": 1-5之间的止损百分比,
    "reason": "风险评估依据"
  },
  "actions": [
    {"title": "客户提醒", "text": "具体的客户提醒内容"},
    {"title": "交易动作", "text": "具体的交易建议"},
    {"title": "风险控制", "text": "具体的风险控制措施"}
  ]
}
\`\`\`

注意：
1. upProb + downProb 应该接近100
2. positionAdvice 应该根据风险等级调整
3. stopLoss 通常在1.5%到3%之间
4. 分析要客观理性，避免极端判断
5. 只返回JSON，不要其他内容`;
}

/**
 * 调用DeepSeek API
 */
async function callDeepSeekAPI(apiKey: string, prompt: string): Promise<AnalysisResult> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API请求失败: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '';

  // 提取JSON内容
  const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
                   content.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error('AI返回内容格式错误');
  }

  const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);

  // 验证返回数据结构
  if (!result.decision || !result.probability || !result.risk || !result.actions) {
    throw new Error('AI返回数据结构不完整');
  }

  return result;
}

/**
 * AI分析控制器 - 处理市场分析相关请求
 */

import { Request, Response } from 'express';
import { TextDecoder } from 'util';
import { getUserApiKey } from './ai';
import { logger } from '../utils/logger';
import { AnalysisReportModel } from '../models/AnalysisReport';
import { executePaperTradingForReport } from './research';
import { DEEPSEEK_MODEL, getDeepSeekChatCompletionsUrl } from '../config';

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

interface PageAssistantRequest {
  pageTitle?: string;
  question?: string;
  context?: unknown;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

const PAGE_ASSISTANT_TIMEOUT_MS = 25_000;
const PAGE_ASSISTANT_MODEL = process.env.PAGE_ASSISTANT_MODEL || 'deepseek-v4-flash';

/**
 * 页面上下文助手
 * POST /api/ai/page-assistant
 */
export async function askPageAssistant(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const { pageTitle, question, context, history } = req.body as PageAssistantRequest;
    const normalizedQuestion = String(question || '').trim();

    if (!normalizedQuestion) {
      res.status(400).json({ success: false, message: '请输入问题' });
      return;
    }

    const apiKey = await getUserApiKey(req.user.accountId);
    const suggestedQuestions = buildPageAssistantSuggestions(context);

    if (!apiKey) {
      res.json({
        success: true,
        data: {
          mode: 'local',
          answer: buildLocalPageAssistantAnswer(normalizedQuestion, context, '当前没有可用的大模型配置，我先按页面数据回答。'),
          suggestedQuestions,
        },
      });
      return;
    }

    try {
      const answer = await callPageAssistantLLM({
        apiKey,
        pageTitle: pageTitle || 'GoldPilot 页面',
        question: normalizedQuestion,
        context,
        history: Array.isArray(history) ? history.slice(-6) : [],
      });

      res.json({
        success: true,
        data: {
          mode: 'llm',
          modelName: PAGE_ASSISTANT_MODEL,
          answer,
          suggestedQuestions,
        },
      });
    } catch (error) {
      logger.warn('[页面助手] LLM回答失败，回退到本地摘要:', error);
      res.json({
        success: true,
        data: {
          mode: 'local',
          answer: buildLocalPageAssistantAnswer(normalizedQuestion, context, '大模型暂时没有返回，我先按页面数据给你一个可用结论。'),
          suggestedQuestions,
        },
      });
    }
  } catch (error) {
    logger.error('[页面助手] 回答失败:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '页面助手回答失败',
    });
  }
}

/**
 * 页面上下文助手（流式）
 * POST /api/ai/page-assistant-stream
 */
export async function askPageAssistantStream(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: '未授权' });
    return;
  }

  const { pageTitle, question, context, history } = req.body as PageAssistantRequest;
  const normalizedQuestion = String(question || '').trim();

  if (!normalizedQuestion) {
    res.status(400).json({ success: false, message: '请输入问题' });
    return;
  }

  const suggestedQuestions = buildPageAssistantSuggestions(context);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    const apiKey = await getUserApiKey(req.user.accountId);

    if (!apiKey) {
      sendStreamEvent(res, 'status', { message: '未配置大模型，使用本地页面摘要。' });
      await streamLocalPageAssistantAnswer(
        res,
        buildLocalPageAssistantAnswer(normalizedQuestion, context, '当前没有可用的大模型配置，我先按页面数据回答。'),
        suggestedQuestions
      );
      return;
    }

    sendStreamEvent(res, 'status', { message: `正在调用 ${PAGE_ASSISTANT_MODEL}...` });

    await callPageAssistantLLMStream({
      apiKey,
      pageTitle: pageTitle || 'GoldPilot 页面',
      question: normalizedQuestion,
      context,
      history: Array.isArray(history) ? history.slice(-6) : [],
      onToken: (token) => sendStreamEvent(res, 'token', { token }),
    });

    sendStreamEvent(res, 'done', {
      mode: 'llm',
      modelName: PAGE_ASSISTANT_MODEL,
      suggestedQuestions,
    });
    res.end();
  } catch (error) {
    logger.warn('[页面助手] 流式LLM回答失败，回退到本地摘要:', error);

    if (!res.writableEnded) {
      sendStreamEvent(res, 'status', { message: '大模型暂时没有返回，使用本地页面摘要。' });
      await streamLocalPageAssistantAnswer(
        res,
        buildLocalPageAssistantAnswer(normalizedQuestion, context, '大模型暂时没有返回，我先按页面数据给你一个可用结论。'),
        suggestedQuestions
      );
    }
  }
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
    const { report, paperTrading } = await saveAnalysisReportAndPaperTrading(req.user.accountId, req.body as AnalysisRequest, analysis);

    logger.info(`[AI分析] 分析完成`);
    res.json({
      success: true,
      data: {
        ...analysis,
        reportId: report._id.toString(),
        paperTrading: {
          decisions: paperTrading.decisions,
          accounts: paperTrading.accounts,
        },
      }
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
 * 执行AI市场分析（流式）
 * POST /api/ai/analyze-stream
 */
export async function analyzeMarketStream(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: '未授权' });
    return;
  }

  const requestData = req.body as AnalysisRequest;
  const { candles, currentPrice, events, flashes, signals } = requestData;

  try {
    const apiKey = await getUserApiKey(req.user.accountId);

    if (!apiKey) {
      res.status(400).json({
        success: false,
        message: '未配置AI服务，请先在AI账号页面配置DeepSeek API Key'
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    sendStreamEvent(res, 'status', { message: '正在整理K线、事件和交易信号...' });

    const prompt = buildAnalysisPrompt({
      candles: candles?.slice(-50),
      currentPrice,
      events: events?.slice(0, 5),
      flashes: flashes?.slice(0, 5),
      signals: signals?.slice(-3),
    });

    sendStreamEvent(res, 'status', { message: `正在调用 ${DEEPSEEK_MODEL} 进行流式分析...` });

    const response = await fetch(getDeepSeekChatCompletionsUrl(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `API请求失败: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const blocks = buffer.split(/\n\n/);
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        const lines = block.split('\n').filter((line) => line.startsWith('data:'));

        for (const line of lines) {
          const data = line.replace(/^data:\s*/, '').trim();

          if (!data || data === '[DONE]') {
            continue;
          }

          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content || '';

          if (token) {
            content += token;
            sendStreamEvent(res, 'token', { token });
          }
        }
      }
    }

    const analysis = parseAnalysisContent(content);
    const { report, paperTrading } = await saveAnalysisReportAndPaperTrading(req.user.accountId, requestData, analysis);

    sendStreamEvent(res, 'result', {
      ...analysis,
      reportId: report._id.toString(),
      createdAt: report.createdAt,
      paperTrading: {
        decisions: paperTrading.decisions,
        accounts: paperTrading.accounts,
      },
    });
    sendStreamEvent(res, 'done', { message: 'AI分析完成' });
    res.end();
  } catch (error) {
    logger.error('[AI分析] 流式分析失败:', error);
    const message = error instanceof Error ? error.message : 'AI分析失败';

    if (!res.headersSent) {
      res.status(500).json({ success: false, message });
      return;
    }

    sendStreamEvent(res, 'error', { message });
    res.end();
  }
}

function sendStreamEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function saveAnalysisReportAndPaperTrading(
  userAccountId: string,
  requestData: AnalysisRequest,
  analysis: AnalysisResult
) {
  const { candles, currentPrice, events, flashes, signals } = requestData;
  const report = await AnalysisReportModel.create({
    userAccountId,
    modelName: DEEPSEEK_MODEL,
    promptVersion: 'goldpilot-analysis-v1',
    currentPrice: currentPrice || candles?.[candles.length - 1]?.close || 0,
    candleCount: candles?.length || 0,
    events: events || [],
    flashes: flashes || [],
    signals: signals || [],
    result: analysis,
  });
  const paperTrading = await executePaperTradingForReport(userAccountId, report._id.toString());

  return { report, paperTrading };
}

function parseAnalysisContent(content: string): AnalysisResult {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                   content.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error('AI返回内容格式错误');
  }

  const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);

  if (!result.decision || !result.probability || !result.risk || !result.actions) {
    throw new Error('AI返回数据结构不完整');
  }

  return result;
}

function safeStringify(value: unknown, maxLength = 12000): string {
  try {
    return JSON.stringify(value || {}, null, 2).slice(0, maxLength);
  } catch {
    return String(value || '').slice(0, maxLength);
  }
}

function buildPageAssistantSuggestions(context: unknown): string[] {
  const data = context as any;
  const latestRun = data?.latestStrategyRun;
  const historyCaches = Array.isArray(data?.historyCaches) ? data.historyCaches : [];
  const suggestions = [
    '这页当前最需要注意什么？',
    '历史数据清洗后还能不能用于回测？',
    '哪个策略现在表现最好？',
  ];

  if (latestRun?.recommendation?.name) {
    suggestions[2] = `为什么推荐 ${latestRun.recommendation.name}？`;
  }

  if (historyCaches.some((item: any) => Number(item?.session?.removedWeekendCount || 0) > 0)) {
    suggestions[1] = '剔除周末K线后数据质量怎么样？';
  }

  return suggestions;
}

function buildLocalPageAssistantAnswer(question: string, context: unknown, prefix: string): string {
  const data = context as any;
  const historyCaches = Array.isArray(data?.historyCaches) ? data.historyCaches : [];
  const latestRun = data?.latestStrategyRun;
  const paperTrading = data?.paperTrading;
  const liveTrading = data?.liveTrading;
  const strategyOverrides = data?.strategyOverrides || {};
  const lines: string[] = [prefix];

  if (/历史|数据|清洗|周末|缺口/.test(question) && historyCaches.length) {
    const items = historyCaches
      .slice(0, 4)
      .map((item: any) => {
        const tradable = Number(item?.session?.tradableCount || item?.candleCount || 0).toLocaleString();
        const raw = Number(item?.candleCount || 0).toLocaleString();
        const removed = Number(item?.session?.removedWeekendCount || 0).toLocaleString();
        const gaps = Number(item?.session?.gapCount ?? item?.quality?.gapCount ?? 0).toLocaleString();
        return `- ${item.period}: 可交易 ${tradable} 根，原始 ${raw} 根，剔除周末 ${removed} 根，清洗缺口 ${gaps} 个。`;
      });
    lines.push('当前历史数据状态：', ...items);
    return lines.join('\n');
  }

  if (/策略|推荐|筛选|回测|表现/.test(question)) {
    if (latestRun?.recommendation?.name) {
      lines.push(`最近筛选推荐：${latestRun.recommendation.name}，评分 ${latestRun.recommendation.score ?? '-'}。`);
      lines.push(`依据：${latestRun.recommendation.reason || '页面暂未给出详细依据。'}`);
    } else {
      lines.push('当前还没有足够稳定的策略推荐，建议先扩大历史样本或降低交易频率。');
    }

    const overridesCount = Object.keys(strategyOverrides).length;
    lines.push(overridesCount ? `当前已有 ${overridesCount} 个策略参数被修改。` : '当前策略参数仍是默认状态。');
    return lines.join('\n');
  }

  lines.push(`页面：${data?.pageTitle || '量化策略实验室'}`);
  lines.push(`历史缓存：${historyCaches.length || 0} 组。`);
  lines.push(`模拟盘流水：${paperTrading?.tradeCount ?? 0} 笔；实盘持仓/快照：${liveTrading?.positionCount ?? 0} 个。`);

  if (latestRun?.candleCount) {
    lines.push(`最近筛选使用 ${Number(latestRun.candleCount).toLocaleString()} 根 ${latestRun.period} K线。`);
  }

  lines.push('你可以继续问：数据质量、策略推荐原因、参数怎么调、下一步该跑什么筛选。');
  return lines.join('\n');
}

async function streamLocalPageAssistantAnswer(
  res: Response,
  answer: string,
  suggestedQuestions: string[]
): Promise<void> {
  const chunks = answer.match(/[\s\S]{1,12}/g) || [answer];

  for (const token of chunks) {
    if (res.writableEnded) return;
    sendStreamEvent(res, 'token', { token });
    await new Promise((resolve) => setTimeout(resolve, 8));
  }

  if (!res.writableEnded) {
    sendStreamEvent(res, 'done', {
      mode: 'local',
      suggestedQuestions,
    });
    res.end();
  }
}

function buildPageAssistantPrompt(input: {
  pageTitle: string;
  question: string;
  context: unknown;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): string {
  return [
    '你是 GoldPilot 页面小助手，只回答当前页面相关问题。',
    '要求：',
    '1. 用中文，直接、简洁、可执行。',
    '2. 只能依据页面上下文回答；没有数据就明确说页面没有显示。',
    '3. 不编造收益、实盘交易或外部新闻。',
    '4. 涉及交易建议时强调这是研究/复盘辅助，不是保证收益。',
    `页面标题：${input.pageTitle}`,
    `页面上下文：${safeStringify(input.context)}`,
    `最近对话：${safeStringify(input.history, 3000)}`,
    `用户问题：${input.question}`,
  ].join('\n\n');
}

async function callPageAssistantLLM(input: {
  apiKey: string;
  pageTitle: string;
  question: string;
  context: unknown;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<string> {
  const prompt = buildPageAssistantPrompt(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_ASSISTANT_TIMEOUT_MS);

  try {
    const response = await fetch(getDeepSeekChatCompletionsUrl(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PAGE_ASSISTANT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 900,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `API请求失败: ${response.status}`);
    }

    const data: any = await response.json();
    const content = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!content) {
      throw new Error('大模型返回空内容');
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`页面助手请求超过 ${Math.round(PAGE_ASSISTANT_TIMEOUT_MS / 1000)} 秒`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callPageAssistantLLMStream(input: {
  apiKey: string;
  pageTitle: string;
  question: string;
  context: unknown;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  onToken: (token: string) => void;
}): Promise<string> {
  const prompt = buildPageAssistantPrompt(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_ASSISTANT_TIMEOUT_MS + 15_000);
  let content = '';

  try {
    const response = await fetch(getDeepSeekChatCompletionsUrl(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PAGE_ASSISTANT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 900,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `API请求失败: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const blocks = buffer.split(/\n\n/);
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        const lines = block.split('\n').filter((line) => line.startsWith('data:'));

        for (const line of lines) {
          const data = line.replace(/^data:\s*/, '').trim();
          if (!data || data === '[DONE]') continue;

          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content || '';

          if (token) {
            content += token;
            input.onToken(token);
          }
        }
      }
    }

    if (!content.trim()) {
      throw new Error('大模型返回空内容');
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`页面助手流式请求超过 ${Math.round((PAGE_ASSISTANT_TIMEOUT_MS + 15_000) / 1000)} 秒`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
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
      `最高${Math.max(...candles.map((c: any) => c.high)).toFixed(2)}，` +
      `最低${Math.min(...candles.map((c: any) => c.low)).toFixed(2)}`
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
  const response = await fetch(getDeepSeekChatCompletionsUrl(), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
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
    const errorData: any = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API请求失败: ${response.status}`);
  }

  const data: any = await response.json();
  const content = data.choices[0]?.message?.content || '';

  return parseAnalysisContent(content);
}

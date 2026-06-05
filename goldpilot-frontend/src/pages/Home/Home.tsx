import { useState, useEffect, useMemo } from 'react';
import { Alert, Button, Card, Space, Tag, message } from 'antd';
import { RobotOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/PageHeader';
import { PriceCard } from '@/components/PriceCard';
import { Chart } from '@/components/Chart';
import { SignalPanel } from '@/components/SignalPanel';
import { DecisionCard } from '@/components/DecisionCard';
import { ProbCard } from '@/components/ProbCard';
import { RiskCard } from '@/components/RiskCard';
import { SupportCard } from '@/components/SupportCard';
import { MiniCard } from '@/components/MiniCard';
import { ActionPanel } from '@/components/ActionPanel';
import { EventList } from '@/components/EventList';
import { createDefaultPriceData } from '@/types/price';
import { createDefaultFlashes } from '@/types/event';
import { createDefaultDecisionData } from '@/types/decision';
import type { PriceData, Candle, Signal, DailyStats, Event, Flash } from '@/types';
import {
  fetchCandles,
  createRealtimeConnection,
  fetchRefreshInterval,
  refreshIntervalToMs,
} from '@/services/marketData';
import { detectSignals } from '@/utils/signalCalculator';
import type { Period } from '@/services/marketData';
import { dataApi, type EconomicEvent, type EventDataMeta, type MarketFlash } from '@/services/data';
import { aiService, type AIAnalysisResult } from '@/services/ai';

const EVENT_DATA_REFRESH_MS = 60 * 60 * 1000;

function getCandleLimit(period: Period): number {
  if (period === '1d') return 220;
  if (period === '4h' || period === '1h') return 260;
  return 360;
}

function formatRefreshLabel(intervalMs: number | null): string {
  if (!intervalMs) return '手动刷新';
  const minutes = Math.max(1, Math.round(intervalMs / 60000));
  return `${minutes}分钟刷新`;
}

function getDataMetaLabel(meta: EventDataMeta | null, fallback: string): string {
  if (!meta) return fallback;
  if (meta.source === 'live') return '实时';
  if (meta.source === 'cache') return '缓存';
  return '模拟';
}

function getDataMetaColor(meta: EventDataMeta | null, fallback: 'blue' | 'amber' | 'red' | 'green') {
  if (!meta) return fallback;
  if (meta.source === 'live') return 'green';
  if (meta.source === 'cache') return 'amber';
  return 'red';
}

function formatLocalDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hasUsableEventRows(items: Event[], meta: EventDataMeta | null): boolean {
  return meta?.source !== 'mock' && items.some((item) => item.source !== '模拟数据');
}

function countVisibleChars(value: string): number {
  return Array.from(value.replace(/\s/g, '')).length;
}

function formatStreamResult(result: AIAnalysisResult): string {
  return [
    '',
    '--- 结构化报告 ---',
    `结论：${result.decision.headline}`,
    `摘要：${result.decision.summary}`,
    `重点：${result.decision.eventCountdown}`,
    `依据：${result.decision.aiReason}`,
    `上涨概率：${result.probability.upProb}%`,
    `下跌概率：${result.probability.downProb}%`,
    `概率依据：${result.probability.reason}`,
    `风险：${result.risk.risk} / ${result.risk.riskLevel}`,
    `建议仓位：${result.risk.positionAdvice}%`,
    `止损：${result.risk.stopLoss}%`,
    `风险依据：${result.risk.reason}`,
    ...result.actions.map((action) => `${action.title}：${action.text}`),
  ].join('\n');
}

/**
 * 计算信号统计数据
 */
function calculateSignalStats(signals: Signal[]): DailyStats {
  // 获取今天的信号
  const today = new Date().setHours(0, 0, 0, 0);
  const todaySignals = signals.filter(s => new Date(s.timestamp).getTime() >= today);

  // 计算统计数据
  const signalCount = todaySignals.length;
  const completedSignals = todaySignals.filter(s => s.status === 'profit' || s.status === 'loss');
  const winSignals = completedSignals.filter(s => s.status === 'profit');
  const lossSignals = completedSignals.filter(s => s.status === 'loss');
  const winCount = winSignals.length;
  const lossCount = lossSignals.length;
  const winRate = completedSignals.length > 0 ? (winSignals.length / completedSignals.length) * 100 : 0;
  const totalProfit = winSignals.reduce((sum, s) => sum + (s.profit || 0), 0);
  const totalLoss = Math.abs(lossSignals.reduce((sum, s) => sum + (s.profit || 0), 0));
  const netProfit = todaySignals.reduce((sum, s) => sum + (s.profit || 0), 0);

  return {
    date: new Date(),
    signalCount,
    winCount,
    lossCount,
    winRate,
    totalProfit,
    totalLoss,
    netProfit,
    upProb: 50,
    downProb: 50,
    risk: 50,
    riskLevel: 'medium',
    positionAdvice: 50,
    stopLoss: 2.5,
  };
}

export function Home() {
  const [period, setPeriod] = useState<Period>('1m');
  const [priceData, setPriceData] = useState<PriceData>(createDefaultPriceData());
  const [candles, setCandles] = useState<Candle[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [candlesError, setCandlesError] = useState<string | null>(null);
  const [marketRefreshMs, setMarketRefreshMs] = useState<number | null>(5 * 60 * 1000);

  // 真实数据状态
  const [events, setEvents] = useState<Event[]>([]);
  const [flashes, setFlashes] = useState<Flash[]>(createDefaultFlashes());
  const [calendarMeta, setCalendarMeta] = useState<EventDataMeta | null>(null);
  const [newsMeta, setNewsMeta] = useState<EventDataMeta | null>(null);
  const hasCalendarData = useMemo(() => hasUsableEventRows(events, calendarMeta), [events, calendarMeta]);
  const importantDataItems = useMemo(() => hasCalendarData ? events.slice(0, 3) : [], [events, hasCalendarData]);
  const importantMatterItems = useMemo(() => hasCalendarData ? events.slice(3, 6) : [], [events, hasCalendarData]);

  // AI分析相关状态
  const [analyzing, setAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [showAnalysisButton, setShowAnalysisButton] = useState(true);
  const [streamText, setStreamText] = useState('');
  const [streamStatus, setStreamStatus] = useState('等待发起分析');
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  const [streamElapsedSeconds, setStreamElapsedSeconds] = useState(0);
  const [lastStreamResult, setLastStreamResult] = useState<AIAnalysisResult | null>(null);
  const todayText = useMemo(() => new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }), []);

  // 计算统计数据（优先使用AI分析结果）
  const stats = useMemo(() => {
    if (aiAnalysis) {
      return {
        date: new Date(),
        signalCount: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        totalProfit: 0,
        totalLoss: 0,
        netProfit: 0,
        upProb: aiAnalysis.probability.upProb,
        downProb: aiAnalysis.probability.downProb,
        risk: aiAnalysis.risk.risk,
        riskLevel: aiAnalysis.risk.riskLevel,
        positionAdvice: aiAnalysis.risk.positionAdvice,
        stopLoss: aiAnalysis.risk.stopLoss,
      };
    }
    return calculateSignalStats(signals);
  }, [signals, aiAnalysis]);

  // 决策数据（优先使用AI分析结果）
  const decisionData = useMemo(() => {
    if (aiAnalysis) {
      return {
        headline: aiAnalysis.decision.headline,
        summary: aiAnalysis.decision.summary,
        eventCountdown: aiAnalysis.decision.eventCountdown,
        aiReason: aiAnalysis.decision.aiReason,
      };
    }
    return createDefaultDecisionData();
  }, [aiAnalysis]);

  useEffect(() => {
    let mounted = true;

    const loadRefreshSetting = async () => {
      try {
        const interval = await fetchRefreshInterval();
        if (mounted) {
          setMarketRefreshMs(refreshIntervalToMs(interval));
        }
      } catch (error) {
        console.warn('读取行情刷新间隔失败，使用默认5分钟:', error);
      }
    };

    loadRefreshSetting();

    const handleRefreshIntervalChange: EventListener = (event) => {
      const interval = (event as unknown as CustomEvent).detail;
      if (interval === '1m' || interval === '5m' || interval === '10m' || interval === 'never') {
        setMarketRefreshMs(refreshIntervalToMs(interval));
      }
    };

    window.addEventListener('goldpilot-refresh-interval-change', handleRefreshIntervalChange);
    return () => {
      mounted = false;
      window.removeEventListener('goldpilot-refresh-interval-change', handleRefreshIntervalChange);
    };
  }, []);

  useEffect(() => {
    if (!analyzing || !streamStartedAt) {
      return undefined;
    }

    const updateElapsed = () => {
      setStreamElapsedSeconds(Math.max(0, Math.floor((Date.now() - streamStartedAt) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [analyzing, streamStartedAt]);

  const streamCharCount = useMemo(() => countVisibleChars(streamText), [streamText]);
  const streamSpeed = streamCharCount > 0 && streamElapsedSeconds > 0
    ? Number((streamCharCount / streamElapsedSeconds).toFixed(1))
    : 0;
  const streamProgressText = streamCharCount > 0
    ? `已输出 ${streamCharCount} 字，${streamElapsedSeconds > 0 ? `用时 ${streamElapsedSeconds} 秒，约 ${streamSpeed} 字/秒` : '用时不足 1 秒'}`
    : `等待首字中，用时 ${streamElapsedSeconds} 秒`;
  const streamTimeText = streamCharCount > 0 && streamElapsedSeconds > 0
    ? `${streamElapsedSeconds}s / ${streamSpeed} 字/秒`
    : `${streamElapsedSeconds}s`;

  // AI建议（优先使用AI分析结果）
  const aiActions = useMemo(() => {
    if (aiAnalysis) {
      return aiAnalysis.actions;
    }
    return [
      { title: '客户提醒', text: '黄金短线偏多，但临近美国事件窗口，建议客户避免追涨满仓。' },
      { title: '交易动作', text: '若回踩第一支撑附近企稳，可关注小仓跟随机会。' },
      { title: '风险控制', text: '事件公布前把单笔风险控制在账户净值的1.2%以内。' },
    ];
  }, [aiAnalysis]);

  // 获取K线数据
  useEffect(() => {
    const loadCandles = async () => {
      try {
        const data = await fetchCandles(period, getCandleLimit(period));
        setCandles(data);

        console.log(`📊 [信号检测] K线数据: ${data.length} 条`);
        console.log(`📊 [信号检测] 前5条:`, data.slice(0, 5));
        console.log(`📊 [信号检测] 后5条:`, data.slice(-5));

        // 调试：打印最新K线时间
        if (data.length > 0) {
          const latest = data[data.length - 1];
          const latestTime = typeof latest.time === 'number'
            ? new Date(latest.time * 1000)
            : new Date(latest.time);
          const now = new Date();
          console.log('🕐 [K线时间] 最新K线:', latestTime.toLocaleString('zh-CN', { hour12: false }));
          console.log('🕐 [K线时间] 当前时间:', now.toLocaleString('zh-CN', { hour12: false }));
          console.log('🕐 [K线时间] 时间差:', Math.floor((now.getTime() - latestTime.getTime()) / 1000), '秒');
        }

        // 计算信号（需要至少233根K线）
        if (data.length >= 233) {
          console.log('🔍 [信号检测] 开始计算 EMA...');
          const detectedSignals = detectSignals(data);
          console.log(`✅ [信号检测] 检测到 ${detectedSignals.length} 个信号:`, detectedSignals);
          setSignals(detectedSignals);
        } else {
          console.warn(`⚠️ K线数据不足（${data.length}条），需要至少233条`);
        }
      } catch (error) {
        console.error('❌ [信号检测] 失败:', error);
        const errorMessage = error instanceof Error ? error.message : 'K线数据获取失败';
        setCandlesError(errorMessage);
        setCandles([]); // 清空K线数据
        setSignals([]); // 清空信号数据
      }
    };

    // 初始加载
    loadCandles();

    if (!marketRefreshMs) {
      return undefined;
    }

    const interval = setInterval(loadCandles, marketRefreshMs);

    return () => clearInterval(interval);
  }, [period, marketRefreshMs]);

  // 加载事件和快讯数据
  useEffect(() => {
    const loadEventData = async () => {
      try {
        // 格式化今天日期
        const today = formatLocalDateParam(new Date());

        // 并行请求经济日历和市场快讯
        const [calendarRes, newsRes] = await Promise.all([
          dataApi.getEconomicCalendar(today).catch(() => ({ success: false, data: [] })),
          dataApi.getMarketNews().catch(() => ({ success: false, data: [] })),
        ]);

        const nextCalendarMeta = 'meta' in calendarRes ? calendarRes.meta || null : null;
        const nextNewsMeta = 'meta' in newsRes ? newsRes.meta || null : null;

        // 转换经济日历数据格式。mock 只表示源不可用，不在首页占位展示。
        if (calendarRes.success && calendarRes.data.length > 0 && nextCalendarMeta?.source !== 'mock') {
          const convertedEvents: Event[] = calendarRes.data
            .slice(0, 10) // 只取前10条
            .map((item: EconomicEvent) => ({
              date: item.date,
              time: item.time,
              star: '⭐'.repeat(item.importance),
              text: `${item.country} ${item.event}`,
              source: item.source,
              sourceUrl: item.sourceUrl,
          }));
          setEvents(convertedEvents);
        } else {
          setEvents([]);
        }
        setCalendarMeta(nextCalendarMeta);

        // 转换市场快讯数据格式
        if (newsRes.success && newsRes.data.length > 0) {
          const convertedFlashes: Flash[] = newsRes.data
            .slice(0, 10) // 只取前10条
            .map((item: MarketFlash) => ({
              date: item.date,
              time: item.time,
              hot: item.hot || false,
              text: item.content,
              source: item.source,
              sourceUrl: item.sourceUrl,
          }));
          setFlashes(convertedFlashes);
        }
        setNewsMeta(nextNewsMeta);

        console.log('✅ [事件数据] 加载成功');
      } catch (error) {
        console.error('❌ [事件数据] 加载失败:', error);
        setEvents([]);
        setFlashes(createDefaultFlashes());
        setCalendarMeta(null);
        setNewsMeta(null);
      }
    };

    // 初始加载
    loadEventData();

    // 每小时刷新一次事件和快讯，减少外部数据源压力
    const interval = setInterval(loadEventData, EVENT_DATA_REFRESH_MS);

    return () => clearInterval(interval);
  }, []);

  // 实时价格更新
  useEffect(() => {
    const cleanup = createRealtimeConnection(
      (price) => {
        setPriceData({
          symbol: price.symbol,
          price: price.price,
          change: price.change,
          changePct: price.changePct,
          high: price.high,
          low: price.low,
          support1: price.price * 0.995,
          support2: price.price * 0.99,
          resistance1: price.price * 1.005,
          timestamp: price.timestamp,
        });
      },
      (error) => {
        console.error('Real-time price error:', error);
      },
      marketRefreshMs
    );

    return cleanup;
  }, [marketRefreshMs]);

  /**
   * 执行AI分析
   */
  const handleAIAnalyze = async () => {
    try {
      setAnalyzing(true);
      setStreamText('');
      setLastStreamResult(null);
      setStreamStatus('准备行情、事件和信号数据...');
      setStreamStartedAt(Date.now());
      setStreamElapsedSeconds(0);
      message.loading({ content: 'AI正在流式分析市场...', key: 'ai-analysis', duration: 0 });

      const result = await aiService.analyzeMarketStream(
        {
          candles: candles.slice(-100), // 最近100根K线
          currentPrice: priceData.price,
          events: events.slice(0, 10),
          flashes: flashes.slice(0, 10),
          signals: signals.slice(-5),
        },
        {
          onStatus: (status) => setStreamStatus(status),
          onToken: (token) => setStreamText((prev) => `${prev}${token}`),
          onResult: (nextResult) => {
            setLastStreamResult(nextResult);
            setStreamText((prev) => `${prev}${formatStreamResult(nextResult)}`);
          },
          onDone: () => setStreamStatus('分析完成，报告已保存'),
        }
      );

      setAiAnalysis(result);
      setLastStreamResult(result);
      setShowAnalysisButton(false);

      message.success({
        content: result.paperTrading ? 'AI分析完成，四个模拟账号已自动评估！' : 'AI分析完成！',
        key: 'ai-analysis',
        duration: 2,
      });
    } catch (error) {
      console.error('AI分析失败:', error);
      const errorMessage = error instanceof Error ? error.message : 'AI分析失败';

      if (errorMessage.includes('未配置AI服务')) {
        message.error({
          content: '请先在"AI账号"页面配置DeepSeek API Key',
          key: 'ai-analysis',
          duration: 4,
        });
      } else {
        message.error({ content: errorMessage, key: 'ai-analysis', duration: 3 });
      }
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * 重置为默认数据
   */
  const handleResetAnalysis = () => {
    setAiAnalysis(null);
    setStreamText('');
    setStreamStatus('等待发起分析');
    setStreamStartedAt(null);
    setStreamElapsedSeconds(0);
    setLastStreamResult(null);
    setShowAnalysisButton(true);
    message.info('已重置为默认数据');
  };

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="Trading Desk"
        title="交易看板"
        description="实时行情、信号统计和 AI 决策"
        meta={(
          <Space size={8}>
            <span className="pill green">行情{formatRefreshLabel(marketRefreshMs)}</span>
            <span className="pill blue">消息1小时刷新</span>
            <span className="date-text">{todayText}</span>
          </Space>
        )}
        actions={showAnalysisButton ? (
          <Button
            type="primary"
            icon={analyzing ? <LoadingOutlined spin /> : <RobotOutlined />}
            onClick={handleAIAnalyze}
            disabled={analyzing}
          >
            {analyzing ? '分析中...' : 'AI 智能分析'}
          </Button>
        ) : (
          <Button onClick={handleResetAnalysis}>
            重新分析
          </Button>
        )}
      />

      {/* 主内容区 - 左边K线，右边信息 */}
      <main className="main home-main">
        {/* 左侧区域：实时行情K线图 */}
        <section className="left" aria-label="实时行情K线图">
          {/* 市场卡片 - 报价条 + K线图 */}
          <article className="market-card chart-panel">
            {/* 报价条 */}
            <div className="quote-strip">
              <PriceCard priceData={priceData} />
            </div>

            {/* K线图 */}
            {candlesError ? (
              <div style={{
                height: '500px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
                fontSize: '16px'
              }}>
                <WarningOutlined style={{ fontSize: '38px', marginBottom: '16px' }} />
                <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>K线数据获取失败</div>
                <div style={{ color: '#666' }}>{candlesError}</div>
                <div style={{ marginTop: '16px', fontSize: '14px', color: '#888' }}>
                  请检查数据源设置或稍后重试
                </div>
              </div>
            ) : (
              <Chart
                candles={candles}
                signals={signals}
                period={period}
                currentPrice={priceData.price}
                onPeriodChange={(p) => setPeriod(p as Period)}
              />
            )}
          </article>

          <div className="home-under-chart" aria-label="市场信息流">
            {hasCalendarData && (
              <div className="home-mini-grid">
                {importantDataItems.length > 0 && (
                  <MiniCard
                    title="当天重要数据"
                    pillText={getDataMetaLabel(calendarMeta, '三星以上')}
                    pillColor={getDataMetaColor(calendarMeta, 'amber')}
                    items={importantDataItems.map(e => ({
                      date: e.date,
                      time: e.time,
                      star: e.star,
                      text: e.text,
                      source: e.source,
                      sourceUrl: e.sourceUrl,
                    }))}
                  />
                )}

                {importantMatterItems.length > 0 && (
                  <MiniCard
                    title="当天重要事项"
                    pillText={getDataMetaLabel(calendarMeta, '18:00-05:00')}
                    pillColor={getDataMetaColor(calendarMeta, 'amber')}
                    items={importantMatterItems.map(e => ({
                      date: e.date,
                      time: e.time,
                      star: e.star,
                      text: e.text,
                      source: e.source,
                      sourceUrl: e.sourceUrl,
                    }))}
                  />
                )}

                <MiniCard
                  title="实时市场快讯"
                  pillText={getDataMetaLabel(newsMeta, '1小时刷新')}
                  pillColor={getDataMetaColor(newsMeta, 'red')}
                  items={flashes.slice(0, 3).map(f => ({
                    date: f.date,
                    time: f.time,
                    text: f.text,
                    hot: f.hot,
                    source: f.source,
                    sourceUrl: f.sourceUrl,
                  }))}
                />
              </div>
            )}

            <div className={`home-feed-grid ${hasCalendarData ? '' : 'no-calendar'}`}>
              {hasCalendarData && (
                <EventList
                  events={events}
                  flashes={[]}
                  showFlashes={false}
                  title="美国重要事件明细"
                />
              )}
              <EventList events={[]} flashes={flashes} showEvents={false} />
              <ActionPanel actions={aiActions} />
            </div>
          </div>
        </section>

        {/* 右侧区域：信息咨询与分析 */}
        <section className="right" aria-label="信息咨询与分析">
          {/* 今日信号统计 */}
          <SignalPanel signals={signals} stats={stats} />

          {(analyzing || streamText || lastStreamResult) && (
            <Card
              className="workspace-card"
              title="AI回复看板"
              extra={(
                <Space wrap size={6}>
                  <Tag color={analyzing ? 'processing' : 'success'}>{streamStatus}</Tag>
                  <Tag color={streamCharCount > 0 ? 'blue' : 'default'}>已输出 {streamCharCount} 字</Tag>
                  <Tag color="geekblue">{streamTimeText}</Tag>
                </Space>
              )}
            >
              <Alert
                type={streamCharCount > 0 ? 'success' : 'info'}
                showIcon
                message={streamProgressText}
                style={{ marginBottom: 12 }}
              />
              {lastStreamResult && (
                <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                    {lastStreamResult.decision.headline}
                  </div>
                  <div style={{ color: '#475569', lineHeight: 1.7 }}>
                    {lastStreamResult.decision.summary}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                    <div className="metric-tile" style={{ padding: 10 }}>
                      <div className="metric-tile-label">上涨概率</div>
                      <div className="metric-tile-value red" style={{ fontSize: 18 }}>{lastStreamResult.probability.upProb}%</div>
                    </div>
                    <div className="metric-tile" style={{ padding: 10 }}>
                      <div className="metric-tile-label">下跌概率</div>
                      <div className="metric-tile-value green" style={{ fontSize: 18 }}>{lastStreamResult.probability.downProb}%</div>
                    </div>
                    <div className="metric-tile" style={{ padding: 10 }}>
                      <div className="metric-tile-label">风险</div>
                      <div className="metric-tile-value" style={{ fontSize: 18 }}>{lastStreamResult.risk.risk}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {lastStreamResult.actions.map((action) => (
                      <div key={action.title} className="action-item">
                        <strong>{action.title}</strong>
                        <div className="sub">{action.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <details open={analyzing || !lastStreamResult}>
                <summary style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600, marginBottom: 8 }}>
                  {lastStreamResult ? '查看原始模型输出' : '模型输出'}
                </summary>
                <div
                  style={{
                    minHeight: 140,
                    maxHeight: 260,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    lineHeight: 1.72,
                    border: '1px solid #dbe6f2',
                    borderRadius: 8,
                    background: '#f8fbff',
                    padding: 16,
                  }}
                >
                  {streamText || `等待模型开始输出...\n${streamProgressText}`}
                </div>
              </details>
            </Card>
          )}

          {/* 今日决策卡片 */}
          <DecisionCard
            headline={decisionData.headline}
            summary={decisionData.summary}
            eventCountdown={decisionData.eventCountdown}
            aiReason={decisionData.aiReason}
          />

          {/* 六卡片网格 */}
          <div className="info-grid">
            {/* 上涨/下跌概率 */}
            <ProbCard
              upProb={stats.upProb || 55}
              downProb={stats.downProb || 45}
            />

            {/* 仓位管理警示 */}
            <RiskCard
              risk={stats.risk || 50}
              riskLevel={stats.riskLevel || 'medium'}
              positionAdvice={stats.positionAdvice || 50}
              stopLoss={stats.stopLoss || 2.5}
            />

            {/* 当前行情支撑压力 */}
            <SupportCard
              support1={priceData.support1 || 4800}
              support2={priceData.support2 || 4750}
              resistance1={priceData.resistance1 || 4900}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Descriptions, InputNumber, Progress, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ExperimentOutlined, FundProjectionScreenOutlined, LoadingOutlined, ReloadOutlined, RiseOutlined, RobotOutlined, UndoOutlined } from '@ant-design/icons';
import { researchApi, type AnalysisReport, type BacktestProfileResult, type BacktestRun, type PaperAccount, type PaperTrade, type ResearchSummary } from '@/services/research';
import { aiService, type AIAnalysisResult } from '@/services/ai';
import { dataApi, type EconomicEvent, type MarketFlash } from '@/services/data';
import { fetchCandles, fetchRealTimePrice } from '@/services/marketData';
import { detectSignals } from '@/utils/signalCalculator';
import { EquityCurveChart, type EquityCurveSeries } from '@/components/EquityCurveChart';
import { PageHeader } from '@/components/PageHeader';

const { Text, Title } = Typography;
const INITIAL_BALANCE = 10000;

function formatMoney(value: number): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function directionTag(direction?: 'long' | 'short') {
  if (!direction) return <Tag>无方向</Tag>;
  return direction === 'long' ? <Tag color="red">做多</Tag> : <Tag color="green">做空</Tag>;
}

function statusTag(status?: PaperTrade['status']) {
  if (status === 'open') return <Tag color="processing">持仓中</Tag>;
  if (status === 'closed') return <Tag color="default">已平仓</Tag>;
  if (status === 'skipped') return <Tag color="warning">跳过</Tag>;
  if (status === 'held') return <Tag color="blue">继续持有</Tag>;
  return <Tag>未知</Tag>;
}

function riskColor(level?: string): 'success' | 'normal' | 'exception' {
  if (level === 'low') return 'success';
  if (level === 'high') return 'exception';
  return 'normal';
}

function toSeconds(value?: string): number {
  if (!value) return Math.floor(Date.now() / 1000);
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000);
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

const profileOrder: Record<string, number> = {
  conservative: 0,
  balanced: 1,
  aggressive: 2,
  event: 3,
};

const profileColors: Record<string, string> = {
  conservative: '#2563eb',
  balanced: '#16a34a',
  aggressive: '#dc2626',
  event: '#7c3aed',
};

interface TradeRecord extends PaperTrade {
  key: string;
  accountName: string;
  profileId: PaperAccount['profileId'];
}

export function ResearchCenter() {
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [latestReport, setLatestReport] = useState<AnalysisReport | null>(null);
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [accounts, setAccounts] = useState<PaperAccount[]>([]);
  const [latestBacktest, setLatestBacktest] = useState<BacktestRun | null>(null);
  const [markPrice, setMarkPrice] = useState<number | null>(null);
  const [autoTrading, setAutoTrading] = useState<ResearchSummary['autoTrading']>(undefined);
  const [analyzing, setAnalyzing] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamStatus, setStreamStatus] = useState('等待发起分析');
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  const [streamElapsedSeconds, setStreamElapsedSeconds] = useState(0);
  const [lastStreamResult, setLastStreamResult] = useState<AIAnalysisResult | null>(null);
  const [backtestPeriod, setBacktestPeriod] = useState('1m');
  const [backtestLimit, setBacktestLimit] = useState(240);
  const [backtestExitBars, setBacktestExitBars] = useState(8);
  const [backtestSlippagePct, setBacktestSlippagePct] = useState(0.03);
  const [backtestCommissionPct, setBacktestCommissionPct] = useState(0.01);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const [summary, reportList] = await Promise.all([
        researchApi.getSummary(),
        researchApi.getReports(),
      ]);
      setLatestReport(summary.latestReport);
      setReports(reportList);
      setAccounts(summary.accounts || []);
      setLatestBacktest(summary.latestBacktest);
      setMarkPrice(summary.markPrice ?? null);
      setAutoTrading(summary.autoTrading);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载研究中心失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
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

  const confidence = useMemo(() => {
    if (!latestReport) return 0;
    const up = Number(latestReport.result.probability.upProb || 0);
    const down = Number(latestReport.result.probability.downProb || 0);
    return Math.abs(up - down);
  }, [latestReport]);

  const orderedAccounts = useMemo(
    () => [...accounts].sort((a, b) => profileOrder[a.profileId] - profileOrder[b.profileId]),
    [accounts]
  );

  const reportById = useMemo(() => {
    const map = new Map<string, AnalysisReport>();
    reports.forEach((report) => map.set(report._id, report));
    return map;
  }, [reports]);

  const tradeRows = useMemo<TradeRecord[]>(() => {
    return orderedAccounts
      .flatMap((account) =>
        (account.tradeLog || []).map((trade, index) => ({
          ...trade,
          key: `${account.profileId}-${trade.openedAt}-${index}`,
          accountName: account.name,
          profileId: account.profileId,
        }))
      )
      .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
  }, [orderedAccounts]);

  const accountStats = useMemo(() => {
    return orderedAccounts.map((account) => {
      const trades = account.tradeLog || [];
      const closed = trades.filter((trade) => trade.status === 'closed');
      const opened = trades.filter((trade) => trade.status === 'open');
      const skipped = trades.filter((trade) => trade.status === 'skipped');
      const held = trades.filter((trade) => trade.status === 'held');
      const wins = closed.filter((trade) => Number(trade.pnl) > 0);

      return {
        key: account.profileId,
        name: account.name,
        balance: account.balance,
        equity: account.equity,
        realizedPnl: account.realizedPnl,
        total: trades.length,
        open: opened.length,
        skipped: skipped.length,
        held: held.length,
        closed: closed.length,
        winRate: closed.length ? Number(((wins.length / closed.length) * 100).toFixed(1)) : 0,
      };
    });
  }, [orderedAccounts]);

  const researchMetrics = useMemo(() => {
    const totalEquity = orderedAccounts.reduce((sum, account) => sum + Number(account.equity || 0), 0);
    const realizedPnl = orderedAccounts.reduce((sum, account) => sum + Number(account.realizedPnl || 0), 0);
    const openTrades = orderedAccounts.filter((account) => account.openTrade?.status === 'open').length;

    return {
      totalEquity,
      realizedPnl,
      openTrades,
      reportCount: reports.length,
    };
  }, [orderedAccounts, reports.length]);

  const autoTradingDescription = useMemo(() => {
    const intervalMinutes = Math.max(1, Math.round((autoTrading?.intervalMs || 60000) / 60000));

    if (!autoTrading?.lastRunAt) {
      return `后端已配置为每 ${intervalMinutes} 分钟自动读取一次行情，生成报告后会自动评估四个模拟账号。`;
    }

    const priceText = autoTrading.lastPrice ? `，最近结算价 ${autoTrading.lastPrice.toFixed(2)}` : '';
    const sourceText = autoTrading.lastSource ? `，来源 ${autoTrading.lastSource}` : '';
    return `后端每 ${intervalMinutes} 分钟自动盯市，最近运行 ${formatDate(autoTrading.lastRunAt)}${priceText}${sourceText}。`;
  }, [autoTrading]);

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

  const accountEquitySeries = useMemo<EquityCurveSeries[]>(() => {
    return orderedAccounts.map((account) => {
      const snapshots = [...(account.equitySnapshots || [])]
        .sort((a, b) => toSeconds(a.time) - toSeconds(b.time));

      if (snapshots.length > 0) {
        const snapshotData = snapshots.map((snapshot) => ({
          time: toSeconds(snapshot.time),
          value: Number(snapshot.equity || account.equity || INITIAL_BALANCE),
        }));

        const data = snapshotData.length === 1
          ? [{ time: snapshotData[0].time - 60, value: INITIAL_BALANCE }, ...snapshotData]
          : snapshotData;

        return {
          id: account.profileId,
          name: account.name,
          color: profileColors[account.profileId],
          data,
        };
      }

      const chronologicalTrades = [...(account.tradeLog || [])]
        .sort((a, b) => toSeconds(a.openedAt) - toSeconds(b.openedAt));
      const firstTime = chronologicalTrades[0]?.openedAt
        ? toSeconds(chronologicalTrades[0].openedAt) - 60
        : toSeconds(account.updatedAt) - 60;
      let realizedEquity = INITIAL_BALANCE;
      const data = [{ time: firstTime, value: realizedEquity }];

      chronologicalTrades.forEach((trade) => {
        if (trade.status === 'closed') {
          realizedEquity = Number((realizedEquity + Number(trade.pnl || 0)).toFixed(2));
          data.push({
            time: toSeconds(trade.closedAt || trade.openedAt),
            value: realizedEquity,
          });
        }

        if (trade.status === 'held') {
          data.push({
            time: toSeconds(trade.openedAt),
            value: Number((account.balance + Number(trade.pnl || 0)).toFixed(2)),
          });
        }
      });

      data.push({
        time: toSeconds(account.updatedAt),
        value: Number(account.equity || account.balance || INITIAL_BALANCE),
      });

      return {
        id: account.profileId,
        name: account.name,
        color: profileColors[account.profileId],
        data,
      };
    });
  }, [orderedAccounts]);

  const backtestEquitySeries = useMemo<EquityCurveSeries[]>(() => {
    return (latestBacktest?.results || [])
      .filter((result) => result.equityCurve && result.equityCurve.length > 0)
      .map((result) => ({
        id: result.profileId,
        name: result.name,
        color: profileColors[result.profileId] || '#2563eb',
        data: (result.equityCurve || []).map((point) => ({
          time: point.time,
          value: point.equity,
        })),
      }));
  }, [latestBacktest]);

  const handleExecute = async () => {
    try {
      setActing(true);
      const result = await researchApi.executePaperTrading(latestReport?._id);
      setAccounts(result.accounts);
      message.success('四个模拟账号已完成本轮决策');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '模拟交易失败');
    } finally {
      setActing(false);
    }
  };

  const handleSettle = async () => {
    try {
      setActing(true);
      const result = await researchApi.settlePaperAccounts();
      const closedCount = result.settlements.filter((item) => item.action === 'closed').length;
      setAccounts(result.accounts);
      setMarkPrice(result.price);
      message.success(closedCount > 0 ? `已自动平仓 ${closedCount} 笔` : '未触发止盈止损，已更新权益');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '结算持仓失败');
    } finally {
      setActing(false);
    }
  };

  const handleAIAnalyze = async () => {
    try {
      setAnalyzing(true);
      setStreamText('');
      setLastStreamResult(null);
      setStreamStatus('准备行情、事件和信号数据...');
      setStreamStartedAt(Date.now());
      setStreamElapsedSeconds(0);
      message.loading({ content: 'AI正在流式分析市场...', key: 'research-ai-analysis', duration: 0 });

      const today = new Date().toISOString().split('T')[0];
      const [candles, priceQuote, calendarRes, newsRes] = await Promise.all([
        fetchCandles('1m', 360),
        fetchRealTimePrice().catch(() => null),
        dataApi.getEconomicCalendar(today).catch(() => ({ success: false, data: [] })),
        dataApi.getMarketNews().catch(() => ({ success: false, data: [] })),
      ]);

      const latestCandle = candles[candles.length - 1];
      const currentPrice = Number(
        priceQuote?.price ||
        latestCandle?.close ||
        markPrice ||
        latestReport?.currentPrice ||
        0
      );
      const detectedSignals = candles.length >= 233 ? detectSignals(candles).slice(-5) : [];
      const analysisEvents = calendarRes.success
        ? calendarRes.data.slice(0, 10).map((item: EconomicEvent) => ({
          date: item.date,
          time: item.time,
          text: `${item.country} ${item.event}`,
          source: item.source,
          sourceUrl: item.sourceUrl,
        }))
        : [];
      const analysisFlashes = newsRes.success
        ? newsRes.data.slice(0, 10).map((item: MarketFlash) => ({
          date: item.date,
          time: item.time,
          hot: item.hot || false,
          text: item.content,
          source: item.source,
          sourceUrl: item.sourceUrl,
        }))
        : [];

      setStreamStatus(`已读取 ${candles.length} 根K线，正在等待模型流式回复...`);

      const result = await aiService.analyzeMarketStream(
        {
          candles: candles.slice(-100),
          currentPrice,
          events: analysisEvents,
          flashes: analysisFlashes,
          signals: detectedSignals,
        },
        {
          onStatus: (status) => setStreamStatus(status),
          onToken: (token) => setStreamText((prev) => `${prev}${token}`),
          onResult: (nextResult) => {
            setLastStreamResult(nextResult);
            setStreamText((prev) => `${prev}${formatStreamResult(nextResult)}`);
          },
          onDone: () => setStreamStatus('分析完成，报告已保存到历史记录'),
        }
      );

      setLastStreamResult(result);
      await loadSummary();

      message.success({
        content: result.paperTrading ? 'AI分析完成，四账号已自动评估' : 'AI分析完成',
        key: 'research-ai-analysis',
        duration: 2,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'AI分析失败';
      setStreamStatus(errorMessage);
      message.error({
        content: errorMessage.includes('未配置AI服务') ? '请先在AI账号页面配置DeepSeek API Key' : errorMessage,
        key: 'research-ai-analysis',
        duration: 4,
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleBacktest = async () => {
    try {
      setActing(true);
      const backtest = await researchApi.runBacktest(latestReport?._id, {
        period: backtestPeriod,
        limit: backtestLimit,
        exitBars: backtestExitBars,
        slippagePct: backtestSlippagePct,
        commissionPct: backtestCommissionPct,
      });
      setLatestBacktest(backtest);
      message.success('升级回测完成');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '回测失败');
    } finally {
      setActing(false);
    }
  };

  const handleReset = async () => {
    try {
      setActing(true);
      const nextAccounts = await researchApi.resetPaperAccounts();
      setAccounts(nextAccounts);
      message.success('模拟账号已重置');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '重置失败');
    } finally {
      setActing(false);
    }
  };

  const backtestColumns: ColumnsType<BacktestProfileResult> = [
    {
      title: '账号',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: '方向',
      dataIndex: 'direction',
      key: 'direction',
      width: 90,
      render: directionTag,
    },
    {
      title: '交易数',
      dataIndex: 'trades',
      key: 'trades',
      width: 90,
    },
    {
      title: '胜率',
      dataIndex: 'winRate',
      key: 'winRate',
      width: 90,
      render: (value) => `${Number(value || 0).toFixed(1)}%`,
    },
    {
      title: 'PF',
      dataIndex: 'profitFactor',
      key: 'profitFactor',
      width: 80,
      render: (value) => Number(value || 0).toFixed(2),
    },
    {
      title: '期望',
      dataIndex: 'expectancy',
      key: 'expectancy',
      width: 90,
      render: (value) => <Text type={value >= 0 ? 'success' : 'danger'}>{formatMoney(value)}</Text>,
    },
    {
      title: '净收益',
      dataIndex: 'netPnl',
      key: 'netPnl',
      width: 110,
      render: (value) => <Text type={value >= 0 ? 'success' : 'danger'}>{formatMoney(value)}</Text>,
    },
    {
      title: '最大回撤',
      dataIndex: 'maxDrawdown',
      key: 'maxDrawdown',
      width: 110,
      render: (value) => `${Number(value || 0).toFixed(2)}%`,
    },
    {
      title: '稳健度',
      dataIndex: 'robustnessScore',
      key: 'robustnessScore',
      width: 90,
      render: (value) => <Tag color={value >= 75 ? 'success' : value >= 50 ? 'warning' : 'error'}>{Number(value || 0)}%</Tag>,
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      ellipsis: true,
      render: (value, record) => (
        <Space>
          {record.sampleWarning && <Tag color="warning">样本偏少</Tag>}
          <Text>{value}</Text>
        </Space>
      ),
    },
  ];

  const reportColumns: ColumnsType<AnalysisReport> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 130,
      render: formatDate,
    },
    {
      title: '结论',
      key: 'headline',
      render: (_, report) => <Text strong>{report.result.decision.headline}</Text>,
    },
    {
      title: '价格',
      dataIndex: 'currentPrice',
      key: 'currentPrice',
      width: 100,
      render: (value) => Number(value || 0).toFixed(2),
    },
    {
      title: '上涨',
      key: 'upProb',
      width: 90,
      render: (_, report) => `${report.result.probability.upProb}%`,
    },
    {
      title: '下跌',
      key: 'downProb',
      width: 90,
      render: (_, report) => `${report.result.probability.downProb}%`,
    },
    {
      title: '风险',
      key: 'risk',
      width: 90,
      render: (_, report) => `${report.result.risk.risk}`,
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_, report) => (
        <Button size="small" onClick={() => setLatestReport(report)}>
          查看
        </Button>
      ),
    },
  ];

  const accountStatColumns: ColumnsType<(typeof accountStats)[number]> = [
    {
      title: '账号',
      dataIndex: 'name',
      key: 'name',
      width: 110,
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: '余额',
      dataIndex: 'balance',
      key: 'balance',
      width: 110,
      render: formatMoney,
    },
    {
      title: '权益',
      dataIndex: 'equity',
      key: 'equity',
      width: 110,
      render: formatMoney,
    },
    {
      title: '已实现盈亏',
      dataIndex: 'realizedPnl',
      key: 'realizedPnl',
      width: 120,
      render: (value) => <Text type={value >= 0 ? 'success' : 'danger'}>{formatMoney(value)}</Text>,
    },
    {
      title: '记录数',
      dataIndex: 'total',
      key: 'total',
      width: 90,
    },
    {
      title: '开仓',
      dataIndex: 'open',
      key: 'open',
      width: 80,
    },
    {
      title: '跳过',
      dataIndex: 'skipped',
      key: 'skipped',
      width: 80,
    },
    {
      title: '持有',
      dataIndex: 'held',
      key: 'held',
      width: 80,
    },
    {
      title: '已平仓',
      dataIndex: 'closed',
      key: 'closed',
      width: 90,
    },
    {
      title: '平仓胜率',
      dataIndex: 'winRate',
      key: 'winRate',
      width: 100,
      render: (value) => `${Number(value || 0).toFixed(1)}%`,
    },
  ];

  const tradeColumns: ColumnsType<TradeRecord> = [
    {
      title: '时间',
      dataIndex: 'openedAt',
      key: 'openedAt',
      width: 130,
      render: formatDate,
    },
    {
      title: '账号',
      dataIndex: 'accountName',
      key: 'accountName',
      width: 100,
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: statusTag,
    },
    {
      title: '方向',
      dataIndex: 'direction',
      key: 'direction',
      width: 90,
      render: directionTag,
    },
    {
      title: '开仓价',
      dataIndex: 'entryPrice',
      key: 'entryPrice',
      width: 100,
      render: (value) => Number(value || 0).toFixed(2),
    },
    {
      title: '平仓价',
      dataIndex: 'exitPrice',
      key: 'exitPrice',
      width: 100,
      render: (value) => value ? Number(value).toFixed(2) : '-',
    },
    {
      title: '手数',
      dataIndex: 'volume',
      key: 'volume',
      width: 90,
      render: (value) => Number(value || 0).toFixed(4),
    },
    {
      title: '止损',
      dataIndex: 'stopLoss',
      key: 'stopLoss',
      width: 100,
      render: (value) => Number(value || 0).toFixed(2),
    },
    {
      title: '止盈',
      dataIndex: 'takeProfit',
      key: 'takeProfit',
      width: 100,
      render: (value) => Number(value || 0).toFixed(2),
    },
    {
      title: '盈亏',
      dataIndex: 'pnl',
      key: 'pnl',
      width: 100,
      render: (value) => <Text type={value >= 0 ? 'success' : 'danger'}>{formatMoney(value)}</Text>,
    },
    {
      title: '原因',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
    },
    {
      title: '关联报告',
      dataIndex: 'reportId',
      key: 'reportId',
      width: 160,
      ellipsis: true,
      render: (reportId) => reportId ? (reportById.get(reportId)?.result.decision.headline || reportId.slice(-8)) : '-',
    },
  ];

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="Strategy Lab"
        title="策略研究"
        description="AI报告、四账号模拟交易和回测结果"
        meta={(
          <Space wrap>
            <span className={autoTrading?.errors?.length ? 'pill amber' : 'pill green'}>自动实时交易</span>
            {markPrice !== null ? <span className="pill blue">结算价 {markPrice.toFixed(2)}</span> : <span className="pill">等待结算</span>}
          </Space>
        )}
        actions={(
          <Space wrap>
          <Button
            type="primary"
            icon={analyzing ? <LoadingOutlined spin /> : <RobotOutlined />}
            onClick={handleAIAnalyze}
            loading={analyzing}
          >
            {analyzing ? 'AI分析中' : 'AI分析'}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadSummary} loading={loading}>
            刷新
          </Button>
          <Button icon={<FundProjectionScreenOutlined />} onClick={handleSettle} loading={acting}>
            结算持仓
          </Button>
          <Button icon={<UndoOutlined />} onClick={handleReset} loading={acting}>
            重置账号
          </Button>
          </Space>
        )}
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} xl={6}>
          <div className="metric-tile">
            <div className="metric-tile-label">AI报告</div>
            <div className="metric-tile-value">{researchMetrics.reportCount}</div>
          </div>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <div className="metric-tile">
            <div className="metric-tile-label">模拟权益</div>
            <div className="metric-tile-value">{formatMoney(researchMetrics.totalEquity)}</div>
          </div>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <div className="metric-tile">
            <div className="metric-tile-label">已实现盈亏</div>
            <div className={researchMetrics.realizedPnl >= 0 ? 'metric-tile-value green' : 'metric-tile-value red'}>
              {formatMoney(researchMetrics.realizedPnl)}
            </div>
          </div>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <div className="metric-tile">
            <div className="metric-tile-label">持仓账号</div>
            <div className="metric-tile-value">{researchMetrics.openTrades}</div>
          </div>
        </Col>
      </Row>

      {markPrice !== null && (
        <Alert
          type="info"
          showIcon
          message={`最近模拟结算价：${markPrice.toFixed(2)}`}
          description={autoTradingDescription}
        />
      )}

      {!latestReport && (
        <Alert
          type="warning"
          showIcon
          message="还没有AI分析报告"
          description="点击右上角“AI分析”，系统会读取最新行情并把报告保存到历史记录。"
        />
      )}

      {(analyzing || streamText || lastStreamResult) && (
        <Card
          className="workspace-card"
          title="AI流式回复"
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
          <div
            style={{
              minHeight: 180,
              maxHeight: 360,
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
        </Card>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card
            className="workspace-card"
            title="当前查看报告"
            loading={loading}
            extra={latestReport ? <Text type="secondary">{formatDate(latestReport.createdAt)}</Text> : null}
          >
            {latestReport ? (
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <div>
                  <Title level={4} style={{ marginTop: 0 }}>{latestReport.result.decision.headline}</Title>
                  <Text>{latestReport.result.decision.summary}</Text>
                </div>

                <Row gutter={[12, 12]}>
                  <Col span={8}>
                    <Statistic title="当前价格" value={latestReport.currentPrice} precision={2} prefix="$" />
                  </Col>
                  <Col span={8}>
                    <Statistic title="置信差" value={confidence} suffix="%" />
                  </Col>
                  <Col span={8}>
                    <Statistic title="K线数量" value={latestReport.candleCount} />
                  </Col>
                </Row>

                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12}>
                    <Text strong>上涨概率</Text>
                    <Progress percent={latestReport.result.probability.upProb} strokeColor="#ef4444" />
                  </Col>
                  <Col xs={24} md={12}>
                    <Text strong>下跌概率</Text>
                    <Progress percent={latestReport.result.probability.downProb} strokeColor="#16a34a" />
                  </Col>
                </Row>

                <Descriptions column={1} size="small">
                  <Descriptions.Item label="重点事项">
                    {latestReport.result.decision.eventCountdown}
                  </Descriptions.Item>
                  <Descriptions.Item label="AI依据">
                    {latestReport.result.decision.aiReason}
                  </Descriptions.Item>
                  <Descriptions.Item label="风险">
                    <Space>
                      <Progress
                        type="circle"
                        percent={latestReport.result.risk.risk}
                        size={46}
                        status={riskColor(latestReport.result.risk.riskLevel)}
                      />
                      <Text>{latestReport.result.risk.reason}</Text>
                    </Space>
                  </Descriptions.Item>
                </Descriptions>

                <Space wrap>
                  <Space>
                    <Text type="secondary">周期</Text>
                    <Select
                      size="small"
                      value={backtestPeriod}
                      style={{ width: 92 }}
                      onChange={setBacktestPeriod}
                      options={[
                        { value: '1m', label: '1分钟' },
                        { value: '5m', label: '5分钟' },
                        { value: '15m', label: '15分钟' },
                        { value: '1h', label: '1小时' },
                      ]}
                    />
                  </Space>
                  <Space>
                    <Text type="secondary">K线</Text>
                    <InputNumber
                      size="small"
                      min={60}
                      max={1500}
                      step={60}
                      value={backtestLimit}
                      style={{ width: 92 }}
                      onChange={(value) => setBacktestLimit(Number(value || 240))}
                    />
                  </Space>
                  <Space>
                    <Text type="secondary">持仓K</Text>
                    <InputNumber
                      size="small"
                      min={3}
                      max={48}
                      value={backtestExitBars}
                      style={{ width: 78 }}
                      onChange={(value) => setBacktestExitBars(Number(value || 8))}
                    />
                  </Space>
                  <Space>
                    <Text type="secondary">滑点%</Text>
                    <InputNumber
                      size="small"
                      min={0}
                      max={0.5}
                      step={0.01}
                      value={backtestSlippagePct}
                      style={{ width: 78 }}
                      onChange={(value) => setBacktestSlippagePct(Number(value ?? 0.03))}
                    />
                  </Space>
                  <Space>
                    <Text type="secondary">手续费%</Text>
                    <InputNumber
                      size="small"
                      min={0}
                      max={0.5}
                      step={0.01}
                      value={backtestCommissionPct}
                      style={{ width: 78 }}
                      onChange={(value) => setBacktestCommissionPct(Number(value ?? 0.01))}
                    />
                  </Space>
                  <Button
                    type="primary"
                    icon={<RiseOutlined />}
                    onClick={handleExecute}
                    loading={acting}
                    disabled={!latestReport}
                  >
                    用此报告执行四账号模拟交易
                  </Button>
                  <Button
                    icon={<ExperimentOutlined />}
                    onClick={handleBacktest}
                    loading={acting}
                    disabled={!latestReport}
                  >
                    运行升级回测
                  </Button>
                </Space>
              </Space>
            ) : (
              <Text type="secondary">等待报告生成</Text>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card className="workspace-card" title="回测结果" loading={loading}>
            {latestBacktest ? (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="周期">{latestBacktest.period}</Descriptions.Item>
                  <Descriptions.Item label="K线">{latestBacktest.candleCount}</Descriptions.Item>
                  <Descriptions.Item label="时间">{formatDate(latestBacktest.createdAt)}</Descriptions.Item>
                  <Descriptions.Item label="滑点">{latestBacktest.config?.slippagePct ?? 0.03}%</Descriptions.Item>
                  <Descriptions.Item label="手续费">{latestBacktest.config?.commissionPct ?? 0.01}%</Descriptions.Item>
                  <Descriptions.Item label="持仓K线">{latestBacktest.config?.exitBars ?? 8}</Descriptions.Item>
                </Descriptions>
                {backtestEquitySeries.length > 0 && (
                  <EquityCurveChart series={backtestEquitySeries} height={220} />
                )}
                <Table
                  rowKey="profileId"
                  size="small"
                  pagination={false}
                  columns={backtestColumns}
                  dataSource={latestBacktest.results || []}
                  scroll={{ x: 980 }}
                  expandable={{
                    rowExpandable: (record) => !!record.stressTests?.length,
                    expandedRowRender: (record) => (
                      <Space wrap>
                        {(record.stressTests || []).map((item) => (
                          <Tag key={item.label} color={item.passed ? 'success' : 'error'}>
                            {item.label} {item.netPnl >= 0 ? '+' : ''}{formatMoney(item.netPnl)} PF {Number(item.profitFactor || 0).toFixed(2)}
                          </Tag>
                        ))}
                      </Space>
                    ),
                  }}
                />
              </Space>
            ) : (
              <Text type="secondary">暂无回测记录</Text>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card className="workspace-card" title="AI报告历史" extra={<Text type="secondary">点击查看可切换当前报告</Text>}>
            <Table
              rowKey="_id"
              size="small"
              columns={reportColumns}
              dataSource={reports}
              pagination={{ pageSize: 6, showSizeChanger: false }}
              scroll={{ x: 720 }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card className="workspace-card" title="账号表现统计" extra={<Text type="secondary">按模拟账号汇总</Text>}>
            <Table
              rowKey="key"
              size="small"
              columns={accountStatColumns}
              dataSource={accountStats}
              pagination={false}
              scroll={{ x: 860 }}
            />
          </Card>
        </Col>
      </Row>

      <Card className="workspace-card" title="模拟账号收益曲线" extra={<Text type="secondary">按权益展示</Text>}>
        {accountEquitySeries.length > 0 ? (
          <EquityCurveChart series={accountEquitySeries} />
        ) : (
          <Text type="secondary">暂无模拟交易记录</Text>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        {orderedAccounts.map((account) => {
          const openTrade = account.openTrade;
          const latestTrade = account.tradeLog?.[0];
          const pnl = Number(account.realizedPnl || 0);

          return (
            <Col xs={24} md={12} xl={6} key={account.profileId}>
              <Card
                className="workspace-card"
                title={
                  <Space>
                    <FundProjectionScreenOutlined />
                    <span>{account.name}</span>
                  </Space>
                }
                extra={openTrade ? directionTag(openTrade.direction) : <Tag>空仓</Tag>}
              >
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Text type="secondary">{account.description}</Text>
                  <Row gutter={[12, 12]}>
                    <Col span={12}>
                      <Statistic title="余额" value={account.balance} precision={2} prefix="$" valueStyle={{ fontSize: 18 }} />
                    </Col>
                    <Col span={12}>
                      <Statistic title="权益" value={account.equity} precision={2} prefix="$" valueStyle={{ fontSize: 18 }} />
                    </Col>
                  </Row>
                  <Statistic
                    title="已实现盈亏"
                    value={pnl}
                    precision={2}
                    prefix="$"
                    valueStyle={{ color: pnl >= 0 ? '#16a34a' : '#dc2626', fontSize: 20 }}
                  />
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="单笔风险">{account.riskPerTradePct}%</Descriptions.Item>
                    <Descriptions.Item label="最大仓位">{account.maxPositionPct}%</Descriptions.Item>
                    <Descriptions.Item label="置信阈值">{account.minConfidence}%</Descriptions.Item>
                    <Descriptions.Item label="最新动作">
                      {latestTrade ? latestTrade.reason : '暂无'}
                    </Descriptions.Item>
                  </Descriptions>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Card
        className="workspace-card"
        title="买卖记录"
        extra={<Text type="secondary">显示开仓、平仓和跳过原因</Text>}
      >
        <Table
          rowKey="key"
          size="small"
          columns={tradeColumns}
          dataSource={tradeRows}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1280 }}
        />
      </Card>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Descriptions, Progress, Row, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ExperimentOutlined, FundProjectionScreenOutlined, ReloadOutlined, RiseOutlined, UndoOutlined } from '@ant-design/icons';
import { researchApi, type AnalysisReport, type BacktestProfileResult, type BacktestRun, type PaperAccount, type PaperTrade } from '@/services/research';

const { Text, Title } = Typography;

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
  return <Tag>未知</Tag>;
}

function riskColor(level?: string): 'success' | 'normal' | 'exception' {
  if (level === 'low') return 'success';
  if (level === 'high') return 'exception';
  return 'normal';
}

const profileOrder: Record<string, number> = {
  conservative: 0,
  balanced: 1,
  aggressive: 2,
  event: 3,
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
  const [accounts, setAccounts] = useState<PaperAccount[]>([]);
  const [latestBacktest, setLatestBacktest] = useState<BacktestRun | null>(null);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const summary = await researchApi.getSummary();
      setLatestReport(summary.latestReport);
      setAccounts(summary.accounts || []);
      setLatestBacktest(summary.latestBacktest);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载研究中心失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

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

  const handleBacktest = async () => {
    try {
      setActing(true);
      const backtest = await researchApi.runBacktest(latestReport?._id);
      setLatestBacktest(backtest);
      message.success('基础回测完成');
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
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      ellipsis: true,
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
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>AI策略研究中心</Title>
          <Text type="secondary">报告、模拟账号、基础回测</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadSummary} loading={loading}>
            刷新
          </Button>
          <Button icon={<UndoOutlined />} onClick={handleReset} loading={acting}>
            重置账号
          </Button>
        </Space>
      </div>

      {!latestReport && (
        <Alert
          type="warning"
          showIcon
          message="还没有AI分析报告"
          description="先回到首页点击一次“AI 智能分析”，这里会自动读取最新报告。"
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card
            title="最新AI报告"
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
                  <Button
                    type="primary"
                    icon={<RiseOutlined />}
                    onClick={handleExecute}
                    loading={acting}
                  >
                    执行四账号模拟交易
                  </Button>
                  <Button
                    icon={<ExperimentOutlined />}
                    onClick={handleBacktest}
                    loading={acting}
                  >
                    运行基础回测
                  </Button>
                </Space>
              </Space>
            ) : (
              <Text type="secondary">等待报告生成</Text>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card title="回测结果" loading={loading}>
            {latestBacktest ? (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="周期">{latestBacktest.period}</Descriptions.Item>
                  <Descriptions.Item label="K线">{latestBacktest.candleCount}</Descriptions.Item>
                  <Descriptions.Item label="时间">{formatDate(latestBacktest.createdAt)}</Descriptions.Item>
                </Descriptions>
                <Table
                  rowKey="profileId"
                  size="small"
                  pagination={false}
                  columns={backtestColumns}
                  dataSource={latestBacktest.results || []}
                  scroll={{ x: 720 }}
                />
              </Space>
            ) : (
              <Text type="secondary">暂无回测记录</Text>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {orderedAccounts.map((account) => {
          const openTrade = account.openTrade;
          const latestTrade = account.tradeLog?.[0];
          const pnl = Number(account.realizedPnl || 0);

          return (
            <Col xs={24} md={12} xl={6} key={account.profileId}>
              <Card
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
        title="买卖记录"
        extra={<Text type="secondary">显示开仓、平仓和跳过原因</Text>}
      >
        <Table
          rowKey="key"
          size="small"
          columns={tradeColumns}
          dataSource={tradeRows}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1120 }}
        />
      </Card>
    </div>
  );
}

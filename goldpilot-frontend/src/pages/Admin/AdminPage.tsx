import { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { TeamOutlined, BarChartOutlined, MessageOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/PageHeader';
import { adminApi } from '@/services/admin';

const { Text } = Typography;

interface TesterSummary {
  accountId: string;
  role: string;
  createdAt: string;
  lastActionAt: string | null;
  actionCount: number;
  simSummary: {
    balance: number;
    equity: number;
    realizedPnl: number;
    unrealizedPnl: number;
    positionCount: number;
    orderCount: number;
    tradeCount: number;
  } | null;
}

interface ActionLog {
  accountId: string;
  role: string;
  category: string;
  action: string;
  detail?: any;
  page?: string;
  timestamp: string;
}

interface AdminStats {
  totalActions: number;
  actionsByCategory: { _id: string; count: number }[];
  actionsByTester: { _id: string; count: number }[];
}

function formatMoney(value?: number): string {
  return `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    page_visit: '页面访问',
    ai_question: 'AI提问',
    suggestion: '建议',
    trade_open: '开仓',
    trade_close: '平仓',
    trade_order: '下单',
    trade_cancel: '取消',
    trade_reset: '重置',
    button_click: '按钮点击',
    other: '其他',
  };
  return labels[category] || category;
}

function categoryColor(category: string): string {
  const colors: Record<string, string> = {
    page_visit: 'blue',
    ai_question: 'purple',
    suggestion: 'cyan',
    trade_open: 'green',
    trade_close: 'red',
    trade_order: 'orange',
    trade_cancel: 'default',
    trade_reset: 'volcano',
    button_click: 'geekblue',
    other: 'default',
  };
  return colors[category] || 'default';
}

export function AdminPage() {
  const [testers, setTesters] = useState<TesterSummary[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [selectedTester, setSelectedTester] = useState<string | null>(null);
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [actionsTotal, setActionsTotal] = useState(0);
  const [simAccount, setSimAccount] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedTester) {
      loadTesterDetail(selectedTester);
    }
  }, [selectedTester, categoryFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [testersRes, statsRes] = await Promise.all([
        adminApi.getTesters(),
        adminApi.getStats(),
      ]);
      if (testersRes.success) setTesters(testersRes.data);
      if (statsRes.success) setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTesterDetail = async (accountId: string) => {
    try {
      const params: any = { limit: 200 };
      if (categoryFilter) params.category = categoryFilter;

      const [actionsRes, simRes] = await Promise.all([
        adminApi.getTesterActions(accountId, params),
        adminApi.getTesterSimAccount(accountId),
      ]);
      if (actionsRes.success) {
        setActions(actionsRes.data.actions);
        setActionsTotal(actionsRes.data.total);
      }
      setSimAccount(simRes.success ? simRes.data : null);
    } catch (error) {
      console.error('Failed to load tester detail:', error);
    }
  };

  const testerColumns: ColumnsType<TesterSummary> = [
    {
      title: '账号',
      dataIndex: 'accountId',
      key: 'accountId',
      width: 80,
      render: (id: string) => <Text strong>{id}</Text>,
    },
    {
      title: '最后活跃',
      dataIndex: 'lastActionAt',
      key: 'lastActionAt',
      width: 140,
      render: (v: string) => v ? formatTime(v) : <Text type="secondary">未活跃</Text>,
    },
    {
      title: '操作数',
      dataIndex: 'actionCount',
      key: 'actionCount',
      width: 80,
      render: (v: number) => v,
    },
    {
      title: '余额',
      key: 'balance',
      width: 120,
      render: (_: any, r: TesterSummary) => r.simSummary ? formatMoney(r.simSummary.balance) : '-',
    },
    {
      title: '已实现PnL',
      key: 'realizedPnl',
      width: 120,
      render: (_: any, r: TesterSummary) => {
        if (!r.simSummary) return '-';
        const pnl = r.simSummary.realizedPnl;
        return <Text style={{ color: pnl >= 0 ? '#52c41a' : '#ff4d4f' }}>{formatMoney(pnl)}</Text>;
      },
    },
    {
      title: '浮动PnL',
      key: 'unrealizedPnl',
      width: 120,
      render: (_: any, r: TesterSummary) => {
        if (!r.simSummary) return '-';
        const pnl = r.simSummary.unrealizedPnl;
        return <Text style={{ color: pnl >= 0 ? '#52c41a' : '#ff4d4f' }}>{formatMoney(pnl)}</Text>;
      },
    },
    {
      title: '持仓',
      key: 'positions',
      width: 60,
      render: (_: any, r: TesterSummary) => r.simSummary?.positionCount || 0,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, r: TesterSummary) => (
        <Button size="small" type="link" onClick={() => setSelectedTester(r.accountId)}>
          查看详情
        </Button>
      ),
    },
  ];

  const actionColumns: ColumnsType<ActionLog> = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 140,
      render: (v: string) => formatTime(v),
    },
    {
      title: '类型',
      dataIndex: 'category',
      key: 'category',
      width: 90,
      render: (v: string) => <Tag color={categoryColor(v)}>{categoryLabel(v)}</Tag>,
    },
    {
      title: '动作',
      dataIndex: 'action',
      key: 'action',
      width: 150,
      ellipsis: true,
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      ellipsis: true,
      render: (detail: any) => {
        if (!detail) return '-';
        if (typeof detail === 'string') return detail;
        if (detail.question) return detail.question;
        return JSON.stringify(detail);
      },
    },
    {
      title: '页面',
      dataIndex: 'page',
      key: 'page',
      width: 120,
      render: (v: string) => v || '-',
    },
  ];

  const aiQuestions = actions.filter(a => a.category === 'ai_question');

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="Admin Panel"
        title="测试管理"
        description="查看测试员行为记录、交易表现和提问记录"
      />

      {/* 概览统计 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small" className="metric-tile">
            <Statistic
              title="测试员数"
              value={testers.length}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" className="metric-tile">
            <Statistic
              title="总操作数"
              value={stats?.totalActions || 0}
              prefix={<BarChartOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" className="metric-tile">
            <Statistic
              title="AI提问数"
              value={stats?.actionsByCategory?.find(c => c._id === 'ai_question')?.count || 0}
              prefix={<MessageOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" className="metric-tile">
            <Statistic
              title="交易操作数"
              value={
                (stats?.actionsByCategory?.find(c => c._id === 'trade_open')?.count || 0) +
                (stats?.actionsByCategory?.find(c => c._id === 'trade_close')?.count || 0)
              }
            />
          </Card>
        </Col>
      </Row>

      {/* 测试员列表 */}
      <Card
        title="测试员列表"
        size="small"
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={testerColumns}
          dataSource={testers}
          rowKey="accountId"
          loading={loading}
          pagination={false}
          size="small"
        />
      </Card>

      {/* 测试员详情 */}
      {selectedTester && (
        <Card
          title={`测试员 ${selectedTester} - 详细记录`}
          size="small"
          extra={
            <Button size="small" onClick={() => { setSelectedTester(null); setActions([]); setSimAccount(null); }}>
              关闭
            </Button>
          }
        >
          <Tabs
            defaultActiveKey="actions"
            items={[
              {
                key: 'actions',
                label: `操作时间线 (${actionsTotal})`,
                children: (
                  <>
                    <Space style={{ marginBottom: 12 }}>
                      <Text>筛选：</Text>
                      <Select
                        allowClear
                        placeholder="全部类型"
                        style={{ width: 140 }}
                        value={categoryFilter}
                        onChange={setCategoryFilter}
                        options={[
                          { label: '页面访问', value: 'page_visit' },
                          { label: 'AI提问', value: 'ai_question' },
                          { label: '开仓', value: 'trade_open' },
                          { label: '平仓', value: 'trade_close' },
                          { label: '取消', value: 'trade_cancel' },
                          { label: '重置', value: 'trade_reset' },
                        ]}
                      />
                    </Space>
                    <Table
                      columns={actionColumns}
                      dataSource={actions}
                      rowKey={(r) => `${r.timestamp}-${r.action}-${Math.random()}`}
                      size="small"
                      pagination={{ pageSize: 20, size: 'small' }}
                      scroll={{ y: 400 }}
                    />
                  </>
                ),
              },
              {
                key: 'ai',
                label: `AI提问 (${aiQuestions.length})`,
                children: (
                  <Table
                    dataSource={aiQuestions}
                    rowKey={(r) => `${r.timestamp}-${Math.random()}`}
                    size="small"
                    pagination={{ pageSize: 20, size: 'small' }}
                    columns={[
                      { title: '时间', dataIndex: 'timestamp', width: 140, render: (v: string) => formatTime(v) },
                      { title: '问题', dataIndex: 'detail', ellipsis: true, render: (d: any) => d?.question || JSON.stringify(d) },
                      { title: '页面', dataIndex: 'page', width: 120 },
                    ]}
                  />
                ),
              },
              {
                key: 'sim',
                label: '模拟账户',
                children: simAccount ? (
                  <div>
                    <Row gutter={16} style={{ marginBottom: 12 }}>
                      <Col span={4}><Statistic title="余额" value={simAccount.balance} precision={2} prefix="$" /></Col>
                      <Col span={4}><Statistic title="权益" value={simAccount.equity} precision={2} prefix="$" /></Col>
                      <Col span={4}>
                        <Statistic
                          title="已实现PnL"
                          value={simAccount.realizedPnl}
                          precision={2}
                          prefix="$"
                          valueStyle={{ color: simAccount.realizedPnl >= 0 ? '#52c41a' : '#ff4d4f' }}
                        />
                      </Col>
                      <Col span={4}>
                        <Statistic
                          title="浮动PnL"
                          value={simAccount.unrealizedPnl}
                          precision={2}
                          prefix="$"
                          valueStyle={{ color: simAccount.unrealizedPnl >= 0 ? '#52c41a' : '#ff4d4f' }}
                        />
                      </Col>
                      <Col span={4}><Statistic title="持仓数" value={simAccount.positions?.length || 0} /></Col>
                      <Col span={4}><Statistic title="交易笔数" value={simAccount.tradeLog?.length || 0} /></Col>
                    </Row>
                    {simAccount.positions?.length > 0 && (
                      <Table
                        title={() => '当前持仓'}
                        size="small"
                        pagination={false}
                        dataSource={simAccount.positions}
                        rowKey="positionId"
                        columns={[
                          { title: '方向', dataIndex: 'side', width: 60, render: (v: string) => <Tag color={v === 'buy' ? 'red' : 'green'}>{v === 'buy' ? '买入' : '卖出'}</Tag> },
                          { title: '手数', dataIndex: 'lots', width: 60 },
                          { title: '入场价', dataIndex: 'entryPrice', width: 100 },
                          { title: '现价', dataIndex: 'currentPrice', width: 100 },
                          { title: '盈亏', dataIndex: 'pnl', width: 100, render: (v: number) => <Text style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>{formatMoney(v)}</Text> },
                        ]}
                      />
                    )}
                    {simAccount.tradeLog?.length > 0 && (
                      <Table
                        title={() => `交易流水 (最近 ${Math.min(simAccount.tradeLog.length, 30)} 条)`}
                        size="small"
                        pagination={false}
                        dataSource={simAccount.tradeLog.slice(0, 30)}
                        rowKey="tradeId"
                        columns={[
                          { title: '时间', dataIndex: 'createdAt', width: 130, render: (v: string) => formatTime(v) },
                          { title: '动作', dataIndex: 'action', width: 80, render: (v: string) => {
                            const labels: Record<string, string> = { open: '开仓', close: '平仓', fill: '成交', cancel: '取消', reset: '重置' };
                            return labels[v] || v;
                          }},
                          { title: '方向', dataIndex: 'side', width: 60, render: (v: string) => v === 'buy' ? '买' : v === 'sell' ? '卖' : '-' },
                          { title: '手数', dataIndex: 'lots', width: 60 },
                          { title: '价格', dataIndex: 'price', width: 100 },
                          { title: '盈亏', dataIndex: 'pnl', width: 100, render: (v: number) => <Text style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>{formatMoney(v)}</Text> },
                          { title: '余额', dataIndex: 'balanceAfter', width: 110, render: (v: number) => formatMoney(v) },
                          { title: '原因', dataIndex: 'reason', ellipsis: true },
                        ]}
                      />
                    )}
                  </div>
                ) : <Text type="secondary">该测试员尚未创建模拟账户</Text>,
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

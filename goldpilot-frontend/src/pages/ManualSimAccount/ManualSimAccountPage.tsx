import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Input, InputNumber, Modal, Row, Segmented, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CloseCircleOutlined,
  FieldTimeOutlined,
  ReloadOutlined,
  ShoppingCartOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { PageHeader } from '@/components/PageHeader';
import { trackAction } from '@/services/actionTracker';
import {
  manualSimApi,
  type ManualSimAccount,
  type ManualSimOrder,
  type ManualSimOrderType,
  type ManualSimPayload,
  type ManualSimPosition,
  type ManualSimSide,
  type ManualSimTradeLog,
} from '@/services/manualSim';

const { Text } = Typography;

function formatMoney(value?: number): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatPrice(value?: number): string {
  return Number(value || 0).toFixed(2);
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sideTag(side?: ManualSimSide) {
  if (side === 'sell') return <Tag color="green">卖出</Tag>;
  return <Tag color="red">买入</Tag>;
}

function orderTypeLabel(type?: ManualSimOrderType): string {
  if (type === 'limit') return '限价';
  if (type === 'stop') return '突破';
  return '市价';
}

function actionLabel(action?: string): string {
  const labels: Record<string, string> = {
    open: '开仓/下单',
    close: '平仓',
    fill: '成交',
    cancel: '取消',
    reset: '重置',
  };
  return labels[action || ''] || action || '-';
}

export function ManualSimAccountPage() {
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [account, setAccount] = useState<ManualSimAccount | null>(null);
  const [quote, setQuote] = useState<ManualSimPayload['quote'] | null>(null);
  const [orderType, setOrderType] = useState<ManualSimOrderType>('market');
  const [side, setSide] = useState<ManualSimSide>('buy');
  const [lots, setLots] = useState(0.1);
  const [targetPrice, setTargetPrice] = useState<number | null>(null);
  const [stopLoss, setStopLoss] = useState<number | null>(null);
  const [takeProfit, setTakeProfit] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const applyPayload = (payload: ManualSimPayload) => {
    setAccount(payload.account);
    setQuote(payload.quote);

    if (!targetPrice && payload.quote?.price) {
      setTargetPrice(payload.quote.price);
    }
  };

  const loadAccount = async (mode: 'get' | 'settle' = 'get') => {
    try {
      setLoading(true);
      const result = mode === 'settle'
        ? await manualSimApi.settle()
        : await manualSimApi.getAccount();
      applyPayload(result);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '读取模拟账户失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccount();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadAccount('settle');
    }, 30 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  const quotePrice = quote?.price || 0;
  const pnlColor = Number(account?.unrealizedPnl || 0) >= 0 ? 'success' : 'danger';
  const totalPnl = Number(account?.realizedPnl || 0) + Number(account?.unrealizedPnl || 0);

  const estimatedMargin = useMemo(() => {
    const price = orderType === 'market' ? quotePrice : Number(targetPrice || quotePrice);
    return price * Number(lots || 0) * 100 * 0.02;
  }, [lots, orderType, quotePrice, targetPrice]);

  const handlePlaceOrder = async () => {
    try {
      setActing(true);
      const result = await manualSimApi.placeOrder({
        type: orderType,
        side,
        lots,
        targetPrice: orderType === 'market' ? undefined : Number(targetPrice || 0),
        stopLoss: Number(stopLoss || 0) || undefined,
        takeProfit: Number(takeProfit || 0) || undefined,
        note,
      });
      applyPayload(result);
      message.success(orderType === 'market' ? '市价单已成交' : '预下单已创建');
      trackAction('trade_open', 'place_order', { type: orderType, side, lots });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '下单失败');
    } finally {
      setActing(false);
    }
  };

  const handleClosePosition = async (position: ManualSimPosition) => {
    try {
      setActing(true);
      const result = await manualSimApi.closePosition(position.positionId);
      applyPayload(result);
      message.success('持仓已平仓');
      trackAction('trade_close', 'close_position', { positionId: position.positionId });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '平仓失败');
    } finally {
      setActing(false);
    }
  };

  const handleCancelOrder = async (order: ManualSimOrder) => {
    try {
      setActing(true);
      const result = await manualSimApi.cancelOrder(order.orderId);
      applyPayload(result);
      message.success('预下单已取消');
      trackAction('trade_cancel', 'cancel_order', { orderId: order.orderId });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '取消失败');
    } finally {
      setActing(false);
    }
  };

  const handleReset = () => {
    Modal.confirm({
      title: '重置手动模拟账户',
      content: '账户会恢复到100万初始资金，持仓、预下单和流水都会清空。',
      okText: '重置',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setActing(true);
        try {
          const result = await manualSimApi.reset();
          applyPayload(result);
          message.success('手动模拟账户已重置');
        } finally {
          setActing(false);
        }
      },
    });
  };

  const positionColumns: ColumnsType<ManualSimPosition> = [
    {
      title: '方向',
      dataIndex: 'side',
      key: 'side',
      width: 82,
      render: sideTag,
    },
    {
      title: '手数',
      dataIndex: 'lots',
      key: 'lots',
      width: 82,
    },
    {
      title: '开仓价',
      dataIndex: 'entryPrice',
      key: 'entryPrice',
      width: 96,
      render: formatPrice,
    },
    {
      title: '现价',
      dataIndex: 'currentPrice',
      key: 'currentPrice',
      width: 96,
      render: formatPrice,
    },
    {
      title: '止损/止盈',
      key: 'risk',
      width: 130,
      render: (_, record) => `${record.stopLoss ? formatPrice(record.stopLoss) : '-'} / ${record.takeProfit ? formatPrice(record.takeProfit) : '-'}`,
    },
    {
      title: '保证金',
      dataIndex: 'margin',
      key: 'margin',
      width: 100,
      render: formatMoney,
    },
    {
      title: '浮盈亏',
      dataIndex: 'pnl',
      key: 'pnl',
      width: 110,
      render: (value) => <Text type={Number(value || 0) >= 0 ? 'success' : 'danger'}>{formatMoney(value)}</Text>,
    },
    {
      title: '开仓时间',
      dataIndex: 'openedAt',
      key: 'openedAt',
      width: 120,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'action',
      width: 84,
      render: (_, record) => (
        <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => handleClosePosition(record)} loading={acting}>
          平仓
        </Button>
      ),
    },
  ];

  const orderColumns: ColumnsType<ManualSimOrder> = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: orderTypeLabel,
    },
    {
      title: '方向',
      dataIndex: 'side',
      key: 'side',
      width: 82,
      render: sideTag,
    },
    {
      title: '手数',
      dataIndex: 'lots',
      key: 'lots',
      width: 82,
    },
    {
      title: '触发价',
      dataIndex: 'targetPrice',
      key: 'targetPrice',
      width: 96,
      render: formatPrice,
    },
    {
      title: '止损/止盈',
      key: 'risk',
      width: 130,
      render: (_, record) => `${record.stopLoss ? formatPrice(record.stopLoss) : '-'} / ${record.takeProfit ? formatPrice(record.takeProfit) : '-'}`,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'action',
      width: 84,
      render: (_, record) => (
        <Button size="small" icon={<CloseCircleOutlined />} onClick={() => handleCancelOrder(record)} loading={acting}>
          取消
        </Button>
      ),
    },
  ];

  const logColumns: ColumnsType<ManualSimTradeLog> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: formatDateTime,
    },
    {
      title: '动作',
      dataIndex: 'action',
      key: 'action',
      width: 90,
      render: (value) => <Tag>{actionLabel(value)}</Tag>,
    },
    {
      title: '方向',
      dataIndex: 'side',
      key: 'side',
      width: 82,
      render: sideTag,
    },
    {
      title: '手数',
      dataIndex: 'lots',
      key: 'lots',
      width: 82,
      render: (value) => value || '-',
    },
    {
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      width: 96,
      render: (value) => value ? formatPrice(value) : '-',
    },
    {
      title: '盈亏',
      dataIndex: 'pnl',
      key: 'pnl',
      width: 100,
      render: (value) => <Text type={Number(value || 0) >= 0 ? 'success' : 'danger'}>{formatMoney(value)}</Text>,
    },
    {
      title: '余额',
      dataIndex: 'balanceAfter',
      key: 'balanceAfter',
      width: 110,
      render: formatMoney,
    },
    {
      title: '备注',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
    },
  ];

  return (
    <div className="workspace-page manual-sim-page">
      <PageHeader
        eyebrow="Manual Simulator"
        title="手动模拟账户"
        description="实时行情、手动买卖、预下单和仿真持仓"
        meta={(
          <Space wrap>
            <span className="pill blue">XAU/USD</span>
            <span className={quote?.source === '模拟数据' ? 'pill amber' : 'pill green'}>{quote?.source || '读取中'}</span>
          </Space>
        )}
        actions={(
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => loadAccount('settle')} loading={loading}>
              刷新撮合
            </Button>
            <Button icon={<UndoOutlined />} onClick={handleReset} loading={acting}>
              重置100万
            </Button>
          </Space>
        )}
      />

      <Row gutter={[12, 12]} className="manual-sim-kpis">
        <Col xs={24} md={8} xl={4}>
          <div className="metric-tile">
            <div className="metric-tile-label">余额</div>
            <div className="metric-tile-value">{formatMoney(account?.balance)}</div>
          </div>
        </Col>
        <Col xs={24} md={8} xl={4}>
          <div className="metric-tile">
            <div className="metric-tile-label">权益</div>
            <div className="metric-tile-value">{formatMoney(account?.equity)}</div>
          </div>
        </Col>
        <Col xs={24} md={8} xl={4}>
          <div className="metric-tile">
            <div className="metric-tile-label">浮动盈亏</div>
            <div className={`metric-tile-value ${pnlColor === 'success' ? 'green' : 'red'}`}>{formatMoney(account?.unrealizedPnl)}</div>
          </div>
        </Col>
        <Col xs={24} md={8} xl={4}>
          <div className="metric-tile">
            <div className="metric-tile-label">已实现</div>
            <div className={`metric-tile-value ${Number(account?.realizedPnl || 0) >= 0 ? 'green' : 'red'}`}>{formatMoney(account?.realizedPnl)}</div>
          </div>
        </Col>
        <Col xs={24} md={8} xl={4}>
          <div className="metric-tile">
            <div className="metric-tile-label">保证金</div>
            <div className="metric-tile-value">{formatMoney(account?.margin)}</div>
          </div>
        </Col>
        <Col xs={24} md={8} xl={4}>
          <div className="metric-tile">
            <div className="metric-tile-label">可用保证金</div>
            <div className="metric-tile-value">{formatMoney(account?.freeMargin)}</div>
          </div>
        </Col>
      </Row>

      <div className="manual-sim-grid">
        <Card
          className="workspace-card manual-quote-card"
          title="实时行情"
          extra={<Tag color={Number(quote?.change || 0) >= 0 ? 'success' : 'error'}>{Number(quote?.changePct || 0).toFixed(2)}%</Tag>}
        >
          <Statistic
            title="现货黄金 XAU/USD"
            value={quotePrice}
            precision={2}
            valueStyle={{ color: Number(quote?.change || 0) >= 0 ? '#059669' : '#dc2626' }}
          />
          <div className="manual-quote-meta">
            <span>涨跌 {formatMoney(quote?.change)}</span>
            <span>最高 {formatPrice(quote?.high)}</span>
            <span>最低 {formatPrice(quote?.low)}</span>
          </div>
          <Alert
            className="manual-sim-alert"
            type="info"
            showIcon
            message={`总盈亏 ${formatMoney(totalPnl)}`}
            description={`1手=100盎司，当前估算保证金 ${formatMoney(estimatedMargin)}。`}
          />
        </Card>

        <Card className="workspace-card manual-order-card" title="下单面板" extra={<Tag color={orderType === 'market' ? 'processing' : 'warning'}>{orderTypeLabel(orderType)}</Tag>}>
          <div className="manual-order-form">
            <Segmented
              block
              value={orderType}
              onChange={(value) => setOrderType(value as ManualSimOrderType)}
              options={[
                { value: 'market', label: '市价' },
                { value: 'limit', label: '限价' },
                { value: 'stop', label: '突破' },
              ]}
            />
            <Segmented
              block
              value={side}
              onChange={(value) => setSide(value as ManualSimSide)}
              options={[
                { value: 'buy', label: '买入' },
                { value: 'sell', label: '卖出' },
              ]}
            />
            <InputNumber min={0.01} max={100} step={0.01} value={lots} onChange={(value) => setLots(Number(value || 0.01))} addonAfter="手" />
            <InputNumber
              min={1}
              step={0.01}
              value={targetPrice}
              disabled={orderType === 'market'}
              onChange={(value) => setTargetPrice(Number(value || 0))}
              addonBefore={<FieldTimeOutlined />}
              addonAfter="触发价"
            />
            <InputNumber min={1} step={0.01} value={stopLoss} onChange={(value) => setStopLoss(value === null ? null : Number(value))} addonAfter="止损" />
            <InputNumber min={1} step={0.01} value={takeProfit} onChange={(value) => setTakeProfit(value === null ? null : Number(value))} addonAfter="止盈" />
            <Input maxLength={120} value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注" />
            <Button
              type="primary"
              danger={side === 'sell'}
              size="large"
              icon={side === 'buy' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              onClick={handlePlaceOrder}
              loading={acting}
            >
              {side === 'buy' ? '买入' : '卖出'} {orderTypeLabel(orderType)}
            </Button>
          </div>
        </Card>

        <Card className="workspace-card manual-risk-card" title="账户风控">
          <div className="manual-risk-list">
            <div>
              <span>持仓</span>
              <strong>{account?.positions.length || 0}</strong>
            </div>
            <div>
              <span>预下单</span>
              <strong>{account?.pendingOrders.length || 0}</strong>
            </div>
            <div>
              <span>保证金占用</span>
              <strong>{account?.equity ? `${((Number(account.margin || 0) / Math.max(Number(account.equity || 1), 1)) * 100).toFixed(1)}%` : '0.0%'}</strong>
            </div>
            <div>
              <span>净值变化</span>
              <strong className={totalPnl >= 0 ? 'green' : 'red'}>{formatMoney(totalPnl)}</strong>
            </div>
          </div>
        </Card>
      </div>

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={16}>
          <Card className="workspace-card" title="当前持仓" extra={<Tag>{account?.positions.length || 0} 单</Tag>}>
            <Table
              size="small"
              rowKey="positionId"
              columns={positionColumns}
              dataSource={account?.positions || []}
              pagination={false}
              scroll={{ x: 900 }}
              locale={{ emptyText: '暂无持仓' }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card className="workspace-card" title="预下单" extra={<Tag icon={<ShoppingCartOutlined />}>{account?.pendingOrders.length || 0}</Tag>}>
            <Table
              size="small"
              rowKey="orderId"
              columns={orderColumns}
              dataSource={account?.pendingOrders || []}
              pagination={false}
              scroll={{ x: 720 }}
              locale={{ emptyText: '暂无预下单' }}
            />
          </Card>
        </Col>
      </Row>

      <Card className="workspace-card" title="成交与操作流水">
        <Table
          size="small"
          rowKey="tradeId"
          columns={logColumns}
          dataSource={(account?.tradeLog || []).slice(0, 20)}
          pagination={false}
          scroll={{ x: 920 }}
          locale={{ emptyText: '暂无流水' }}
        />
      </Card>
    </div>
  );
}

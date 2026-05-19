import type { Signal, DailyStats } from '@/types';
import { Card, Statistic, Row, Col, List, Tag } from 'antd';

interface SignalPanelProps {
  signals: Signal[];
  stats: DailyStats;
}

/**
 * 信号面板组件 - 使用 Ant Design 组件
 */
export function SignalPanel({ signals, stats }: SignalPanelProps) {
  const { signalCount, winRate, netProfit } = stats;

  // 获取今天的信号
  const today = new Date().setHours(0, 0, 0, 0);
  const todaySignals = signals.filter(s => new Date(s.timestamp).getTime() >= today);

  // 获取信号状态标签
  const getStatusTag = (signal: Signal) => {
    if (signal.status === 'profit') {
      return <Tag color="success">止盈</Tag>;
    } else if (signal.status === 'loss') {
      return <Tag color="error">亏损</Tag>;
    } else {
      return <Tag color="processing">持仓中</Tag>;
    }
  };

  // 获取方向标签
  const getDirectionTag = (signal: Signal) => {
    if (signal.direction === 'long') {
      return <Tag color="purple">做多</Tag>;
    } else {
      return <Tag color="orange">做空</Tag>;
    }
  };

  return (
    <Card
      title="今日信号统计"
      className="shadow-sm"
      bordered={false}
      styles={{
        body: { padding: '16px' }
      }}
    >
      {/* 统计数据 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Statistic
            title="信号数"
            value={signalCount}
            valueStyle={{ color: '#3f8600', fontSize: 24, fontWeight: 600 }}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="胜率"
            value={winRate}
            suffix="%"
            precision={1}
            valueStyle={{
              color: winRate >= 60 ? '#3f8600' : winRate >= 40 ? '#faad14' : '#cf1322',
              fontSize: 24,
              fontWeight: 600
            }}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="净盈利"
            value={netProfit}
            precision={2}
            prefix={netProfit >= 0 ? '+' : ''}
            valueStyle={{
              color: netProfit >= 0 ? '#3f8600' : '#cf1322',
              fontSize: 24,
              fontWeight: 600
            }}
          />
        </Col>
      </Row>

      {/* 信号记录 */}
      <div style={{ marginTop: 16 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 500,
          marginBottom: 12,
          color: '#8c8c8c'
        }}>
          今日信号记录
        </div>
        {todaySignals.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '24px',
            color: '#bfbfbf',
            fontSize: 14
          }}>
            暂无信号记录
          </div>
        ) : (
          <List
            size="small"
            dataSource={todaySignals}
            renderItem={(signal) => (
              <List.Item>
                <div style={{ width: '100%' }}>
                  {/* 第一行：时间和方向 */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8
                  }}>
                    <span style={{
                      fontFamily: 'monospace',
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#595959'
                    }}>
                      {new Date(signal.timestamp).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      {getDirectionTag(signal)}
                      {getStatusTag(signal)}
                    </span>
                  </div>

                  {/* 第二行：价格和盈亏 */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 13
                  }}>
                    <span style={{ color: '#8c8c8c' }}>
                      入场: ${signal.entryPrice.toFixed(2)}
                    </span>
                    {signal.profit !== undefined && signal.profit !== 0 && (
                      <span
                        style={{
                          fontWeight: 500,
                          color: signal.profit >= 0 ? '#3f8600' : '#cf1322'
                        }}
                      >
                        {signal.profit >= 0 ? '+' : ''}{signal.profit.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </div>
    </Card>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Radio, Button, Input, Space, Typography, Card, Alert, Statistic, Row, Col, message } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined, CopyOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface QuotaInfo {
  limit: number;
  used: number;
  remaining: number;
  resetTime: string;
}

interface DataSource {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

type RefreshInterval = '1m' | '5m' | '10m' | 'never';

/**
 * 数据源设置组件
 */
export function DataSourceSettings() {
  const [currentSource, setCurrentSource] = useState<string>('eastmoney');
  const [availableSources, setAvailableSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>('never');
  const [nextRefreshIn, setNextRefreshIn] = useState<number>(0);
  const intervalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Twelve Data API Key 状态
  const [apiKey, setApiKey] = useState<string>('');
  const [savingKey, setSavingKey] = useState(false);

  // 配额信息状态
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);

  // 加载数据源列表和当前数据源
  useEffect(() => {
    loadDataSources();
    loadRefreshInterval();
    loadApiKey();
    if (currentSource === 'twelvedata') {
      loadQuota();
    }
  }, []);

  // 当切换到 Twelve Data 时，加载 API Key 和配额信息
  useEffect(() => {
    if (currentSource === 'twelvedata') {
      loadApiKey();
      loadQuota();
    }
  }, [currentSource]);

  // 加载配额信息
  const loadQuota = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3006';
      const response = await fetch(`${apiUrl}/api/datasource/twelvedata/quota`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setQuotaInfo(data.data);
        }
      }
    } catch (err) {
      console.error('加载配额信息失败:', err);
    }
  };

  // 倒计时显示
  useEffect(() => {
    if (refreshInterval === 'never' || nextRefreshIn <= 0) {
      return;
    }

    intervalTimerRef.current = setInterval(() => {
      setNextRefreshIn(prev => {
        if (prev <= 1) {
          // 触发刷新
          handleManualRefresh();
          return getIntervalSeconds(refreshInterval);
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
      }
    };
  }, [refreshInterval, nextRefreshIn]);

  const getIntervalSeconds = (interval: RefreshInterval): number => {
    switch (interval) {
      case '1m': return 60;
      case '5m': return 300;
      case '10m': return 600;
      case 'never': return 0;
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const loadRefreshInterval = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3006';
      const response = await fetch(`${apiUrl}/api/datasource/refresh-interval`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const interval = data.data.interval as RefreshInterval;
          setRefreshInterval(interval);
          if (interval !== 'never') {
            setNextRefreshIn(getIntervalSeconds(interval));
          }
        }
      }
    } catch (err) {
      console.error('加载刷新间隔失败:', err);
    }
  };

  const handleRefreshIntervalChange = async (interval: RefreshInterval) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3006';
      const response = await fetch(`${apiUrl}/api/datasource/refresh-interval`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ interval }),
      });

      if (!response.ok) {
        throw new Error('设置刷新间隔失败');
      }

      const data = await response.json();
      if (data.success) {
        setRefreshInterval(interval);
        setNextRefreshIn(interval === 'never' ? 0 : getIntervalSeconds(interval));
        setSuccess('刷新间隔已更新');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置刷新间隔失败');
    }
  };

  const handleManualRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3006';

      // 触发后端刷新数据源缓存
      const response = await fetch(`${apiUrl}/api/datasource/refresh`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('刷新数据失败');
      }

      const data = await response.json();
      if (data.success) {
        setSuccess('数据已刷新');
        setTimeout(() => setSuccess(null), 3000);

        // 重置倒计时
        if (refreshInterval !== 'never') {
          setNextRefreshIn(getIntervalSeconds(refreshInterval));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新数据失败');
    } finally {
      setRefreshing(false);
    }
  };

  const loadApiKey = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3006';
      const response = await fetch(`${apiUrl}/api/datasource/twelvedata/apikey`);

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.apiKey) {
          setApiKey(data.data.apiKey);
        }
      }
    } catch (err) {
      console.error('加载API Key失败:', err);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      setError('API Key 不能为空');
      return;
    }

    try {
      setSavingKey(true);
      setError(null);

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3006';
      const response = await fetch(`${apiUrl}/api/datasource/twelvedata/apikey`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });

      if (!response.ok) {
        throw new Error('保存API Key失败');
      }

      const data = await response.json();
      if (data.success) {
        setSuccess('API Key 已保存');
        setTimeout(() => setSuccess(null), 3000);
        // 重新加载配额信息
        loadQuota();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存API Key失败');
    } finally {
      setSavingKey(false);
    }
  };

  const handleTestApiKey = async () => {
    if (!apiKey.trim()) {
      setError('请先输入 API Key');
      return;
    }

    try {
      setSavingKey(true);
      setError(null);

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3006';
      const response = await fetch(`${apiUrl}/api/datasource/twelvedata/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });

      const data = await response.json();
      if (data.success) {
        setSuccess('API Key 验证成功');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error?.message || 'API Key 验证失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API Key 验证失败');
    } finally {
      setSavingKey(false);
    }
  };

  const loadDataSources = async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3006';

      // 并行获取当前数据源和可用数据源列表
      const [currentRes, sourcesRes] = await Promise.all([
        fetch(`${apiUrl}/api/datasource`),
        fetch(`${apiUrl}/api/datasources`),
      ]);

      if (!currentRes.ok || !sourcesRes.ok) {
        throw new Error('加载数据源失败');
      }

      const currentData = await currentRes.json();
      const sourcesData = await sourcesRes.json();

      if (currentData.success) {
        setCurrentSource(currentData.data.currentSource);
      }

      if (sourcesData.success) {
        setAvailableSources(sourcesData.data.dataSources);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据源失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSourceChange = async (sourceId: string) => {
    try {
      setSwitching(true);
      setError(null);
      setSuccess(null);

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3006';

      const response = await fetch(`${apiUrl}/api/datasource`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source: sourceId }),
      });

      if (!response.ok) {
        throw new Error('切换数据源失败');
      }

      const data = await response.json();

      if (data.success) {
        setCurrentSource(data.data.currentSource);
        setSuccess(`已切换到 ${availableSources.find(s => s.id === sourceId)?.name}`);

        // 3秒后清除成功消息
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换数据源失败');
    } finally {
      setSwitching(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <ReloadOutlined spin style={{ fontSize: '24px', color: '#1890ff' }} />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 标题和刷新按钮 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>数据源设置</Typography.Title>
            <Typography.Text type="secondary">选择黄金价格数据的来源</Typography.Text>
          </div>
          <Button
            icon={<ReloadOutlined spin={refreshing} />}
            onClick={handleManualRefresh}
            loading={refreshing}
          >
            立即刷新
          </Button>
        </div>

        {/* 倒计时显示 */}
        {refreshInterval !== 'never' && nextRefreshIn > 0 && (
          <Alert
            message={`下次刷新: ${formatTime(nextRefreshIn)}`}
            type="info"
            showIcon={false}
            style={{ maxWidth: 'fit-content' }}
          />
        )}

        {/* 错误和成功提示 */}
        {error && (
          <Alert
            message={error}
            type="error"
            closable
            onClose={() => setError(null)}
          />
        )}

        {success && (
          <Alert
            message={success}
            type="success"
            closable
            showIcon
            onClose={() => setSuccess(null)}
          />
        )}

        {/* 数据源选择 */}
        <Card title="选择数据源" size="small">
          <Radio.Group
            value={currentSource}
            onChange={(e) => handleSourceChange(e.target.value)}
            disabled={switching}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {availableSources.map((source) => (
                <Radio
                  key={source.id}
                  value={source.id}
                  disabled={!source.enabled}
                >
                  <Space>
                    <Text strong>{source.name}</Text>
                    {currentSource === source.id && (
                      <Text type="secondary" style={{ fontSize: '12px' }}>(当前使用)</Text>
                    )}
                  </Space>
                  <div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {source.description}
                    </Text>
                  </div>
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </Card>

        {/* Twelve Data API Key 配置 */}
        {currentSource === 'twelvedata' && (
          <Card
            title="Twelve Data API 配置"
            size="small"
            extra={
              <a
                href="https://twelvedata.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                获取 API Key
              </a>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              {/* 配额信息 */}
              {quotaInfo && (
                <Card size="small" style={{ background: quotaInfo.remaining === 0 ? '#fff1f0' : '#f6ffed' }}>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Statistic
                        title="每日限制"
                        value={quotaInfo.limit}
                        suffix="次"
                        valueStyle={{ color: quotaInfo.remaining === 0 ? '#cf1322' : '#3f8600', fontSize: 14 }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="已使用"
                        value={quotaInfo.used}
                        suffix="次"
                        valueStyle={{ color: '#1890ff', fontSize: 14 }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="剩余次数"
                        value={quotaInfo.remaining}
                        suffix="次"
                        valueStyle={{
                          color: quotaInfo.remaining === 0 ? '#cf1322' : '#52c41a',
                          fontSize: 16,
                          fontWeight: 'bold'
                        }}
                      />
                    </Col>
                  </Row>
                  <div style={{ marginTop: '12px', fontSize: '12px', color: '#666' }}>
                    <ClockCircleOutlined style={{ marginRight: '4px' }} />
                    重置时间: {new Date(quotaInfo.resetTime).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </Card>
              )}

              <div>
                <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                  API Key <Text type="danger">*</Text>
                </Text>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Input.TextArea
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="请输入 Twelve Data API Key"
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    style={{ maxWidth: '600px', fontFamily: 'monospace', fontSize: '13px' }}
                  />
                  <Space>
                    <Button
                      icon={<CopyOutlined />}
                      onClick={() => {
                        if (apiKey) {
                          navigator.clipboard.writeText(apiKey);
                          message.success('API Key 已复制');
                        }
                      }}
                      disabled={!apiKey}
                    >
                      复制完整 Key
                    </Button>
                  </Space>
                </Space>
              </div>
              <Space>
                <Button
                  type="primary"
                  onClick={handleSaveApiKey}
                  loading={savingKey}
                  disabled={!apiKey.trim()}
                  icon={<CheckCircleOutlined />}
                >
                  保存 API Key
                </Button>
                <Button
                  onClick={handleTestApiKey}
                  loading={savingKey}
                  disabled={!apiKey.trim()}
                >
                  验证 API Key
                </Button>
                <Button
                  onClick={loadQuota}
                  icon={<ReloadOutlined />}
                >
                  刷新配额
                </Button>
              </Space>
            </Space>
          </Card>
        )}

        {/* 自动刷新间隔 */}
        <Card title="自动刷新间隔" size="small">
          <Radio.Group
            value={refreshInterval}
            onChange={(e) => handleRefreshIntervalChange(e.target.value)}
          >
            <Space>
              <Radio.Button value="1m">1分钟</Radio.Button>
              <Radio.Button value="5m">5分钟</Radio.Button>
              <Radio.Button value="10m">10分钟</Radio.Button>
              <Radio.Button value="never">不刷新</Radio.Button>
            </Space>
          </Radio.Group>
        </Card>

        {/* 数据源说明 */}
        <Card title="数据源说明" size="small">
          <Paragraph style={{ marginBottom: 0 }}>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              <li><strong>模拟数据</strong>：用于演示的生成数据，价格为美元/盎司</li>
              <li><strong>Twelve Data</strong>：支持分钟级K线数据的专业行情API（需配置API Key）</li>
            </ul>
          </Paragraph>
        </Card>
      </Space>
    </div>
  );
}

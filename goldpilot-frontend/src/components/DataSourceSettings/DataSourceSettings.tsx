import { useState, useEffect, useRef } from 'react';
import { Radio, Button, Input, Space, Typography, Card, Alert, Statistic, Row, Col, message } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined, CopyOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/PageHeader';

const { Text, Paragraph } = Typography;

interface QuotaInfo {
  limit: number;
  used: number;
  remaining: number;
  resetTime: string;
  keyCount?: number;
  activeKeyLabel?: string;
  activeWindow?: string;
  rotationMode?: 'single' | 'split_12h';
}

interface DataSource {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

type RefreshInterval = '1m' | '5m' | '10m' | 'never';

/**
 * 获取 API 基础 URL
 */
const getApiUrl = (): string => {
  const apiUrl = import.meta.env.VITE_API_URL ?? '';
  // 处理相对路径：如果是 '/'，则返回空字符串避免双斜杠
  return apiUrl === '/' ? '' : apiUrl;
};

/**
 * 数据源设置组件
 */
export function DataSourceSettings() {
  const [currentSource, setCurrentSource] = useState<string>('twelvedata');
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
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [savedApiKeyLabel, setSavedApiKeyLabel] = useState('');
  const [savedKeyCount, setSavedKeyCount] = useState(0);
  const [activeKeyLabel, setActiveKeyLabel] = useState('');
  const [activeWindow, setActiveWindow] = useState('');
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
      const apiUrl = getApiUrl();
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
      const apiUrl = getApiUrl();
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
      const apiUrl = getApiUrl();
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
        window.dispatchEvent(new CustomEvent('goldpilot-refresh-interval-change', { detail: interval }));
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

      const apiUrl = getApiUrl();

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
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/datasource/twelvedata/apikey`);

      if (response.ok) {
        const data = await response.json();
        // 只显示已配置状态，不加载遮蔽的API Key到输入框
        if (data.success) {
          setHasSavedApiKey(!!data.data.hasKey);
          setSavedApiKeyLabel(data.data.apiKey || '');
          setSavedKeyCount(data.data.keyCount || 0);
          setActiveKeyLabel(data.data.activeKeyLabel || '');
          setActiveWindow(data.data.activeWindow || '');
          setApiKey('');
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

      const apiUrl = getApiUrl();
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
        setSuccess(data.data.keyCount >= 2 ? '2 个 API Key 已保存，已启用 12 小时轮换' : 'API Key 已保存');
        setTimeout(() => setSuccess(null), 3000);
        setApiKey('');
        // 重新加载配额信息
        await loadApiKey();
        loadQuota();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存API Key失败');
    } finally {
      setSavingKey(false);
    }
  };

  const handleTestApiKey = async () => {
    if (!apiKey.trim() && !hasSavedApiKey) {
      setError('请先输入或保存 API Key');
      return;
    }

    try {
      setSavingKey(true);
      setError(null);

      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/datasource/twelvedata/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });

      const data = await response.json();
      if (data.success) {
        setSuccess(data.data?.keyCount >= 2 ? '2 个 API Key 验证成功' : (apiKey.trim() ? 'API Key 验证成功' : '已保存 API Key 验证成功'));
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
      const apiUrl = getApiUrl();

      // 处理相对路径：如果是 '/'，则去掉前面的斜杠避免双斜杠
      const baseUrl = apiUrl === '/' ? '' : apiUrl;

      // 并行获取当前数据源和可用数据源列表
      const [currentRes, sourcesRes] = await Promise.all([
        fetch(`${baseUrl}/api/datasource`),
        fetch(`${baseUrl}/api/datasources`),
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

      const apiUrl = getApiUrl();

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
    <div className="workspace-page">
      <PageHeader
        eyebrow="Market Data"
        title="数据源设置"
        description="黄金 K 线来源、API Key 和刷新策略"
        meta={refreshInterval !== 'never' && nextRefreshIn > 0 ? (
          <span className="pill blue">下次刷新 {formatTime(nextRefreshIn)}</span>
        ) : (
          <span className="pill">手动刷新</span>
        )}
        actions={(
          <Button
            icon={<ReloadOutlined spin={refreshing} />}
            onClick={handleManualRefresh}
            loading={refreshing}
          >
            立即刷新
          </Button>
        )}
      />
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
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
        <Card className="workspace-card" title="选择数据源" size="small">
          <Radio.Group
            value={currentSource}
            onChange={(e) => handleSourceChange(e.target.value)}
            disabled={switching}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {availableSources.map((source) => (
                <Radio
                  key={source.id}
                  value={source.id}
                  disabled={!source.enabled}
                  className="data-source-option"
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
            className="workspace-card"
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
                <div className={quotaInfo.remaining === 0 ? 'quota-panel quota-panel-danger' : 'quota-panel'}>
                  <Row gutter={16}>
                    <Col span={6}>
                      <Statistic
                        title="每日限制"
                        value={quotaInfo.limit}
                        suffix="次"
                        valueStyle={{ color: quotaInfo.remaining === 0 ? '#cf1322' : '#3f8600', fontSize: 14 }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="已使用"
                        value={quotaInfo.used}
                        suffix="次"
                        valueStyle={{ color: '#1890ff', fontSize: 14 }}
                      />
                    </Col>
                    <Col span={6}>
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
                    <Col span={6}>
                      <Statistic
                        title="当前账号"
                        value={quotaInfo.activeKeyLabel || activeKeyLabel || '单 Key'}
                        valueStyle={{ color: '#1769e0', fontSize: 14, fontWeight: 'bold' }}
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
                    {(quotaInfo.keyCount || savedKeyCount) >= 2 && (
                      <Text type="secondary" style={{ marginLeft: 12 }}>
                        {quotaInfo.activeWindow || activeWindow}，已配置 {quotaInfo.keyCount || savedKeyCount} 个 Key
                      </Text>
                    )}
                  </div>
                </div>
              )}

              <div>
                <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                  API Key <Text type="danger">*</Text>
                </Text>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {hasSavedApiKey && (
                    <Alert
                      type="success"
                      showIcon
                      message={`API Key 已保存${savedApiKeyLabel ? `：${savedApiKeyLabel}` : ''}`}
                      description={(savedKeyCount >= 2 || activeKeyLabel)
                        ? `双 Key 模式：北京时间 00:00-11:59 使用 A，12:00-23:59 使用 B。当前 ${activeKeyLabel || '自动选择'}，${activeWindow || '按北京时间切换'}。`
                        : '为安全起见，页面不会回显完整 Key；需要更换时输入新的完整 Key 再保存。'}
                    />
                  )}
                  <Input.TextArea
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={hasSavedApiKey ? '已保存 API Key。如需更换，请输入 1 个或 2 个完整 Key' : '请输入 Twelve Data API Key；两个 Key 可用换行、逗号或分号分隔'}
                    autoSize={{ minRows: 2, maxRows: 5 }}
                    style={{ maxWidth: '600px', fontFamily: 'monospace', fontSize: '13px' }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    输入 2 个 Key 时，系统会按北京时间自动轮换：第 1 个用于 00:00-11:59，第 2 个用于 12:00-23:59。
                  </Text>
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
                      复制当前输入
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
                  disabled={!apiKey.trim() && !hasSavedApiKey}
                >
                  {apiKey.trim() ? '验证输入 Key' : '验证已保存 Key'}
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
        <Card className="workspace-card" title="自动刷新间隔" size="small">
          <Radio.Group
            value={refreshInterval}
            onChange={(e) => handleRefreshIntervalChange(e.target.value)}
          >
            <Space wrap>
              <Radio.Button value="1m">1分钟</Radio.Button>
              <Radio.Button value="5m">5分钟</Radio.Button>
              <Radio.Button value="10m">10分钟</Radio.Button>
              <Radio.Button value="never">不刷新</Radio.Button>
            </Space>
          </Radio.Group>
        </Card>

        {/* 数据源说明 */}
        <Card className="workspace-card" title="数据源说明" size="small">
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

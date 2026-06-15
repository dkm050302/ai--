import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Card, Button, Form, Input, Modal, message, Descriptions, Tag, Space, Row, Col, Statistic, Select } from 'antd';
import {
  ApiOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  LogoutOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  SaveOutlined,
  SearchOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { authFetch } from '@/utils/apiConfig';
import { PageHeader } from '@/components/PageHeader';
import { GOLD_STRATEGY_LIBRARY, getStrategyCapitalPct, getStrategyDecision } from '@/constants/goldStrategies';

interface AIConfig {
  provider: string;
  apiKey: string;
  status: 'connected' | 'disconnected';
  lastUsed?: string;
  modelName?: string;
  baseUrl?: string;
  scope?: 'global' | 'user';
}

type RobotStatus = 'running' | 'stopped';

interface RobotTemplate {
  strategy: string;
  title: string;
  description: string;
  risk: string;
  tags: string[];
  featured?: boolean;
}

interface TradingRobot {
  id: string;
  name: string;
  strategy: string;
  symbol: string;
  market: string;
  risk: string;
  tags: string[];
  status: RobotStatus;
  equity: number;
  pnl: number;
  winRate: number;
  description: string;
  createdAt: string;
}

const ROBOTS_STORAGE_KEY = 'goldpilot:trading-robots:v1';

const ROBOT_TEMPLATES: RobotTemplate[] = [
  {
    strategy: 'ai',
    title: 'AI 智能创建',
    description: '告诉 AI 你的交易想法，自动生成最优机器人配置',
    risk: '智能风控',
    tags: ['AI', '自动配置'],
    featured: true,
  },
  {
    strategy: 'grid',
    title: '网格交易',
    description: '在价格区间内自动低买高卖，适合震荡行情',
    risk: '中风险',
    tags: ['中风险', '震荡行情'],
  },
  {
    strategy: 'martingale',
    title: '马丁格尔',
    description: '下跌时逐步加仓摊平成本，反弹后获利',
    risk: '高风险',
    tags: ['高风险', '抄底策略'],
  },
  {
    strategy: 'trend',
    title: '趋势跟随',
    description: '顺势而为，跟随趋势方向入场',
    risk: '中风险',
    tags: ['中风险', '单边行情'],
  },
  {
    strategy: 'dca',
    title: 'DCA 定投',
    description: '定时定额买入，长期摊平成本',
    risk: '低风险',
    tags: ['低风险', '长期定投'],
  },
];

function readStoredRobots(): TradingRobot[] {
  try {
    const raw = window.localStorage.getItem(ROBOTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function AIAccount() {
  const [loading, setLoading] = useState(false);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [robots, setRobots] = useState<TradingRobot[]>([]);
  const [robotModalVisible, setRobotModalVisible] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<RobotTemplate | null>(null);
  const [robotSearch, setRobotSearch] = useState('');
  const [robotStatusFilter, setRobotStatusFilter] = useState<'all' | RobotStatus>('all');
  const [form] = Form.useForm();
  const [robotForm] = Form.useForm();
  const usesGlobalAIConfig = aiConfig?.scope === 'global';

  const maskApiKey = (key: string): string => {
    if (!key || key.length < 8) return '****';
    return key.slice(0, 4) + '****' + key.slice(-4);
  };

  const loadAIConfig = useCallback(async () => {
    try {
      const response = await authFetch('/api/ai/config');
      const data = await response.json();

      if (data.success) {
        if (data.data) {
          // 隐藏API key的部分内容
          const maskedData = {
            ...data.data,
            apiKey: data.data.apiKey ? maskApiKey(data.data.apiKey) : '',
          };
          setAiConfig(maskedData);
        }
      }
    } catch (error) {
      console.error('Load AI config error:', error);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadAIConfig();
      setRobots(readStoredRobots());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAIConfig]);

  const persistRobots = useCallback((nextRobots: TradingRobot[]) => {
    setRobots(nextRobots);
    window.localStorage.setItem(ROBOTS_STORAGE_KEY, JSON.stringify(nextRobots));
  }, []);

  const robotMetrics = useMemo(() => {
    const running = robots.filter((robot) => robot.status === 'running').length;
    const stopped = robots.length - running;
    const equity = robots.reduce((sum, robot) => sum + robot.equity, 0);
    const pnl = robots.reduce((sum, robot) => sum + robot.pnl, 0);

    return { running, stopped, equity, pnl };
  }, [robots]);

  const aiTraderPlan = useMemo(() => {
    const rows = GOLD_STRATEGY_LIBRARY.map((strategy) => {
      const allocationPct = getStrategyCapitalPct(strategy);
      const decision = getStrategyDecision(strategy);
      return {
        ...strategy,
        decision,
        allocationPct,
        allocation: Number(((1_000_000 * allocationPct) / 100).toFixed(2)),
      };
    });
    const running = rows.filter((row) => row.decision === '运行');
    const observing = rows.filter((row) => row.decision === '观察');
    const paused = rows.filter((row) => row.decision === '暂停');

    return {
      rows,
      running,
      observing,
      paused,
      runningCapital: running.reduce((sum, row) => sum + row.allocation, 0),
      observingCapital: observing.reduce((sum, row) => sum + row.allocation, 0),
    };
  }, []);

  const filteredRobots = useMemo(() => {
    const keyword = robotSearch.trim().toLowerCase();

    return robots.filter((robot) => {
      const matchesStatus = robotStatusFilter === 'all' || robot.status === robotStatusFilter;
      const matchesKeyword = !keyword || [
        robot.name,
        robot.symbol,
        robot.strategy,
        robot.market,
      ].some((value) => value.toLowerCase().includes(keyword));

      return matchesStatus && matchesKeyword;
    });
  }, [robotSearch, robotStatusFilter, robots]);

  const openRobotCreator = (template: RobotTemplate) => {
    setSelectedTemplate(template);
    robotForm.resetFields();
    robotForm.setFieldsValue({
      name: template.featured ? 'AI 黄金趋势机器人' : `${template.title}机器人`,
      symbol: 'XAUUSD',
      market: '黄金',
      risk: template.risk,
      idea: template.featured ? '根据黄金 XAU/USD 趋势、美元指数和重要数据事件自动判断入场方向。' : template.description,
      status: 'running',
    });
    setRobotModalVisible(true);
  };

  const handleCreateRobot = async () => {
    try {
      const values = await robotForm.validateFields();
      const template = selectedTemplate || ROBOT_TEMPLATES[0];
      const nextRobot: TradingRobot = {
        id: `robot-${Date.now()}`,
        name: values.name,
        strategy: template.title,
        symbol: values.symbol,
        market: values.market,
        risk: values.risk,
        tags: template.tags,
        status: values.status,
        equity: 0,
        pnl: 0,
        winRate: 0,
        description: values.idea,
        createdAt: new Date().toISOString(),
      };

      persistRobots([nextRobot, ...robots]);
      setRobotModalVisible(false);
      message.success(`${nextRobot.name} 已创建`);
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    }
  };

  const updateRobotStatus = (robotId: string, status: RobotStatus) => {
    const nextRobots = robots.map((robot) => (
      robot.id === robotId ? { ...robot, status } : robot
    ));
    persistRobots(nextRobots);
  };

  const deleteRobot = (robotId: string) => {
    const robot = robots.find((item) => item.id === robotId);

    Modal.confirm({
      title: '删除机器人',
      content: `确认删除 ${robot?.name || '该机器人'}？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        persistRobots(robots.filter((item) => item.id !== robotId));
        message.success('机器人已删除');
      },
    });
  };

  const handleConfig = () => {
    form.resetFields();
    form.setFieldsValue({ provider: 'deepseek' });
    setConfigModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      setLoading(true);
      const response = await authFetch('/api/ai/config', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'deepseek',
          apiKey: values.apiKey,
        }),
      });

      const data = await response.json();

      if (data.success) {
        message.success('AI配置保存成功');
        setConfigModalVisible(false);
        loadAIConfig();
      } else {
        message.error(data.message || '保存失败');
      }
    } catch (error) {
      console.error('Save AI config error:', error);
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const response = await authFetch('/api/ai/test', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        message.success('连接测试成功！');
      } else {
        message.error(data.message || '连接测试失败');
      }
    } catch (error) {
      console.error('Test AI connection error:', error);
      message.error('连接测试失败');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    Modal.confirm({
      title: '确认断开连接',
      content: '断开后将无法使用AI分析功能，确认继续？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          const response = await authFetch('/api/ai/config', {
            method: 'DELETE',
          });

          const data = await response.json();

          if (data.success) {
            message.success('已断开AI连接');
            setAiConfig(null);
          } else {
            message.error(data.message || '操作失败');
          }
        } catch (error) {
          console.error('Disconnect AI error:', error);
          message.error('操作失败');
        }
      },
    });
  };

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="AI Trader"
        title="AI交易员"
        description="AI自主读取黄金策略库，决定哪些策略运行、观察或暂停，并分配100万虚拟资金"
        meta={aiConfig ? <Tag color="success">已连接</Tag> : <Tag color="warning">未配置</Tag>}
        actions={(
          <Space>
            <Button
              icon={<ApiOutlined />}
              onClick={() => window.open('https://platform.deepseek.com/api_keys', '_blank')}
            >
              获取API Key
            </Button>
          </Space>
        )}
      />

      <section className="ai-trader-desk">
        <div className="ai-trader-hero">
          <div>
            <span>GoldPilot Autonomous Allocation</span>
            <h2>AI交易员正在管理 XAUUSD 策略组合</h2>
            <p>当前仅针对黄金品种，策略决策来自策略标签、风险等级和适配市场状态。稳健与防守策略优先运行，高波动和重大数据策略进入观察队列。</p>
          </div>
          <div className="ai-trader-capital">
            <strong>$1,000,000</strong>
            <span>虚拟策略资金池</span>
          </div>
        </div>

        <div className="ai-trader-kpis">
          <div>
            <span>运行策略</span>
            <strong>{aiTraderPlan.running.length}</strong>
            <em>${aiTraderPlan.runningCapital.toLocaleString()}</em>
          </div>
          <div>
            <span>观察策略</span>
            <strong>{aiTraderPlan.observing.length}</strong>
            <em>${aiTraderPlan.observingCapital.toLocaleString()}</em>
          </div>
          <div>
            <span>暂停策略</span>
            <strong>{aiTraderPlan.paused.length}</strong>
            <em>等待风控触发</em>
          </div>
          <div>
            <span>策略总数</span>
            <strong>{aiTraderPlan.rows.length}</strong>
            <em>全部来自黄金策略库</em>
          </div>
        </div>

        <div className="ai-trader-strategy-list">
          {aiTraderPlan.rows.map((strategy) => (
            <article className="ai-trader-strategy-row" key={strategy.id}>
              <div>
                <strong>{strategy.name}</strong>
                <span>{strategy.direction} · {strategy.method} · {strategy.session} · {strategy.horizon}</span>
              </div>
              <div className="ai-trader-row-tags">
                <Tag color={strategy.decision === '运行' ? 'success' : strategy.decision === '观察' ? 'warning' : 'default'}>
                  {strategy.decision}
                </Tag>
                <Tag>{strategy.style}</Tag>
                <Tag color="blue">{strategy.allocationPct}%</Tag>
              </div>
              <strong className="ai-trader-row-money">${strategy.allocation.toLocaleString()}</strong>
            </article>
          ))}
        </div>
      </section>

      <Row gutter={[16, 16]} className="robot-metric-row">
        <Col xs={24} md={6}>
          <div className="metric-tile">
            <div className="metric-tile-icon blue"><WalletOutlined /></div>
            <div className="metric-tile-label">总权益</div>
            <div className="metric-tile-value">${robotMetrics.equity.toFixed(2)}</div>
          </div>
        </Col>
        <Col xs={24} md={6}>
          <div className="metric-tile">
            <div className="metric-tile-icon green"><ApiOutlined /></div>
            <div className="metric-tile-label">总盈亏</div>
            <div className={`metric-tile-value ${robotMetrics.pnl >= 0 ? 'green' : 'red'}`}>
              {robotMetrics.pnl >= 0 ? '+' : ''}${robotMetrics.pnl.toFixed(2)}
            </div>
          </div>
        </Col>
        <Col xs={24} md={6}>
          <div className="metric-tile">
            <div className="metric-tile-icon violet"><RobotOutlined /></div>
            <div className="metric-tile-label">运行中</div>
            <div className="metric-tile-value">{robotMetrics.running} / {robots.length}</div>
          </div>
        </Col>
        <Col xs={24} md={6}>
          <div className="metric-tile">
            <div className="metric-tile-icon amber"><PauseCircleOutlined /></div>
            <div className="metric-tile-label">已停止</div>
            <div className="metric-tile-value">{robotMetrics.stopped}</div>
          </div>
        </Col>
      </Row>

      <section className="robot-template-section">
        <div>
          <h2>黄金执行模板</h2>
          <p>仅针对 XAUUSD 创建执行模板，供 AI交易员 调用和暂停</p>
        </div>
        <div className="robot-template-grid">
          {ROBOT_TEMPLATES.map((template) => (
            <article
              className={`robot-template-card ${template.featured ? 'featured' : ''}`}
              key={template.strategy}
              role="button"
              tabIndex={0}
              onClick={() => openRobotCreator(template)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openRobotCreator(template);
                }
              }}
            >
              <div className={`robot-template-icon ${template.featured ? '' : 'soft'}`}>
                {template.featured ? <RobotOutlined /> : <ApiOutlined />}
              </div>
              <h3>{template.title}</h3>
              <p>{template.description}</p>
              <div className="robot-tags">
                {template.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
              {template.featured && (
                <Button type="primary" onClick={(event) => { event.stopPropagation(); openRobotCreator(template); }}>
                  开始创建
                </Button>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="robot-list-section" aria-label="我的机器人">
        <div className="robot-list-head">
          <h2>我的机器人 <span>({robots.length})</span></h2>
          <div className="robot-list-tools">
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索机器人名称或交易对"
              value={robotSearch}
              onChange={(event) => setRobotSearch(event.target.value)}
              allowClear
            />
            <Select
              value={robotStatusFilter}
              onChange={setRobotStatusFilter}
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'running', label: '运行中' },
                { value: 'stopped', label: '已停止' },
              ]}
            />
          </div>
        </div>
        {filteredRobots.length > 0 ? (
          <div className="robot-card-grid">
            {filteredRobots.map((robot) => (
              <article className="robot-card" key={robot.id}>
                <div className="robot-card-head">
                  <div>
                    <strong>{robot.name}</strong>
                    <span>{robot.symbol} · {robot.market}</span>
                  </div>
                  <Tag color={robot.status === 'running' ? 'success' : 'default'}>
                    {robot.status === 'running' ? '运行中' : '已停止'}
                  </Tag>
                </div>
                <p>{robot.description}</p>
                <div className="robot-card-meta">
                  <span>{robot.strategy}</span>
                  <span>{robot.risk}</span>
                  <span>胜率 {robot.winRate}%</span>
                </div>
                <div className="robot-card-stats">
                  <div>
                    <span>权益</span>
                    <strong>${robot.equity.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>盈亏</span>
                    <strong className={robot.pnl >= 0 ? 'green' : 'red'}>{robot.pnl >= 0 ? '+' : ''}${robot.pnl.toFixed(2)}</strong>
                  </div>
                </div>
                <div className="robot-card-actions">
                  {robot.status === 'running' ? (
                    <Button icon={<PauseCircleOutlined />} onClick={() => updateRobotStatus(robot.id, 'stopped')}>暂停</Button>
                  ) : (
                    <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => updateRobotStatus(robot.id, 'running')}>启动</Button>
                  )}
                  <Button danger icon={<DeleteOutlined />} onClick={() => deleteRobot(robot.id)}>删除</Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="robot-empty-state">
            <div className="robot-empty-illustration">
              <RobotOutlined />
              <span>...</span>
            </div>
            <p>{robots.length > 0 ? '没有匹配的机器人，换个关键词或状态看看' : '暂无机器人，选择上方卡片开始创建'}</p>
          </div>
        )}
      </section>

      {/* AI配置卡片 */}
      <Card
        className="workspace-card"
        title={
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-600 flex items-center justify-center">
              <RobotOutlined className="text-lg text-white" />
            </div>
            <div>
              <div className="text-base font-bold text-slate-900">
                {usesGlobalAIConfig ? '后端统一 DeepSeek' : aiConfig?.provider === 'deepseek' ? 'DeepSeek' : 'AI服务'}
              </div>
              <div className="text-xs text-slate-500">{usesGlobalAIConfig ? '所有用户共用后端 API Key' : '市场分析模型'}</div>
              <div className="text-xs text-slate-500">{aiConfig?.modelName || 'deepseek-v4-pro'}</div>
            </div>
          </div>
        }
        extra={
          aiConfig ? (
            <Space>
              <Tag icon={<CheckCircleOutlined />} color="success">
                已连接
              </Tag>
              {usesGlobalAIConfig ? (
                <Tag color="blue">后端统一配置</Tag>
              ) : (
                <>
                  <Button
                    icon={<EditOutlined />}
                    onClick={handleConfig}
                  >
                    编辑配置
                  </Button>
                  <Button
                    danger
                    icon={<LogoutOutlined />}
                    onClick={handleDisconnect}
                  >
                    断开连接
                  </Button>
                </>
              )}
            </Space>
          ) : (
            <Button
              type="primary"
              icon={<KeyOutlined />}
              onClick={handleConfig}
            >
              配置API Key
            </Button>
          )
        }
      >
        {aiConfig ? (
          <>
            <Descriptions column={{ xs: 1, md: 2 }} size="small">
              <Descriptions.Item label={<span className="font-semibold">服务提供商</span>}>
                <span className="font-bold text-slate-900">
                  {aiConfig.provider === 'deepseek' ? 'DeepSeek' : aiConfig.provider}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label={<span className="font-semibold">API Key</span>}>
                <span className="text-slate-700 font-mono">
                  {usesGlobalAIConfig ? '后端统一配置' : aiConfig.apiKey || '未配置'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label={<span className="font-semibold">配置范围</span>}>
                <span className="text-slate-700">
                  {usesGlobalAIConfig ? '全站用户共用' : '当前用户'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label={<span className="font-semibold">模型</span>}>
                <span className="text-slate-700 font-mono">
                  {aiConfig.modelName || 'deepseek-v4-pro'}
                </span>
              </Descriptions.Item>
              {aiConfig.lastUsed && (
                <Descriptions.Item label={<span className="font-semibold">最后使用</span>}>
                  <span className="text-slate-700">{aiConfig.lastUsed}</span>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Alert
              className="mt-4"
              type="info"
              showIcon
              message={usesGlobalAIConfig ? 'DeepSeek API Key 已在后端统一配置' : '完整 API Key 不会在页面回显'}
              description={usesGlobalAIConfig ? '所有用户的 AI 分析都会使用后端环境变量中的统一 Key。' : '编辑配置时需要重新输入完整 Key。'}
            />

            <div className="mt-4">
              <Button
                type="primary"
                loading={testing}
                onClick={handleTest}
              >
                测试连接
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-10">
            <RobotOutlined className="text-5xl text-slate-300 mb-4" />
            <p className="text-slate-500 mb-5">尚未配置AI服务</p>
            <Button
              type="primary"
              icon={<KeyOutlined />}
              onClick={handleConfig}
            >
              立即配置
            </Button>
          </div>
        )}
      </Card>

      {/* 使用说明卡片 */}
      <Card
        className="workspace-card"
        title={
          <div className="flex items-center gap-2">
            <ApiOutlined className="text-slate-600" />
            <span className="font-bold text-slate-900">运行说明</span>
          </div>
        }
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Statistic title="用户模式" value="本机演示" />
          </Col>
          <Col xs={24} md={8}>
            <Statistic title="密钥存储" value="后端加密" />
          </Col>
          <Col xs={24} md={8}>
            <Statistic title="分析入口" value="交易看板" />
          </Col>
        </Row>
      </Card>

      {/* 配置弹窗 */}
      <Modal
        title="配置AI服务"
        open={configModalVisible}
        onCancel={() => setConfigModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setConfigModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<SaveOutlined />}
            loading={loading}
            onClick={handleSave}
          >
            保存配置
          </Button>,
        ]}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{
            provider: 'deepseek',
          }}
        >
          <Form.Item
            label="服务提供商"
            name="provider"
          >
            <Input disabled value="DeepSeek" size="large" />
          </Form.Item>

          <Form.Item
            label="API Key"
            name="apiKey"
            rules={[
              { required: true, message: '请输入API Key' },
              { min: 10, message: 'API Key格式不正确' },
            ]}
            extra={aiConfig ? '需要更换时请输入新的完整 Key。' : '请输入您的 DeepSeek API Key。'}
          >
            <Input.Password
              prefix={<KeyOutlined className="text-slate-400" />}
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
              size="large"
            />
          </Form.Item>

          <Alert
            type="info"
            showIcon
            message="API Key 将加密存储在本机后端"
          />
        </Form>
      </Modal>

      <Modal
        title={selectedTemplate ? `创建${selectedTemplate.title}机器人` : '创建机器人'}
        open={robotModalVisible}
        onCancel={() => setRobotModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setRobotModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="create"
            type="primary"
            icon={<RobotOutlined />}
            onClick={handleCreateRobot}
          >
            创建机器人
          </Button>,
        ]}
        width={620}
      >
        <Form
          form={robotForm}
          layout="vertical"
          requiredMark={false}
        >
          <Form.Item
            label="机器人名称"
            name="name"
            rules={[{ required: true, message: '请输入机器人名称' }]}
          >
            <Input placeholder="例如：黄金趋势跟随机器人" />
          </Form.Item>

          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label="交易品种"
                name="symbol"
                rules={[{ required: true, message: '请输入交易品种' }]}
              >
                <Input disabled placeholder="XAUUSD" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="市场" name="market">
                <Select
                  disabled
                  options={[
                    { value: '黄金', label: '黄金 XAUUSD' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item label="风险等级" name="risk">
                <Select
                  options={[
                    { value: '低风险', label: '低风险' },
                    { value: '中风险', label: '中风险' },
                    { value: '高风险', label: '高风险' },
                    { value: '智能风控', label: '智能风控' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="初始状态" name="status">
                <Select
                  options={[
                    { value: 'running', label: '创建后立即运行' },
                    { value: 'stopped', label: '先停止，稍后手动启动' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label={selectedTemplate?.featured ? '交易想法' : '策略说明'}
            name="idea"
            rules={[{ required: true, message: '请输入交易想法或策略说明' }]}
          >
            <Input.TextArea rows={4} placeholder="描述你希望机器人如何交易、何时入场、何时退出。" />
          </Form.Item>

          <Alert
            type="info"
            showIcon
            message="当前创建的是本地模拟机器人"
            description="机器人会保存到本机浏览器，用于界面管理和流程验证；真实自动交易需要后续接入后端机器人执行服务。"
          />
        </Form>
      </Modal>
    </div>
  );
}

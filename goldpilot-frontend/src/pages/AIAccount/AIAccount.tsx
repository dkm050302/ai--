import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Card, Button, Form, Input, Modal, message, Descriptions, Tag, Space, Row, Col, Statistic, Select } from 'antd';
import {
  ApiOutlined,
  AuditOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ControlOutlined,
  DeleteOutlined,
  EditOutlined,
  FundProjectionScreenOutlined,
  KeyOutlined,
  LogoutOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  SaveOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { authFetch } from '@/utils/apiConfig';
import { PageHeader } from '@/components/PageHeader';
import { GOLD_STRATEGY_LIBRARY, getStrategyDecision } from '@/constants/goldStrategies';
import { researchApi, type StrategyRuntimeRun } from '@/services/research';
import { readStoredRobots, writeStoredRobots, type RobotStatus, type TradingRobot } from '@/services/robotStore';

interface AIConfig {
  provider: string;
  apiKey: string;
  status: 'connected' | 'disconnected';
  lastUsed?: string;
  modelName?: string;
  baseUrl?: string;
  scope?: 'global' | 'user';
}

interface RobotTemplate {
  strategy: string;
  title: string;
  description: string;
  risk: string;
  tags: string[];
  featured?: boolean;
}

const STRATEGY_TRADER_CAPITAL = 1_000_000;
const TOTAL_TEST_CAPITAL = GOLD_STRATEGY_LIBRARY.length * STRATEGY_TRADER_CAPITAL;

const selectionLabelText: Record<string, string> = {
  selected: 'AI精选',
  candidate: '候选',
  watching: '观察',
  downgraded: '降权',
  frozen: '冻结',
};

const selectionLabelColor: Record<string, string> = {
  selected: 'success',
  candidate: 'blue',
  watching: 'warning',
  downgraded: 'orange',
  frozen: 'default',
};

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

function formatMoney(value: number): string {
  return `$${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pct(value: number): string {
  return `${Number(value || 0).toFixed(1)}%`;
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
  const [strategyRuntimeRun, setStrategyRuntimeRun] = useState<StrategyRuntimeRun | null>(null);
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
      researchApi.getStrategyRuntimeRun()
        .then(setStrategyRuntimeRun)
        .catch(() => setStrategyRuntimeRun(null));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAIConfig]);

  const persistRobots = useCallback((nextRobots: TradingRobot[]) => {
    setRobots(nextRobots);
    writeStoredRobots(nextRobots);
  }, []);

  const robotMetrics = useMemo(() => {
    const running = robots.filter((robot) => robot.status === 'running').length;
    const stopped = robots.length - running;
    const equity = robots.reduce((sum, robot) => sum + robot.equity, 0);
    const pnl = robots.reduce((sum, robot) => sum + robot.pnl, 0);

    return { running, stopped, equity, pnl };
  }, [robots]);

  const aiTraderPlan = useMemo(() => {
    const runtimeMap = new Map((strategyRuntimeRun?.strategyResults || []).map((runtime) => [runtime.strategyId, runtime]));
    const rows = GOLD_STRATEGY_LIBRARY.map((strategy) => {
      const runtime = runtimeMap.get(strategy.id);
      const fallbackDecision = getStrategyDecision(strategy);
      const selectionLabel = runtime?.selectionLabel || (fallbackDecision === '暂停' ? 'frozen' : 'watching');
      const stableForAiTrader = Boolean(runtime?.stableForAiTrader);
      const decision = stableForAiTrader
        ? '运行'
        : selectionLabel === 'frozen'
          ? '暂停'
          : '观察';
      const allocation = runtime?.allocatedCapital || STRATEGY_TRADER_CAPITAL;
      const equity = runtime?.endingEquity || allocation;
      const pnl = runtime?.pnl || 0;
      const pnlPct = runtime?.pnlPct || 0;

      return {
        ...strategy,
        runtime: runtime || null,
        decision,
        selectionLabel,
        riskAction: runtime?.riskAction || (selectionLabel === 'frozen' ? 'freeze' : 'watch'),
        riskReason: runtime?.riskReason || '等待量化策略实验室生成模拟运行结果，暂不进入AI主力池',
        stableForAiTrader,
        allocation,
        equity,
        pnl,
        pnlPct,
        winRate: runtime?.winRate || 0,
        maxDrawdown: runtime?.maxDrawdown || 0,
        trades: runtime?.trades || 0,
        consecutiveLosses: runtime?.consecutiveLosses || 0,
      };
    });
    const running = rows.filter((row) => row.stableForAiTrader && row.selectionLabel === 'selected');
    const observing = rows.filter((row) => row.selectionLabel === 'candidate' || row.selectionLabel === 'watching');
    const downgraded = rows.filter((row) => row.selectionLabel === 'downgraded');
    const paused = rows.filter((row) => row.selectionLabel === 'frozen');
    const totalStartingCapital = strategyRuntimeRun?.summary.totalStartingCapital || TOTAL_TEST_CAPITAL;
    const totalEquity = strategyRuntimeRun?.summary.totalEquity || totalStartingCapital;
    const totalPnl = strategyRuntimeRun?.summary.totalPnl || 0;

    return {
      rows,
      running,
      observing,
      downgraded,
      paused,
      runningCapital: running.reduce((sum, row) => sum + row.allocation, 0),
      observingCapital: observing.reduce((sum, row) => sum + row.allocation, 0),
      downgradedCapital: downgraded.reduce((sum, row) => sum + row.allocation, 0),
      pausedCapital: paused.reduce((sum, row) => sum + row.allocation, 0),
      totalStartingCapital,
      totalEquity,
      totalPnl,
      totalPnlPct: strategyRuntimeRun?.summary.totalPnlPct || 0,
    };
  }, [strategyRuntimeRun]);

  const teamDashboard = useMemo(() => {
    const selectedCapital = aiTraderPlan.runningCapital;
    const controlledCapital = aiTraderPlan.observingCapital + aiTraderPlan.downgradedCapital + aiTraderPlan.pausedCapital;
    const runningPct = aiTraderPlan.totalStartingCapital > 0 ? (selectedCapital / aiTraderPlan.totalStartingCapital) * 100 : 0;
    const observePct = aiTraderPlan.totalStartingCapital > 0 ? (controlledCapital / aiTraderPlan.totalStartingCapital) * 100 : 0;
    const highRiskCount = aiTraderPlan.downgraded.length + aiTraderPlan.paused.length;
    const defensiveCount = aiTraderPlan.rows.filter((row) => row.style === '防守').length;
    const trendCount = aiTraderPlan.rows.filter((row) => row.method === '趋势跟踪').length;
    const eventCount = aiTraderPlan.rows.filter((row) => row.kind !== '纯技术').length;
    const stewardQueue = aiTraderPlan.rows
      .map((row) => {
        const score = Math.max(28, Math.min(94,
          100 - row.riskScore * 0.42
          + (row.style === '稳健' ? 12 : 0)
          + (row.style === '防守' ? 15 : 0)
          + (row.preferredState === '趋势' ? 8 : 0)
          + (row.stableForAiTrader ? 18 : 0)
          + Math.min(12, Math.max(-12, row.pnlPct * 3))
          - row.maxDrawdown * 1.6
          - row.consecutiveLosses * 5
          + (row.selectionLabel === 'downgraded' ? -16 : row.selectionLabel === 'frozen' ? -28 : 0)
        ));

        return {
          ...row,
          stewardScore: Number(score.toFixed(1)),
          stewardLevel: score >= 78 ? 'A档' : score >= 65 ? 'B档' : score >= 50 ? 'C档' : 'D档',
        };
      })
      .sort((a, b) => b.stewardScore - a.stewardScore);

    const roles = [
      {
        key: 'strategist',
        title: 'AI策略师',
        subtitle: '市场观点',
        icon: <BarChartOutlined />,
        status: '震荡偏多',
        metric: `${trendCount} 个趋势策略可用`,
        text: '黄金仍以结构整理为主，优先选择稳健趋势、低密度网格和均值回归，重大数据窗口前降低激进策略权重。',
      },
      {
        key: 'trader',
        title: 'AI交易员',
        subtitle: '资金执行',
        icon: <FundProjectionScreenOutlined />,
        status: aiTraderPlan.running.length > 0 ? '精选运行' : '等待精选',
        metric: `${pct(runningPct)} 进入主力池`,
        text: `只启用盈利稳定、回撤低、样本足够的策略：当前 ${aiTraderPlan.running.length} 个进入主力池，${aiTraderPlan.observing.length} 个继续观察。`,
      },
      {
        key: 'risk',
        title: 'AI风控员',
        subtitle: '独立审批',
        icon: <SafetyCertificateOutlined />,
        status: highRiskCount > 0 ? '降权/冻结' : '全部通过',
        metric: `${highRiskCount} 个策略受限`,
        text: '连续亏损、回撤过线或净值转弱会触发降权；连续亏损达到5笔或回撤达到10%时，风控员直接冻结开仓。',
      },
      {
        key: 'steward',
        title: '机器人管家',
        subtitle: '策略看管',
        icon: <ControlOutlined />,
        status: '队列已编排',
        metric: `${stewardQueue.length} 个机器人档案`,
        text: `防守策略 ${defensiveCount} 个保持在线，事件型策略 ${eventCount} 个等待数据窗口，管家负责盯住AI精选、降权和冻结名单。`,
      },
    ];

    const riskRules = [
      { name: '单策略独立本金', value: '100万', state: '通过', detail: '40个策略各自独立核算' },
      { name: 'AI精选样本门槛', value: '8笔+', state: aiTraderPlan.running.length > 0 ? '通过' : '监控', detail: '样本不足不进主力池' },
      { name: '降权触发', value: '连亏3笔', state: aiTraderPlan.downgraded.length > 0 ? '监控' : '通过', detail: '降低交易优先级' },
      { name: '冻结触发', value: '连亏5笔', state: aiTraderPlan.paused.length > 0 ? '监控' : '通过', detail: '停止新开仓' },
      { name: '回撤警戒线', value: '6%', state: '监控', detail: '超过后风控员降权' },
      { name: '回撤熔断线', value: '10%', state: '通过', detail: '超过后冻结策略' },
    ];

    const stewardLogs = [
      {
        time: '09:00',
        actor: 'AI策略师',
        action: '发布黄金市场晨会',
        note: '当前结构震荡偏多，趋势策略可运行，事件策略等待确认。',
      },
      {
        time: '09:03',
        actor: 'AI交易员',
        action: '完成资金初分配',
        note: `AI主力资金 ${formatMoney(aiTraderPlan.runningCapital)}，观察资金 ${formatMoney(aiTraderPlan.observingCapital)}。`,
      },
      {
        time: '09:05',
        actor: 'AI风控员',
        action: '限制高风险机器人',
        note: `${aiTraderPlan.downgraded.length} 个策略降权，${aiTraderPlan.paused.length} 个策略冻结，未通过者不允许主力运行。`,
      },
      {
        time: '09:08',
        actor: '机器人管家',
        action: '更新机器人队列',
        note: `优先看管 ${stewardQueue.slice(0, 5).map((item) => item.name).join('、')}。`,
      },
    ];

    const liveStages = [
      { name: '模拟盘', status: '当前阶段', detail: '持续生成模拟交易、权益曲线和每日结算' },
      { name: '只读实盘', status: '下一阶段', detail: '读取余额、净值、持仓和订单，不下单' },
      { name: '半自动实盘', status: '规划中', detail: 'AI建议经用户确认后执行' },
      { name: '自动实盘', status: '封闭测试后', detail: '必须具备硬风控、审计日志和一键停止' },
    ];

    return {
      allocatedCapital: selectedCapital,
      controlledCapital,
      runningPct,
      observePct,
      roles,
      riskRules,
      stewardLogs,
      liveStages,
      stewardQueue,
    };
  }, [aiTraderPlan]);

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
        eyebrow="AI Trading Team"
        title="AI交易员"
        description="以策略师、交易员、风控员和机器人管家组成黄金交易团队，先跑模拟盘，后续分阶段接入实盘"
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
            <span>GoldPilot AI Trading Desk</span>
            <h2>策略师、交易员、风控员正在共同管理 XAUUSD 机器人组合</h2>
            <p>AI策略师负责判断市场，AI交易员负责资金和执行，AI风控员拥有一票否决权，机器人管家看管 40 个黄金策略机器人。</p>
          </div>
          <div className="ai-team-capital-panel">
            <div>
              <span>总测试资金</span>
              <strong>{formatMoney(aiTraderPlan.totalStartingCapital)}</strong>
            </div>
            <div>
              <span>AI主力资金</span>
              <strong>{formatMoney(teamDashboard.allocatedCapital)}</strong>
            </div>
            <div>
              <span>观察/风控资金</span>
              <strong>{formatMoney(teamDashboard.controlledCapital)}</strong>
            </div>
            <Tag color="green">模拟盘阶段</Tag>
          </div>
        </div>

        <div className="ai-trader-kpis">
          <div>
            <span>AI精选主力</span>
            <strong>{aiTraderPlan.running.length}</strong>
            <em>{formatMoney(aiTraderPlan.runningCapital)}</em>
          </div>
          <div>
            <span>观察队列</span>
            <strong>{aiTraderPlan.observing.length}</strong>
            <em>{formatMoney(aiTraderPlan.observingCapital)}</em>
          </div>
          <div>
            <span>降权 / 冻结</span>
            <strong>{aiTraderPlan.downgraded.length} / {aiTraderPlan.paused.length}</strong>
            <em>{formatMoney(aiTraderPlan.downgradedCapital + aiTraderPlan.pausedCapital)}</em>
          </div>
          <div>
            <span>测试总权益</span>
            <strong className={aiTraderPlan.totalPnl >= 0 ? 'green' : 'red'}>
              {formatMoney(aiTraderPlan.totalEquity)}
            </strong>
            <em>{aiTraderPlan.totalPnl >= 0 ? '+' : ''}{formatMoney(aiTraderPlan.totalPnl)} · {aiTraderPlan.totalPnlPct}%</em>
          </div>
        </div>

        <div className="ai-team-role-grid">
          {teamDashboard.roles.map((role) => (
            <article className="ai-team-role-card" key={role.key}>
              <div className="ai-team-role-icon">{role.icon}</div>
              <div>
                <span>{role.subtitle}</span>
                <strong>{role.title}</strong>
              </div>
              <Tag color={role.key === 'risk' ? 'warning' : 'processing'}>{role.status}</Tag>
              <p>{role.text}</p>
              <em>{role.metric}</em>
            </article>
          ))}
        </div>

        <div className="ai-team-operations-grid">
          <article className="ai-team-panel">
            <div className="ai-team-panel-head">
              <div>
                <span>Risk Approval</span>
                <strong>AI风控员审批规则</strong>
              </div>
              <SafetyCertificateOutlined />
            </div>
            <div className="ai-risk-rule-grid">
              {teamDashboard.riskRules.map((rule) => (
                <div className="ai-risk-rule" key={rule.name}>
                  <span>{rule.name}</span>
                  <strong>{rule.value}</strong>
                  <Tag color={rule.state === '通过' ? 'success' : 'warning'}>{rule.state}</Tag>
                  <em>{rule.detail}</em>
                </div>
              ))}
            </div>
          </article>

          <article className="ai-team-panel">
            <div className="ai-team-panel-head">
              <div>
                <span>Steward Log</span>
                <strong>机器人管家动作日志</strong>
              </div>
              <AuditOutlined />
            </div>
            <div className="ai-steward-log">
              {teamDashboard.stewardLogs.map((log) => (
                <div className="ai-steward-log-item" key={`${log.time}-${log.action}`}>
                  <time>{log.time}</time>
                  <div>
                    <strong>{log.actor} · {log.action}</strong>
                    <span>{log.note}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="ai-live-stage-strip">
          {teamDashboard.liveStages.map((stage, index) => (
            <div className={index === 0 ? 'active' : ''} key={stage.name}>
              <span>{stage.status}</span>
              <strong>{stage.name}</strong>
              <em>{stage.detail}</em>
            </div>
          ))}
        </div>

        <div className="ai-team-panel">
          <div className="ai-team-panel-head">
            <div>
              <span>Robot Queue</span>
              <strong>机器人管家运行队列</strong>
            </div>
            <TeamOutlined />
          </div>
          <div className="ai-trader-strategy-list">
          {teamDashboard.stewardQueue.map((strategy) => (
            <article className="ai-trader-strategy-row" key={strategy.id}>
              <div>
                <strong>{strategy.name}</strong>
                <span>{strategy.direction} · {strategy.method} · {strategy.session} · {strategy.horizon}</span>
                <span>{strategy.riskReason}</span>
              </div>
              <div className="ai-trader-row-tags">
                <Tag color={selectionLabelColor[strategy.selectionLabel] || 'default'}>
                  {selectionLabelText[strategy.selectionLabel] || strategy.selectionLabel}
                </Tag>
                <Tag color={strategy.stewardLevel === 'A档' ? 'success' : strategy.stewardLevel === 'B档' ? 'blue' : 'default'}>
                  {strategy.stewardLevel} {strategy.stewardScore}
                </Tag>
                <Tag>{strategy.style}</Tag>
                <Tag color={strategy.pnl >= 0 ? 'success' : 'error'}>{strategy.pnl >= 0 ? '+' : ''}{strategy.pnlPct}%</Tag>
                <Tag color="blue">回撤 {strategy.maxDrawdown}%</Tag>
              </div>
              <div className="ai-trader-row-money">
                <strong>{formatMoney(strategy.equity)}</strong>
                <span>{strategy.trades} 笔 · 胜率 {strategy.winRate}%</span>
              </div>
            </article>
          ))}
          </div>
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
                {robot.sourceStrategyName && (
                  <div className="robot-source-strip">
                    <Tag color="processing">策略实验室复制</Tag>
                    <span>{robot.sourceStrategyName}</span>
                  </div>
                )}
                <div className="robot-card-meta">
                  <span>{robot.strategy}</span>
                  <span>{robot.risk}</span>
                  <span>胜率 {robot.winRate}%</span>
                  {typeof robot.sourcePnlPct === 'number' && <span>模板收益 {robot.sourcePnlPct >= 0 ? '+' : ''}{robot.sourcePnlPct}%</span>}
                  {typeof robot.sourceMaxDrawdown === 'number' && <span>模板回撤 {robot.sourceMaxDrawdown}%</span>}
                  {typeof robot.sourceTrades === 'number' && <span>样本 {robot.sourceTrades} 笔</span>}
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

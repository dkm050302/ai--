import { useState, useEffect } from 'react';
import { Alert, Card, Button, Form, Input, Modal, message, Descriptions, Tag, Space, Row, Col, Statistic } from 'antd';
import { EditOutlined, SaveOutlined, LogoutOutlined, ApiOutlined, KeyOutlined, RobotOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { authFetch } from '@/utils/apiConfig';
import { PageHeader } from '@/components/PageHeader';

interface AIConfig {
  provider: string;
  apiKey: string;
  status: 'connected' | 'disconnected';
  lastUsed?: string;
  modelName?: string;
  baseUrl?: string;
}

export function AIAccount() {
  const [loading, setLoading] = useState(false);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadAIConfig();
  }, []);

  const loadAIConfig = async () => {
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
  };

  const maskApiKey = (key: string): string => {
    if (!key || key.length < 8) return '****';
    return key.slice(0, 4) + '****' + key.slice(-4);
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
        eyebrow="AI Service"
        title="AI账号"
        description="DeepSeek 连接状态和本机密钥配置"
        meta={aiConfig ? <Tag color="success">已连接</Tag> : <Tag color="warning">未配置</Tag>}
        actions={(
          <Button
            icon={<ApiOutlined />}
            onClick={() => window.open('https://platform.deepseek.com/api_keys', '_blank')}
          >
            获取API Key
          </Button>
        )}
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} md={8}>
          <div className="metric-tile">
            <div className="metric-tile-label">服务商</div>
            <div className="metric-tile-value">{aiConfig?.provider === 'deepseek' ? 'DeepSeek' : '未配置'}</div>
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="metric-tile">
            <div className="metric-tile-label">连接状态</div>
            <div className="metric-tile-value">{aiConfig ? '可用' : '待配置'}</div>
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="metric-tile">
            <div className="metric-tile-label">分析模型</div>
            <div className="metric-tile-value">{aiConfig?.modelName || 'deepseek-v4-pro'}</div>
          </div>
        </Col>
      </Row>

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
                {aiConfig?.provider === 'deepseek' ? 'DeepSeek' : 'AI服务'}
              </div>
              <div className="text-xs text-slate-500">市场分析模型</div>
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
                  {aiConfig.apiKey || '未配置'}
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
              message="完整 API Key 不会在页面回显"
              description="编辑配置时需要重新输入完整 Key。"
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
    </div>
  );
}

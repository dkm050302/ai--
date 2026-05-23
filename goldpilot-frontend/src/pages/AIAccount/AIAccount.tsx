import { useState, useEffect } from 'react';
import { Card, Button, Form, Input, Modal, message, Descriptions, Tag, Space } from 'antd';
import { EditOutlined, SaveOutlined, LogoutOutlined, ApiOutlined, KeyOutlined, RobotOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '@/utils/apiConfig';

interface AIConfig {
  provider: string;
  apiKey: string;
  status: 'connected' | 'disconnected';
  lastUsed?: string;
}

export function AIAccount() {
  const navigate = useNavigate();
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
    if (aiConfig?.apiKey && aiConfig.apiKey !== '****') {
      form.setFieldsValue({ apiKey: aiConfig.apiKey });
    }
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
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between pb-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900" style={{ fontFamily: '"Times New Roman", serif' }}>
            AI账号配置
          </h1>
          <p className="text-sm text-slate-600 font-medium mt-2" style={{ fontFamily: '"Georgia", serif' }}>
            配置您的AI服务提供商
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            icon={<ApiOutlined />}
            onClick={() => window.open('https://platform.deepseek.com/api_keys', '_blank')}
          >
            获取API Key
          </Button>
        </div>
      </div>

      {/* AI配置卡片 */}
      <Card
        className="shadow-lg border-0"
        title={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
              <RobotOutlined className="text-xl text-white" />
            </div>
            <div>
              <div className="text-lg font-bold text-slate-900">
                {aiConfig?.provider === 'deepseek' ? 'DeepSeek' : 'AI服务'}
              </div>
              <div className="text-sm text-slate-500">大语言模型服务</div>
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
            <Descriptions column={1} size="large">
              <Descriptions.Item label={<span className="font-semibold">服务提供商</span>}>
                <span className="text-lg font-bold text-slate-900">
                  {aiConfig.provider === 'deepseek' ? 'DeepSeek' : aiConfig.provider}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label={<span className="font-semibold">API Key</span>}>
                <span className="text-lg text-slate-700 font-mono">
                  {aiConfig.apiKey || '未配置'}
                </span>
              </Descriptions.Item>
              {aiConfig.lastUsed && (
                <Descriptions.Item label={<span className="font-semibold">最后使用</span>}>
                  <span className="text-slate-700">{aiConfig.lastUsed}</span>
                </Descriptions.Item>
              )}
            </Descriptions>

            <div className="mt-6">
              <Button
                type="primary"
                size="large"
                loading={testing}
                onClick={handleTest}
                block
              >
                测试连接
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <RobotOutlined className="text-6xl text-slate-300 mb-4" />
            <p className="text-slate-500 mb-6">尚未配置AI服务</p>
            <Button
              type="primary"
              size="large"
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
        className="shadow-lg border-0 bg-slate-50"
        title={
          <div className="flex items-center gap-2">
            <ApiOutlined className="text-slate-600" />
            <span className="font-bold text-slate-900">使用说明</span>
          </div>
        }
      >
        <div className="space-y-3 text-slate-700">
          <div>
            <p className="font-semibold mb-1">1. 获取API Key</p>
            <p className="text-sm text-slate-600">
              访问 <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">DeepSeek开放平台</a> 注册账号并获取API Key
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1">2. 配置API Key</p>
            <p className="text-sm text-slate-600">点击"配置API Key"按钮，输入您的API Key并保存</p>
          </div>
          <div>
            <p className="font-semibold mb-1">3. 测试连接</p>
            <p className="text-sm text-slate-600">配置完成后，点击"测试连接"按钮验证配置是否正确</p>
          </div>
          <div>
            <p className="font-semibold mb-1">4. 开始使用</p>
            <p className="text-sm text-slate-600">配置成功后，系统将使用您的API额度进行AI分析</p>
          </div>
        </div>
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
            extra="请输入您的DeepSeek API Key，格式为 sk-xxxxx"
          >
            <Input.Password
              prefix={<KeyOutlined className="text-slate-400" />}
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
              size="large"
            />
          </Form.Item>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <p className="font-semibold mb-1">提示：</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>API Key将加密存储在服务器</li>
              <li>请妥善保管您的API Key</li>
              <li>如有泄露，请及时在DeepSeek平台重新生成</li>
            </ul>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

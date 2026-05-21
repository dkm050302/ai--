/**
 * AI配置控制器 - 处理AI服务配置相关请求
 */

import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { logger } from '../utils/logger';
import crypto from 'crypto';

/**
 * 简单加密函数（用于演示，生产环境应使用更安全的加密方式）
 */
function encryptApiKey(apiKey: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-encryption-key-32-bytes!', 'utf8').slice(0, 32);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}

/**
 * 简单解密函数
 */
function decryptApiKey(encryptedData: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-encryption-key-32-bytes!', 'utf8').slice(0, 32);

  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * 获取AI配置
 * GET /api/ai/config
 */
export async function getAIConfig(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const user = await UserModel.findOne({ accountId: req.user.accountId });

    if (!user) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }

    if (!user.aiConfig) {
      res.json({ success: true, data: null });
      return;
    }

    // 返回时隐藏API Key的部分内容
    const responseData = {
      provider: user.aiConfig.provider,
      apiKey: user.aiConfig.apiKey ? maskApiKey(user.aiConfig.apiKey) : '',
      status: user.aiConfig.status,
      lastUsed: user.aiConfig.lastUsed,
    };

    res.json({ success: true, data: responseData });
  } catch (error) {
    logger.error('[AI] 获取AI配置失败:', error);
    res.status(500).json({ success: false, message: '获取AI配置失败' });
  }
}

/**
 * 保存/更新AI配置
 * POST /api/ai/config
 * Body: { provider: string, apiKey: string }
 */
export async function saveAIConfig(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const { provider, apiKey } = req.body;

    if (!provider || !apiKey) {
      res.status(400).json({ success: false, message: '缺少必要参数' });
      return;
    }

    // 验证API Key格式
    if (provider === 'deepseek' && !apiKey.startsWith('sk-')) {
      res.status(400).json({ success: false, message: 'API Key格式不正确' });
      return;
    }

    // 加密API Key
    const encryptedApiKey = encryptApiKey(apiKey);

    const user = await UserModel.findOneAndUpdate(
      { accountId: req.user.accountId },
      {
        $set: {
          'aiConfig.provider': provider,
          'aiConfig.apiKey': encryptedApiKey,
          'aiConfig.status': 'connected',
        },
      },
      { new: true }
    );

    if (!user) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }

    logger.info(`[AI] 用户 ${req.user.accountId} 配置了AI服务: ${provider}`);
    res.json({ success: true, message: 'AI配置保存成功' });
  } catch (error) {
    logger.error('[AI] 保存AI配置失败:', error);
    res.status(500).json({ success: false, message: '保存AI配置失败' });
  }
}

/**
 * 删除AI配置（断开连接）
 * DELETE /api/ai/config
 */
export async function deleteAIConfig(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const user = await UserModel.findOneAndUpdate(
      { accountId: req.user.accountId },
      { $unset: { aiConfig: '' } },
      { new: true }
    );

    if (!user) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }

    logger.info(`[AI] 用户 ${req.user.accountId} 断开了AI连接`);
    res.json({ success: true, message: '已断开AI连接' });
  } catch (error) {
    logger.error('[AI] 删除AI配置失败:', error);
    res.status(500).json({ success: false, message: '删除AI配置失败' });
  }
}

/**
 * 测试AI连接
 * POST /api/ai/test
 */
export async function testAIConnection(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const user = await UserModel.findOne({ accountId: req.user.accountId });

    if (!user || !user.aiConfig || !user.aiConfig.apiKey) {
      res.status(400).json({ success: false, message: '未配置AI服务' });
      return;
    }

    // 解密API Key
    const apiKey = decryptApiKey(user.aiConfig.apiKey);

    // 测试DeepSeek API连接
    const testResult = await testDeepSeekAPI(apiKey);

    if (testResult.success) {
      // 更新最后使用时间
      await UserModel.findOneAndUpdate(
        { accountId: req.user.accountId },
        { $set: { 'aiConfig.lastUsed': new Date() } }
      );

      logger.info(`[AI] 用户 ${req.user.accountId} 测试AI连接成功`);
      res.json({ success: true, message: '连接测试成功' });
    } else {
      res.status(400).json({ success: false, message: testResult.error || '连接测试失败' });
    }
  } catch (error) {
    logger.error('[AI] 测试AI连接失败:', error);
    res.status(500).json({ success: false, message: '连接测试失败' });
  }
}

/**
 * 获取用户的API Key（内部使用）
 */
export async function getUserApiKey(accountId: string): Promise<string | null> {
  try {
    const user = await UserModel.findOne({ accountId });

    if (!user || !user.aiConfig || !user.aiConfig.apiKey) {
      return null;
    }

    return decryptApiKey(user.aiConfig.apiKey);
  } catch (error) {
    logger.error('[AI] 获取用户API Key失败:', error);
    return null;
  }
}

/**
 * 测试DeepSeek API连接
 */
async function testDeepSeekAPI(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.deepseek.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return { success: true };
    }

    const errorData: any = await response.json().catch(() => ({}));
    return { success: false, error: errorData.error?.message || 'API连接失败' };
  } catch (error) {
    return { success: false, error: '网络连接失败' };
  }
}

/**
 * 隐藏API Key的部分内容
 */
function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) return '****';
  return apiKey.slice(0, 4) + '****' + apiKey.slice(-4);
}

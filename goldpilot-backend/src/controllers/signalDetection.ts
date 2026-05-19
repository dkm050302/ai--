import type { Request, Response } from 'express';
import { signalService } from '../services/signal';
import { logger } from '../utils';
import { asyncHandler } from '../middleware';

/**
 * 触发信号检测
 * POST /api/signals/detect
 */
export const detectSignals = asyncHandler(async (req: Request, res: Response) => {
  const { period = '1m' } = req.body;

  // 这里应该从MetaAPI或其他数据源获取K线数据
  // 目前使用模拟数据进行演示
  logger.info(`Signal detection requested for period: ${period}`);

  // TODO: 从MetaAPI获取真实K线数据
  // const candles = await metaApiService.getCandles(period);

  res.json({
    success: true,
    message: 'Signal detection initiated',
    data: {
      period,
      status: 'processing',
    },
  });
});

/**
 * 获取待处理信号
 * GET /api/signals/pending
 */
export const getPendingSignals = asyncHandler(async (req: Request, res: Response) => {
  const signals = await signalService.getPendingSignals();

  res.json({
    success: true,
    data: {
      signals,
      count: signals.length,
    },
  });
});

/**
 * 手动更新信号状态
 * PUT /api/signals/:signalId/status
 */
export const updateSignalStatus = asyncHandler(async (req: Request, res: Response) => {
  const { signalId } = req.params;
  const { status, exitPrice } = req.body;

  // 处理signalId可能是数组的情况
  const id = Array.isArray(signalId) ? signalId[0] : signalId;

  if (!['profit', 'loss'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_STATUS',
        message: 'Status must be "profit" or "loss"',
      },
    });
  }

  const signal = await signalService.updateSignalStatus(id, status, exitPrice);

  if (!signal) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'SIGNAL_NOT_FOUND',
        message: 'Signal not found',
      },
    });
  }

  res.json({
    success: true,
    data: signal,
  });
});

/**
 * 清理旧信号
 * DELETE /api/signals/cleanup
 */
export const cleanupSignals = asyncHandler(async (req: Request, res: Response) => {
  await signalService.cleanupOldSignals();

  res.json({
    success: true,
    message: 'Old signals cleaned up',
  });
});

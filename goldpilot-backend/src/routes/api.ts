import { Router } from 'express';
import {
  getPrice,
  getCandles,
} from '../controllers/price';
import {
  getSignals,
  getTodayStats,
  createSignal,
} from '../controllers/signal';
import {
  getAccount,
} from '../controllers/account';
import {
  detectSignals,
  getPendingSignals,
  updateSignalStatus,
  cleanupSignals,
} from '../controllers/signalDetection';
import {
  getEconomicCalendar,
  getMarketNews,
} from '../controllers/events';
import {
  getAIConfig,
  saveAIConfig,
  deleteAIConfig,
  testAIConnection,
} from '../controllers/ai';
import {
  analyzeMarket,
} from '../controllers/aiAnalysis';
import authRouter from './auth';
import { updateAccount } from '../controllers/accountUpdate';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 认证相关路由
router.use('/auth', authRouter);

// 价格相关路由
router.get('/price', getPrice);
router.get('/candles', getCandles);

// 信号相关路由
router.get('/signals', getSignals);
router.post('/signals', createSignal);
router.post('/signals/detect', detectSignals);
router.get('/signals/pending', getPendingSignals);
router.put('/signals/:signalId/status', updateSignalStatus);
router.delete('/signals/cleanup', cleanupSignals);
router.get('/stats/today', getTodayStats);

// 账户相关路由
router.get('/account', getAccount);
router.put('/account/update', authMiddleware, updateAccount);

// 事件相关路由
router.get('/events/calendar', getEconomicCalendar);
router.get('/events/news', getMarketNews);

// AI配置相关路由
router.get('/ai/config', authMiddleware, getAIConfig);
router.post('/ai/config', authMiddleware, saveAIConfig);
router.delete('/ai/config', authMiddleware, deleteAIConfig);
router.post('/ai/test', authMiddleware, testAIConnection);

// AI分析相关路由
router.post('/ai/analyze', authMiddleware, analyzeMarket);

export default router;

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

const router = Router();

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

export default router;

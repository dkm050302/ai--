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
  getGoldNews,
  getEconNews,
  getFedNews,
} from '../controllers/news';
import {
  getYahooPrice,
} from '../controllers/yahooPrice';

const router = Router();

// 价格相关路由
router.get('/price', getPrice);
router.get('/candles', getCandles);

// Yahoo 实时金价代理
router.get('/yahoo-price', getYahooPrice);

// 新闻代理路由
router.get('/news/gold', getGoldNews);
router.get('/news/economic', getEconNews);
router.get('/news/fed', getFedNews);

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

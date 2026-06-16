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
  getImportantEvents,
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
  analyzeMarketStream,
  askPageAssistant,
  askPageAssistantStream,
} from '../controllers/aiAnalysis';
import {
  executePaperTrading,
  getAnalysisReports,
  getBacktests,
  getPaperAccounts,
  getQuantChain,
  getResearchSummary,
  resetPaperAccounts,
  runBacktest,
  settlePaperAccountsEndpoint,
  updateQuantIntervention,
} from '../controllers/research';
import {
  getStrategyDefinitionsEndpoint,
  getStrategyLabOverview,
  getStrategyRuntimeRun,
  getStrategyScreenRuns,
  importBaseMaxXau15mHistory,
  resetStrategyRuntimeRuns,
  runStrategyRuntime,
  runStrategyScreen,
  suggestStrategySettings,
} from '../controllers/strategyLab';
import {
  cancelManualSimOrder,
  closeManualSimPosition,
  getManualSimAccount,
  placeManualSimOrder,
  resetManualSimAccount,
  settleManualSimAccount,
} from '../controllers/manualSim';
import {
  getDataSource,
  setDataSource,
  getDataSources,
  getRefreshInterval,
  setRefreshInterval,
  refreshDataSource,
  getTwelveDataApiKey,
  saveTwelveDataApiKey,
  testTwelveDataApiKey,
  getTwelveDataQuota,
} from '../controllers/dataSource';
import authRouter from './auth';
import adminRouter from './admin';
import actionLogRouter from './actionLog';
import { updateAccount } from '../controllers/accountUpdate';
import { optionalAuth } from '../middleware/auth';

const router = Router();

// 认证相关路由
router.use('/auth', authRouter);

// 管理员路由
router.use('/admin', adminRouter);

// 行为记录路由
router.use('/actions', actionLogRouter);

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
router.put('/account/update', optionalAuth, updateAccount);

// 事件相关路由
router.get('/events/calendar', getEconomicCalendar);
router.get('/events/important', getImportantEvents);
router.get('/events/news', getMarketNews);

// AI配置相关路由
router.get('/ai/config', optionalAuth, getAIConfig);
router.post('/ai/config', optionalAuth, saveAIConfig);
router.delete('/ai/config', optionalAuth, deleteAIConfig);
router.post('/ai/test', optionalAuth, testAIConnection);

// AI分析相关路由
router.post('/ai/analyze', optionalAuth, analyzeMarket);
router.post('/ai/analyze-stream', optionalAuth, analyzeMarketStream);
router.post('/ai/page-assistant', optionalAuth, askPageAssistant);
router.post('/ai/page-assistant-stream', optionalAuth, askPageAssistantStream);

// 研究中心：AI报告、模拟账号、回测
router.get('/research/summary', optionalAuth, getResearchSummary);
router.get('/research/reports', optionalAuth, getAnalysisReports);
router.get('/research/paper-accounts', optionalAuth, getPaperAccounts);
router.post('/research/paper-accounts/execute', optionalAuth, executePaperTrading);
router.post('/research/paper-accounts/settle', optionalAuth, settlePaperAccountsEndpoint);
router.post('/research/paper-accounts/reset', optionalAuth, resetPaperAccounts);
router.post('/research/backtests/run', optionalAuth, runBacktest);
router.get('/research/backtests', optionalAuth, getBacktests);
router.get('/research/quant-chain', optionalAuth, getQuantChain);
router.post('/research/quant-chain/intervention', optionalAuth, updateQuantIntervention);
router.get('/research/strategy-lab/overview', optionalAuth, getStrategyLabOverview);
router.get('/research/strategy-lab/strategies', optionalAuth, getStrategyDefinitionsEndpoint);
router.post('/research/strategy-lab/history/import-basemax-xau15m', optionalAuth, importBaseMaxXau15mHistory);
router.get('/research/strategy-lab/runtime', optionalAuth, getStrategyRuntimeRun);
router.post('/research/strategy-lab/runtime/run', optionalAuth, runStrategyRuntime);
router.post('/research/strategy-lab/runtime/reset', optionalAuth, resetStrategyRuntimeRuns);
router.post('/research/strategy-lab/screen', optionalAuth, runStrategyScreen);
router.post('/research/strategy-lab/suggest-settings', optionalAuth, suggestStrategySettings);
router.get('/research/strategy-lab/screens', optionalAuth, getStrategyScreenRuns);

// 手动模拟仿真账户
router.get('/manual-sim/account', optionalAuth, getManualSimAccount);
router.post('/manual-sim/orders', optionalAuth, placeManualSimOrder);
router.post('/manual-sim/orders/:orderId/cancel', optionalAuth, cancelManualSimOrder);
router.post('/manual-sim/positions/:positionId/close', optionalAuth, closeManualSimPosition);
router.post('/manual-sim/settle', optionalAuth, settleManualSimAccount);
router.post('/manual-sim/reset', optionalAuth, resetManualSimAccount);

// 数据源相关路由
router.get('/datasource', getDataSource);
router.put('/datasource', setDataSource);
router.get('/datasources', getDataSources);
router.get('/datasource/refresh-interval', getRefreshInterval);
router.put('/datasource/refresh-interval', setRefreshInterval);
router.post('/datasource/refresh', refreshDataSource);
router.get('/datasource/twelvedata/apikey', getTwelveDataApiKey);
router.put('/datasource/twelvedata/apikey', saveTwelveDataApiKey);
router.post('/datasource/twelvedata/test', testTwelveDataApiKey);
router.get('/datasource/twelvedata/quota', getTwelveDataQuota);

export default router;

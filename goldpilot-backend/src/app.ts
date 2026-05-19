import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { connectDatabase } from './config';
import apiRoutes from './routes/api';
import metaApiRoutes from './routes/metaApi';
import { setupWebSocket } from './websocket';
import { errorHandler, notFoundHandler, requestLogger, detailedRequestLogger } from './middleware';
import { logger } from './utils';
import { schedulerService } from './services/scheduler';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志（开发环境显示详细信息）
if (process.env.NODE_ENV === 'development') {
  app.use(detailedRequestLogger);
} else {
  app.use(requestLogger);
}

// API路由
app.use('/api', apiRoutes);
app.use('/api/metaapi', metaApiRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// 404处理（必须在所有路由之后）
app.use(notFoundHandler);

// 全局错误处理（必须在最后）
app.use(errorHandler);

// 启动服务器
async function startServer() {
  try {
    logger.info('🔧 Starting server...');

    // 连接数据库
    logger.info('📡 Connecting to database...');
    await connectDatabase();
    logger.info('✅ Database connection completed');

    // 设置WebSocket
    logger.info('🔌 Setting up WebSocket...');
    setupWebSocket(io);
    logger.info('✅ WebSocket setup completed');

    // 启动定时任务
    logger.info('⏰ Starting schedulers...');
    schedulerService.startAll();
    logger.info('✅ Schedulers started');

    // 启动HTTP服务器
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server started successfully`);
      logger.info(`📍 HTTP Server: http://localhost:${PORT}`);
      logger.info(`📍 WebSocket Server: ws://localhost:${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info('✅ Server is ready to accept connections');
    }).on('error', (error: any) => {
      logger.error('❌ HTTP Server error:', error);
      throw error;
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// 优雅关闭
const gracefulShutdown = (signal: string) => {
  logger.info(`⚠️  ${signal} received, shutting down gracefully...`);

  // 停止定时任务
  schedulerService.stopAll();

  httpServer.close(() => {
    logger.info('✅ Server closed');
    process.exit(0);
  });

  // 10秒后强制退出
  setTimeout(() => {
    logger.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 启动应用
startServer();

export { app, io };

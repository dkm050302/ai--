import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { connectDatabase } from './config';
import apiRoutes from './routes/api';
import { setupWebSocket } from './websocket';

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

// 请求日志
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

// API路由
app.use('/api', apiRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    },
  });
});

// 启动服务器
async function startServer() {
  try {
    console.log('🔧 Starting server...');

    // 连接数据库
    console.log('📡 Connecting to database...');
    await connectDatabase();
    console.log('✅ Database connection completed');

    // 设置WebSocket
    console.log('🔌 Setting up WebSocket...');
    setupWebSocket(io);
    console.log('✅ WebSocket setup completed');

    // 启动HTTP服务器
    httpServer.listen(PORT, () => {
      console.log('🚀 Server started successfully');
      console.log(`📍 HTTP Server: http://localhost:${PORT}`);
      console.log(`📍 WebSocket Server: ws://localhost:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('✅ Server is ready to accept connections');
    }).on('error', (error: any) => {
      console.error('❌ HTTP Server error:', error);
      throw error;
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// 启动应用
startServer();

export { app, io };

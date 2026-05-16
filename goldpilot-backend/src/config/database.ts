import mongoose from 'mongoose';

/**
 * 连接MongoDB数据库
 */
export async function connectDatabase(): Promise<void> {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/goldpilot';

    console.log(`📡 Connecting to MongoDB: ${mongoUri.replace(/\/\/.*@/, '//***@')}`);

    // 设置连接超时
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000, // 5秒超时
      socketTimeoutMS: 5000, // 5秒socket超时
    });

    console.log('✅ MongoDB connected successfully');

    // 监听连接事件
    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  MongoDB disconnected');
    });

    // 优雅关闭
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);

    // 在开发环境下，如果没有MongoDB，警告但继续运行
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️  Running without MongoDB (development mode)');
      console.warn('⚠️  Database features will be disabled');
    } else {
      process.exit(1);
    }
  }
}

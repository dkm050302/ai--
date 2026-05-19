import { Server as SocketIOServer } from 'socket.io';
import type { Request, Response } from 'express';
import { getPrice } from '../controllers/price';

/**
 * 设置WebSocket事件处理
 */
export function setupWebSocket(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);

    // 订阅价格更新
    socket.on('subscribe:price', async () => {
      console.log('📡 Client subscribed to price updates:', socket.id);

      // 立即发送当前价格
      try {
        // 创建mock请求和响应对象
        const req = {} as Request;
        const res = {
          json: (data: any) => socket.emit('price', data),
          status: () => ({ json: () => {} }),
        } as any as Response;

        await getPrice(req, res);
      } catch (error) {
        console.error('Error sending initial price:', error);
      }

      // TODO: 启动实时价格推送
      // 可以在这里设置定时器，每隔几秒推送价格更新
    });

    // 取消订阅价格更新
    socket.on('unsubscribe:price', () => {
      console.log('📡 Client unsubscribed from price updates:', socket.id);
    });

    // 订阅信号更新
    socket.on('subscribe:signals', () => {
      console.log('📡 Client subscribed to signal updates:', socket.id);
      // TODO: 实现信号订阅逻辑
    });

    // 取消订阅信号更新
    socket.on('unsubscribe:signals', () => {
      console.log('📡 Client unsubscribed from signal updates:', socket.id);
    });

    // 订阅账户更新
    socket.on('subscribe:account', () => {
      console.log('📡 Client subscribed to account updates:', socket.id);
      // TODO: 实现账户订阅逻辑
    });

    // 取消订阅账户更新
    socket.on('unsubscribe:account', () => {
      console.log('📡 Client unsubscribed from account updates:', socket.id);
    });

    // 断开连接
    socket.on('disconnect', (reason) => {
      console.log('❌ Client disconnected:', socket.id, reason);
    });
  });

  // TODO: 启动后台任务，定期推送价格更新
  // startPriceUpdates(io);
}

/**
 * 启动价格更新推送（示例）
 */
function startPriceUpdates(io: SocketIOServer): void {
  // 每3秒推送一次价格更新
  setInterval(async () => {
    try {
      // 获取最新价格
      const priceData = await getPrice({} as any, {
        json: (data: any) => {
          // 向所有订阅价格的客户端推送
          io.emit('price', data);
        },
        status: () => {},
      } as any);
    } catch (error) {
      console.error('Error in price update:', error);
    }
  }, 3000);
}

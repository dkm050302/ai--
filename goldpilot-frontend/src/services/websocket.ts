import { io, Socket } from 'socket.io-client';
import { API_CONFIG } from '@/utils/constants';

type WebSocketEventHandler = (data: any) => void;

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  /**
   * 连接WebSocket
   */
  connect(): void {
    if (this.socket?.connected) {
      console.log('[WebSocket] Already connected');
      return;
    }

    console.log('[WebSocket] Connecting to', API_CONFIG.wsURL);

    this.socket = io(API_CONFIG.wsURL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.setupEventListeners();
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // 连接成功
    this.socket.on('connect', () => {
      console.log('[WebSocket] Connected', this.socket?.id);
      this.reconnectAttempts = 0;
    });

    // 连接错误
    this.socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error', error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[WebSocket] Max reconnect attempts reached');
      }
    });

    // 断开连接
    this.socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected', reason);
    });

    // 重连成功
    this.socket.on('reconnect', (attemptNumber) => {
      console.log('[WebSocket] Reconnected after', attemptNumber, 'attempts');
      this.reconnectAttempts = 0;
    });
  }

  /**
   * 订阅价格更新
   */
  subscribePrice(handler: WebSocketEventHandler): void {
    this.socket?.emit('subscribe:price');
    this.socket?.on('price', handler);
  }

  /**
   * 取消订阅价格更新
   */
  unsubscribePrice(handler: WebSocketEventHandler): void {
    this.socket?.emit('unsubscribe:price');
    this.socket?.off('price', handler);
  }

  /**
   * 订阅信号更新
   */
  subscribeSignal(handler: WebSocketEventHandler): void {
    this.socket?.emit('subscribe:signals');
    this.socket?.on('signal', handler);
  }

  /**
   * 取消订阅信号更新
   */
  unsubscribeSignal(handler: WebSocketEventHandler): void {
    this.socket?.emit('unsubscribe:signals');
    this.socket?.off('signal', handler);
  }

  /**
   * 订阅账户更新
   */
  subscribeAccount(handler: WebSocketEventHandler): void {
    this.socket?.emit('subscribe:account');
    this.socket?.on('account', handler);
  }

  /**
   * 取消订阅账户更新
   */
  unsubscribeAccount(handler: WebSocketEventHandler): void {
    this.socket?.emit('unsubscribe:account');
    this.socket?.off('account', handler);
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.socket) {
      console.log('[WebSocket] Disconnecting...');
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * 获取连接状态
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

// 导出单例
export const ws = new WebSocketService();

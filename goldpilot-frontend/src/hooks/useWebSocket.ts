import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_CONFIG } from '@/utils/constants';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
}

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [priceData, setPriceData] = useState<any>(null);
  const [signalData, setSignalData] = useState<any>(null);
  const [accountData, setAccountData] = useState<any>(null);
  const socketRef = useRef<Socket | null>(null);

  // 连接WebSocket
  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('[WebSocket] Already connected');
      return;
    }

    console.log('[WebSocket] Connecting to', API_CONFIG.wsURL);

    const socket = io(API_CONFIG.wsURL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      console.log('[WebSocket] Connected', socket.id);
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('[WebSocket] Disconnected');
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error);
    });

    // 订阅价格更新
    socket.on('price', (data: WebSocketMessage) => {
      console.log('[WebSocket] Price update:', data);
      if (data.data) {
        setPriceData(data.data);
      }
    });

    // 订阅信号更新
    socket.on('signal', (data: WebSocketMessage) => {
      console.log('[WebSocket] Signal update:', data);
      if (data.data) {
        setSignalData(data.data);
      }
    });

    // 订阅账户更新
    socket.on('account', (data: WebSocketMessage) => {
      console.log('[WebSocket] Account update:', data);
      if (data.data) {
        setAccountData(data.data);
      }
    });

    socketRef.current = socket;
  }, []);

  // 断开连接
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('[WebSocket] Disconnecting...');
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnected(false);
    }
  }, []);

  // 订阅价格更新
  const subscribePrice = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('[WebSocket] Subscribing to price updates');
      socketRef.current.emit('subscribe:price');
    }
  }, []);

  // 取消订阅价格更新
  const unsubscribePrice = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('[WebSocket] Unsubscribing from price updates');
      socketRef.current.emit('unsubscribe:price');
    }
  }, []);

  // 订阅信号更新
  const subscribeSignals = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('[WebSocket] Subscribing to signal updates');
      socketRef.current.emit('subscribe:signals');
    }
  }, []);

  // 取消订阅信号更新
  const unsubscribeSignals = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('[WebSocket] Unsubscribing from signal updates');
      socketRef.current.emit('unsubscribe:signals');
    }
  }, []);

  // 订阅账户更新
  const subscribeAccount = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('[WebSocket] Subscribing to account updates');
      socketRef.current.emit('subscribe:account');
    }
  }, []);

  // 取消订阅账户更新
  const unsubscribeAccount = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('[WebSocket] Unsubscribing from account updates');
      socketRef.current.emit('unsubscribe:account');
    }
  }, []);

  // 自动连接
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connected,
    priceData,
    signalData,
    accountData,
    subscribePrice,
    unsubscribePrice,
    subscribeSignals,
    unsubscribeSignals,
    subscribeAccount,
    unsubscribeAccount,
    disconnect,
  };
}

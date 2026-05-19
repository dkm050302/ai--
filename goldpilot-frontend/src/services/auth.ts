import { message } from 'antd';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3006';

export interface LoginData {
  accountId: string;
  password: string;
  server: string;
}

export interface RegisterData {
  accountId: string;
  password: string;
  server: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: {
    accountId: string;
    server: string;
    accountInfo?: any;
  };
}

class AuthService {
  private token: string | null = null;
  private user: any = null;

  constructor() {
    // 初始化时从localStorage读取
    this.token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        this.user = JSON.parse(userStr);
      } catch (e) {
        this.user = null;
      }
    }
  }

  /**
   * 用户登录
   */
  async login(data: LoginData): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        this.token = result.token;
        this.user = result.user;
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
        return result;
      } else {
        throw new Error(result.message || '登录失败');
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * 用户注册
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        this.token = result.token;
        this.user = result.user;
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
        return result;
      } else {
        throw new Error(result.message || '注册失败');
      }
    } catch (error) {
      console.error('Register error:', error);
      throw error;
    }
  }

  /**
   * 退出登录
   */
  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    message.success('已退出登录');
  }

  /**
   * 获取token
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * 获取用户信息
   */
  getUser(): any {
    return this.user;
  }

  /**
   * 检查是否已登录
   */
  isAuthenticated(): boolean {
    return !!this.token;
  }

  /**
   * 获取当前用户信息（从API）
   */
  async fetchCurrentUser(): Promise<any> {
    if (!this.token) {
      throw new Error('未登录');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        this.user = result.data;
        localStorage.setItem('user', JSON.stringify(result.data));
        return result.data;
      } else {
        throw new Error(result.message || '获取用户信息失败');
      }
    } catch (error) {
      console.error('Fetch user error:', error);
      // 如果token失效，清除本地数据
      if ((error as any).message?.includes('401') || (error as any).message?.includes('认证')) {
        this.logout();
      }
      throw error;
    }
  }
}

export const authService = new AuthService();

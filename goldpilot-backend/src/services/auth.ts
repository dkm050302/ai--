import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { UserModel, type IUser } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'goldpilot-secret-key-2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface TokenPayload {
  userId: string;
  accountId: string;
  server: string;
}

export interface RegisterInput {
  accountId: string;
  password: string;
  server: string;
}

export interface LoginInput {
  accountId: string;
  password: string;
  server: string;
}

export interface AuthResult {
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
  /**
   * 用户注册
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    try {
      const { accountId, password, server } = input;

      // 检查用户是否已存在
      const existingUser = await UserModel.findByAccountId(accountId, server);
      if (existingUser) {
        return {
          success: false,
          message: '该MT4账号已在当前服务器注册',
        };
      }

      // 加密密码
      const hashedPassword = await bcrypt.hash(password, 10);

      // 创建用户
      const user = await UserModel.create({
        accountId,
        password: hashedPassword,
        server,
        accountInfo: {
          balance: 0,
          equity: 0,
          margin: 0,
          freeMargin: 0,
          positions: [],
          dailyPnl: 0,
        },
      });

      // 生成token
      const token = this.generateToken({
        userId: user._id.toString(),
        accountId: user.accountId,
        server: user.server,
      });

      return {
        success: true,
        message: '注册成功',
        token,
        user: {
          accountId: user.accountId,
          server: user.server,
          accountInfo: user.accountInfo,
        },
      };
    } catch (error) {
      console.error('Register error:', error);
      return {
        success: false,
        message: '注册失败，请稍后重试',
      };
    }
  }

  /**
   * 用户登录
   */
  async login(input: LoginInput): Promise<AuthResult> {
    try {
      const { accountId, password, server } = input;

      // 查找用户
      const user = await UserModel.findByAccountId(accountId, server);
      if (!user) {
        return {
          success: false,
          message: '账号或密码错误',
        };
      }

      // 验证密码
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return {
          success: false,
          message: '账号或密码错误',
        };
      }

      // 生成token
      const token = this.generateToken({
        userId: user._id.toString(),
        accountId: user.accountId,
        server: user.server,
      });

      return {
        success: true,
        message: '登录成功',
        token,
        user: {
          accountId: user.accountId,
          server: user.server,
          accountInfo: user.accountInfo,
        },
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: '登录失败，请稍后重试',
      };
    }
  }

  /**
   * 验证token
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
      return decoded;
    } catch (error) {
      console.error('Token verification error:', error);
      return null;
    }
  }

  /**
   * 生成token
   */
  private generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  }

  /**
   * 根据ID获取用户
   */
  async getUserById(userId: string): Promise<IUser | null> {
    try {
      return await UserModel.findById(userId);
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }
}

export const authService = new AuthService();

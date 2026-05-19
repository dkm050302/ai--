# MongoDB 安装指南 - Windows

## 方法一：官方安装程序（推荐）

### 步骤1：下载MongoDB

1. 访问MongoDB官网下载页面：
   https://www.mongodb.com/try/download/community

2. 选择：
   - Version: 选择最新版本（如 MongoDB 8.0.x）
   - OS: Windows
   - Package: MSI

3. 点击 "Download" 下载 `.msi` 安装文件

### 步骤2：运行安装程序

1. 双击下载的 `.msi` 文件
2. 在安装向导中选择：
   - ✅ "Complete" 安装（推荐）
   - ✅ "Install MongoDB as a Service"（作为Windows服务安装）
   - ✅ "Service Name": MongoDB
   - ✅ "Data Directory": C:\data\db（默认）
   - ✅ "Log Directory": C:\data\log（默认）

3. 点击 "Install" 开始安装

### 步骤3：配置环境变量（可选）

安装程序通常会自动配置环境变量。

验证方法：
1. 打开命令提示符
2. 输入：`mongod --version`
3. 如果显示版本号，说明配置成功

### 步骤4：启动MongoDB服务

#### 方法A：通过服务管理器
1. 按 `Win + R`，输入 `services.msc`
2. 找到 "MongoDB" 服务
3. 右键 → 启动

#### 方法B：使用命令行
```bash
# 启动服务
net start MongoDB

# 停止服务
net stop MongoDB

# 查看服务状态
sc query MongoDB
```

### 步骤5：验证安装

1. 打开命令提示符
2. 连接到MongoDB：
   ```bash
   mongod
   ```
   或直接输入：
   ```bash
   mongosh
   ```

3. 如果看到类似以下输出，说明安装成功：
   ```
   MongoDB shell version v8.0.0
   connecting to: mongodb://127.0.0:27017/?compressors=disabled&version srv=8.0
   ```

4. 输入测试命令：
   ```javascript
   show dbs
   ```

---

## 安装位置

- 默认安装路径：`C:\Program Files\MongoDB\Server\8.0\`
- 数据目录：`C:\data\db`
- 日志目录：`C:\data\log`
- 配置文件：`C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg`

---

## 常用命令

### 服务管理
```bash
# 启动服务
net start MongoDB

# 停止服务
net stop MongoDB

# 重启服务
net stop MongoDB
net start MongoDB

# 查看状态
sc query MongoDB
```

### MongoDB Shell
```bash
# 连接到MongoDB
mongosh

# 显示所有数据库
show dbs

# 切换到数据库
use goldpilot

# 显示集合
show collections

# 查询数据
db.signals.find().pretty()
```

---

## 默认配置

- **端口**: 27017
- **数据目录**: C:\data\db
- **日志目录**: C:\data\log
- **服务名称**: MongoDB

---

## 验证安装是否成功

运行以下命令测试：

```bash
# 1. 检查服务状态
sc query MongoDB

# 2. 连接到MongoDB
mongosh

# 3. 测试命令
show dbs
```

如果以上命令都正常，说明MongoDB安装成功！

---

## 后续步骤

安装完成后：
1. 启动MongoDB服务
2. 验证连接
3. 更新后端代码使用MongoDB
4. 测试数据持久化功能

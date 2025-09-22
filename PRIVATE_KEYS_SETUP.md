# 🔑 私钥配置指南

现在支持三种方式配置私钥，推荐使用**外部文件方式**，更安全且方便管理多个私钥。

## 📋 配置方式对比

| 方式 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| 外部文件 | 🟢 安全性高<br>🟢 支持大量私钥<br>🟢 易于管理 | 需要额外文件 | ⭐⭐⭐⭐⭐ |
| 环境变量(多个) | 🟡 相对安全 | 🟡 .env文件较长 | ⭐⭐⭐ |
| 环境变量(单个) | 🟡 配置简单 | 🔴 只支持1个钱包 | ⭐⭐ |

## 🚀 方式1: 外部文件 (推荐)

### 1. 创建私钥文件
```bash
# 复制示例文件
cp private_keys.txt.example private_keys.txt

# 编辑私钥文件
nano private_keys.txt
```

### 2. 私钥文件格式
```
# 方式A: 每行一个私钥
abc123def456...
def789ghi012...
ghi345jkl678...

# 方式B: 逗号分隔
abc123def456...,def789ghi012...,ghi345jkl678...

# 方式C: 混合格式（支持注释）
# 主钱包
abc123def456...

# 测试钱包  
def789ghi012...,ghi345jkl678...
```

### 3. 配置.env文件
```bash
# 方式1: 外部文件 (推荐)
PRIVATE_KEYS_FILE=private_keys.txt

# 其他配置
LOG_FILE=transactions.log
```

### 4. 安全建议
```bash
# 设置文件权限 (仅所有者可读写)
chmod 600 private_keys.txt

# 或将私钥文件放在项目外
PRIVATE_KEYS_FILE=/secure/path/to/private_keys.txt
```

## 🔒 方式2: 环境变量 (多个私钥)

### 配置.env文件
```bash
# 注释掉文件方式
# PRIVATE_KEYS_FILE=private_keys.txt

# 直接配置多个私钥
PRIVATE_KEYS=key1,key2,key3,key4,key5

LOG_FILE=transactions.log
```

## 🔐 方式3: 环境变量 (单个私钥)

### 配置.env文件
```bash
# 注释掉其他方式
# PRIVATE_KEYS_FILE=private_keys.txt
# PRIVATE_KEYS=key1,key2,key3

# 单个私钥
PRIVATE_KEY=your_single_private_key_here

LOG_FILE=transactions.log
```

## 🛡️ 安全注意事项

### ✅ 安全做法
- 🔒 使用外部文件方式存储私钥
- 📁 将私钥文件放在项目目录外
- 🔐 设置适当的文件权限 `chmod 600`
- 🚫 确保私钥文件在 `.gitignore` 中
- 🔄 定期轮换私钥

### ❌ 避免做法
- 🚫 不要将私钥提交到Git仓库
- 🚫 不要在公共场所显示私钥文件内容
- 🚫 不要使用主网私钥进行测试
- 🚫 不要将私钥分享给他人

## 🧪 测试配置

### 验证私钥加载
```bash
# 启动程序查看日志
npm start

# 正确配置会显示:
# ✅ 从文件加载私钥: private_keys.txt
# 🔑 成功加载 X 个私钥
```

### 常见错误处理
```bash
# 错误1: 文件不存在
❌ 私钥文件不存在: private_keys.txt
# 解决: 检查文件路径和文件是否存在

# 错误2: 权限问题  
❌ 读取私钥文件失败: EACCES: permission denied
# 解决: chmod 644 private_keys.txt

# 错误3: 格式错误
❌ 未找到私钥!
# 解决: 检查私钥格式，确保非空行包含有效私钥
```

## 📚 文件结构示例

```
Giwa-Testnet-Bot/
├── kazmight.js           # 主程序
├── .env                  # 环境配置
├── .env.example          # 配置示例
├── private_keys.txt      # 私钥文件 (你创建)
├── private_keys.txt.example  # 私钥示例
└── PRIVATE_KEYS_SETUP.md # 本说明文件
```

现在您可以轻松管理多个私钥了！🎉

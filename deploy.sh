#!/bin/bash

echo "🚀 Giwa测试网桥接工具 - VPS部署脚本"
echo "================================"

# 检查Node.js版本
echo "📋 检查Node.js版本..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js未安装，正在安装..."
    # Ubuntu/Debian
    if command -v apt &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    # CentOS/RHEL
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs
    else
        echo "❌ 不支持的操作系统，请手动安装Node.js v18+"
        exit 1
    fi
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js版本: $NODE_VERSION"

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm未找到"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo "✅ npm版本: $NPM_VERSION"

# 克隆仓库
echo "📥 克隆仓库..."
REPO_URL="https://github.com/您的用户名/您的仓库名.git"
PROJECT_DIR="Giwa-Testnet-Bot-Chinese"

if [ -d "$PROJECT_DIR" ]; then
    echo "📂 目录已存在，更新代码..."
    cd "$PROJECT_DIR"
    git pull origin main
else
    echo "📂 克隆新仓库..."
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

# 安装依赖
echo "📦 安装依赖包..."
npm install

# 创建配置文件
echo "⚙️  创建配置文件..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "📝 请编辑 .env 文件添加您的私钥:"
    echo "   nano .env"
    echo ""
    echo "配置示例:"
    echo "PRIVATE_KEYS=your_private_key_1,your_private_key_2"
    echo "LOG_FILE=transactions.log"
fi

# 创建systemd服务文件 (可选)
echo "🔧 创建系统服务..."
sudo tee /etc/systemd/system/giwa-bot.service > /dev/null <<EOF
[Unit]
Description=Giwa Testnet Bot
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node kazmight.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# 启用服务
sudo systemctl daemon-reload
sudo systemctl enable giwa-bot

echo "✅ 部署完成！"
echo ""
echo "🔧 使用说明:"
echo "1. 编辑配置文件: nano .env"
echo "2. 手动运行: npm start"
echo "3. 后台运行: sudo systemctl start giwa-bot"
echo "4. 查看状态: sudo systemctl status giwa-bot"
echo "5. 查看日志: sudo journalctl -u giwa-bot -f"
echo "6. 停止服务: sudo systemctl stop giwa-bot"
echo ""
echo "📁 项目目录: $(pwd)"
echo "📋 配置文件: $(pwd)/.env"

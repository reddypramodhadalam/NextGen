# AITAS Local Agent Setup Guide

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation Methods](#installation-methods)
4. [Configuration](#configuration)
5. [Verification](#verification)
6. [Troubleshooting](#troubleshooting)
7. [Advanced Configuration](#advanced-configuration)

---

## 🎯 Overview

Local agents run on your infrastructure and execute tests in a secure, isolated environment. Your code and data never leave your network.

### Benefits

| Feature | Benefit |
|---------|---------|
| **Security** | Code stays in your environment |
| **Performance** | No network latency |
| **Scalability** | Run multiple agents simultaneously |
| **Compliance** | Meet regulatory requirements |
| **Cost-Effective** | No cloud execution fees |

---

## ✅ Prerequisites

### System Requirements

**Minimum:**
- 2 CPU cores
- 4 GB RAM
- 10 GB disk space
- Network connectivity to AITAS server

**Recommended:**
- 4+ CPU cores
- 8+ GB RAM
- 50+ GB disk space
- Gigabit network connection

### Supported Operating Systems

- ✅ Ubuntu 20.04 LTS or newer
- ✅ CentOS/RHEL 8 or newer
- ✅ macOS 10.15 or newer
- ✅ Windows Server 2019 or newer
- ✅ Docker (any OS with Docker support)

### Required Software

- Node.js 18+ (for native installation)
- npm or yarn (for native installation)
- Docker 20.10+ (for container deployment)
- curl or wget (for downloading installer)

---

## 🚀 Installation Methods

### Method 1: Linux / macOS Quick Install

```bash
curl -fsSL https://get.aitas.dev/agent.sh | bash
```

This command will:
1. Download the latest AITAS agent
2. Install required dependencies
3. Create system user for the agent
4. Set up systemd service

### Method 2: macOS via Homebrew

```bash
brew tap aitas/tap
brew install aitas-agent
```

### Method 3: Windows PowerShell

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
iwr https://get.aitas.dev/agent.ps1 | iex
```

### Method 4: Docker

```bash
docker run -d \
  --name aitas-agent \
  -e AITAS_SERVER_URL=http://your-aitas-server.com \
  -e AITAS_API_KEY=your-api-key \
  -e AITAS_AGENT_NAME="My Docker Agent" \
  -p 9090:9090 \
  aitas/agent:latest
```

### Method 5: Manual Installation (Linux)

```bash
# 1. Download latest release
curl -fsSL https://get.aitas.dev/agent/latest/aitas-agent-linux-x64.tar.gz -o aitas-agent.tar.gz

# 2. Extract
tar -xzf aitas-agent.tar.gz
cd aitas-agent

# 3. Install dependencies
npm install

# 4. Make scripts executable
chmod +x bin/aitas-agent

# 5. Create symlink (optional)
sudo ln -s $(pwd)/bin/aitas-agent /usr/local/bin/aitas-agent
```

---

## ⚙️ Configuration

### 1. Get Your API Key

In AITAS Web UI:
1. Go to **Agents → Local Agent Setup**
2. Click **"Register New Agent"**
3. Fill in agent details
4. Click **"Register Agent"**
5. Copy the generated API key

### 2. Create Configuration File

**Linux/macOS:**
```bash
mkdir -p ~/.aitas
cat > ~/.aitas/config.env << EOF
# AITAS Server Configuration
AITAS_SERVER_URL=http://your-aitas-server.com
AITAS_API_KEY=your-generated-api-key
AITAS_AGENT_ID=your-agent-id

# Agent Configuration
AITAS_AGENT_NAME=My Local Agent
AITAS_AGENT_TYPE=browser

# Logging
AITAS_LOG_LEVEL=info
AITAS_LOG_DIR=~/.aitas/logs

# Capabilities
AITAS_ENABLE_SCREENSHOTS=true
AITAS_ENABLE_VIDEO=true
AITAS_ENABLE_NETWORK_LOGGING=true
AITAS_ENABLE_PERFORMANCE_METRICS=true
EOF
```

**Windows PowerShell:**
```powershell
$configPath = "$env:APPDATA\AITAS"
New-Item -ItemType Directory -Path $configPath -Force
@"
AITAS_SERVER_URL=http://your-aitas-server.com
AITAS_API_KEY=your-generated-api-key
AITAS_AGENT_ID=your-agent-id
AITAS_AGENT_NAME=My Windows Agent
AITAS_LOG_LEVEL=info
"@ | Set-Content "$configPath\config.env"
```

### 3. Start the Agent

**Linux/macOS:**
```bash
# Using installed service
sudo systemctl start aitas-agent

# Or manually
aitas-agent start

# Using npm (from agent directory)
npm run start:agent
```

**Windows:**
```powershell
# Start service
Start-Service aitas-agent

# Or manually
aitas-agent start
```

**Docker:**
```bash
docker start aitas-agent
```

---

## ✅ Verification

### Check Agent Status

**In AITAS Web UI:**
1. Go to **Agents** page
2. Look for your agent in the "Online Agents" section
3. Status should show as ✓ Online (green)

**Via Command Line:**
```bash
# Check if agent is running
curl http://localhost:9090/health

# Expected response:
# {"status":"healthy","agentId":"...","lastHeartbeat":"..."}
```

**View Logs:**
```bash
# Linux/macOS
tail -f ~/.aitas/logs/agent.log

# Windows
Get-Content "$env:APPDATA\AITAS\logs\agent.log" -Tail 50 -Wait
```

### Test Connection

```bash
# From agent machine
curl -X POST http://your-aitas-server.com/api/agents/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"agentId":"your-agent-id","status":"online"}'
```

---

## 🔧 Troubleshooting

### Agent Shows Offline

**Symptoms:** Agent appears offline in AITAS UI

**Solutions:**
1. Check if agent process is running:
   ```bash
   ps aux | grep aitas-agent
   ```

2. Verify network connectivity:
   ```bash
   ping your-aitas-server.com
   ```

3. Check configuration:
   ```bash
   cat ~/.aitas/config.env
   ```

4. Verify API key:
   ```bash
   curl -H "Authorization: Bearer YOUR_API_KEY" \
     http://your-aitas-server.com/api/agents/verify
   ```

5. Check logs:
   ```bash
   tail -f ~/.aitas/logs/agent.log | grep -i error
   ```

### Installation Failed

**Linux:**
```bash
# Check if curl is installed
which curl

# Try alternative download method
wget https://get.aitas.dev/agent.sh
bash agent.sh

# Try manual install
git clone https://github.com/aitas/agent.git
cd agent
npm install
npm run build
npm run start:agent
```

**macOS:**
```bash
# Ensure Homebrew is installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Xcode Command Line Tools
xcode-select --install
```

**Windows:**
```powershell
# Check execution policy
Get-ExecutionPolicy

# Install from PowerShell with admin rights
Start-Process powershell -Verb RunAs
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
iwr https://get.aitas.dev/agent.ps1 | iex
```

### Tests Not Running

1. Verify agent capabilities:
   ```bash
   curl http://localhost:9090/capabilities
   ```

2. Check test case format:
   - Ensure test cases have valid steps
   - Verify target URL is accessible

3. View detailed logs:
   ```bash
   export AITAS_LOG_LEVEL=debug
   aitas-agent start
   ```

### High CPU/Memory Usage

1. Limit concurrent executions:
   ```bash
   export MAX_CONCURRENT_TESTS=2
   aitas-agent start
   ```

2. Increase system resources:
   - Add more CPU cores
   - Add more RAM

3. Clear cache:
   ```bash
   aitas-agent clean-cache
   ```

---

## 🔐 Advanced Configuration

### HTTPS Connection

```env
# Use HTTPS
AITAS_SERVER_URL=https://your-aitas-server.com

# Disable SSL verification (NOT recommended for production)
AITAS_SSL_VERIFY=false

# Use custom CA certificate
AITAS_CA_CERT=/path/to/ca-cert.pem
```

### Proxy Configuration

```env
# HTTP Proxy
HTTP_PROXY=http://proxy.example.com:8080
HTTPS_PROXY=https://proxy.example.com:8080

# No Proxy (exceptions)
NO_PROXY=localhost,127.0.0.1,internal.example.com
```

### Performance Tuning

```env
# Increase concurrent test executions
MAX_CONCURRENT_TESTS=4

# Set browser memory limit
BROWSER_MEMORY_LIMIT=512

# Adjust timeouts
TEST_TIMEOUT=30000
CONNECTION_TIMEOUT=10000
```

### Advanced Logging

```env
# Log format
AITAS_LOG_FORMAT=json

# Log to file and stdout
AITAS_LOG_OUTPUT=both

# Log file rotation
AITAS_LOG_MAX_SIZE=100M
AITAS_LOG_MAX_FILES=7
```

### Monitoring & Metrics

```env
# Enable Prometheus metrics
AITAS_METRICS_ENABLED=true
AITAS_METRICS_PORT=9091

# Send metrics to external system
AITAS_METRICS_EXPORT=datadog
AITAS_DATADOG_API_KEY=your-key
```

---

## 📊 System Integration

### Linux Systemd Service

The installer creates `/etc/systemd/system/aitas-agent.service`:

```ini
[Unit]
Description=AITAS Test Agent
After=network.target

[Service]
Type=simple
User=aitas-agent
WorkingDirectory=/opt/aitas-agent
EnvironmentFile=/etc/aitas-agent/config.env
ExecStart=/opt/aitas-agent/bin/aitas-agent start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Manage service:
```bash
sudo systemctl start aitas-agent      # Start
sudo systemctl stop aitas-agent       # Stop
sudo systemctl restart aitas-agent    # Restart
sudo systemctl status aitas-agent     # Check status
sudo systemctl enable aitas-agent     # Auto-start on boot
```

### Windows Service

Install as service:
```powershell
aitas-agent install-service
```

Manage service:
```powershell
Start-Service aitas-agent
Stop-Service aitas-agent
Restart-Service aitas-agent
Get-Service aitas-agent
```

### Docker Compose

```yaml
version: '3.8'

services:
  aitas-agent:
    image: aitas/agent:latest
    container_name: aitas-agent
    environment:
      AITAS_SERVER_URL: http://aitas-server.example.com
      AITAS_API_KEY: your-api-key
      AITAS_AGENT_NAME: Docker Agent
      AITAS_LOG_LEVEL: info
    ports:
      - "9090:9090"
    volumes:
      - aitas-logs:/root/.aitas/logs
    restart: always
    networks:
      - aitas-network

volumes:
  aitas-logs:

networks:
  aitas-network:
    driver: bridge
```

---

## 📞 Support

### Getting Help

1. **Check Logs:** First step is always to check agent logs
2. **Health Endpoint:** Test the health endpoint
3. **Documentation:** Consult this guide and API docs
4. **Support Portal:** Contact AITAS support team

### Common Commands

```bash
# Get agent version
aitas-agent --version

# Show help
aitas-agent --help

# Check configuration
aitas-agent config show

# Validate configuration
aitas-agent config validate

# Reset to defaults
aitas-agent config reset
```

---

## 🔄 Updates & Maintenance

### Update Agent

**Linux/macOS:**
```bash
curl -fsSL https://get.aitas.dev/agent.sh | bash --upgrade
```

**Docker:**
```bash
docker pull aitas/agent:latest
docker stop aitas-agent
docker rm aitas-agent
docker run -d ... aitas/agent:latest
```

### Backup Configuration

```bash
# Linux/macOS
tar -czf aitas-agent-backup.tar.gz ~/.aitas/

# Windows
Compress-Archive -Path "$env:APPDATA\AITAS" -DestinationPath "aitas-agent-backup.zip"
```

---

**Last Updated:** Today
**Version:** 1.0
**Status:** Production Ready ✅


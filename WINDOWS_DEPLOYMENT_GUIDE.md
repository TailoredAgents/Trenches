# Windows Deployment Guide for Trenches

## ✅ **Cross-Platform Compatibility Audit Completed**

This guide ensures Trenches runs smoothly on Windows after our comprehensive audit and fixes.

---

## **🚨 Critical Prerequisites**

### **1. Install Required Tools**
```powershell
# Install Node.js 20+ (required)
winget install OpenJS.NodeJS

# Install Python 3.8+ (for ML training)
winget install Python.Python.3.11

# Install Visual Studio Build Tools (for native modules)
winget install Microsoft.VisualStudio.2022.BuildTools

# Install Git
winget install Git.Git

# Verify installations
node --version    # Should be 20+
python --version  # Should be 3.8+
npm --version
git --version
```

### **2. Enable Node.js Native Compilation**
```powershell
# Install windows-build-tools (for better-sqlite3)
npm install -g windows-build-tools

# OR manually install Visual Studio Build Tools with:
# - C++ build tools
# - Windows 10/11 SDK
# - CMake tools
```

---

## **📁 Directory Setup**

### **1. Create Project Directory**
```powershell
# Use a path WITHOUT spaces (critical for compatibility)
cd C:\
mkdir Trenches
cd Trenches

# Clone the repository
git clone https://github.com/your-repo/Trenches.git .
```

### **2. Verify Directory Structure**
```
C:\Trenches\
├── config/
│   └── default.yaml
├── data/               # Will be created automatically
├── models/             # Will be created automatically  
├── scripts/
│   ├── start-trenches.bat     # ✅ Windows batch script
│   ├── start-trenches.ps1     # ✅ PowerShell script
│   └── start-trenches.sh      # Unix script (ignore)
├── services/
├── packages/
└── training_py/
```

---

## **⚙️ Installation Process**

### **1. Install pnpm (Required)**
```powershell
npm install -g pnpm
pnpm --version
```

### **2. Install Dependencies**
```powershell
# Install all Node.js dependencies
pnpm install

# Install Python dependencies (for ML training)
python -m pip install -r training_py/requirements.txt
```

### **3. Build All Services**
```powershell
# Build the entire project
pnpm build

# Verify no TypeScript errors
# Should complete without errors
```

---

## **🔧 Configuration**

### **1. Copy Environment Template**
```powershell
copy env.example .env
```

### **2. Edit .env File (Critical Windows Paths)**
```bash
# ✅ Use forward slashes or double backslashes in paths
WALLET_KEYSTORE_PATH=./scripts/wallet/id.json
TELEGRAM_TDLIB_DB_PATH=./data/tdlib
PERSISTENCE_SQLITE_PATH=./data/trenches.db

# Add your API keys
NEYNAR_API_KEY=your_key_here
BLUESKY_JETSTREAM_TOKEN=your_token_here
REDDIT_CLIENT_ID=your_id_here
# ... other keys
```

### **3. Create Required Directories**
```powershell
mkdir data
mkdir data\tdlib
mkdir models
mkdir tmp
```

---

## **🚀 Starting Services**

### **Method 1: PowerShell Script (Recommended)**
```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Start all services
.\scripts\start-trenches.ps1
```

### **Method 2: Batch Script**
```cmd
# Simple double-click execution
.\scripts\start-trenches.bat
```

### **Method 3: Manual Development**
```powershell
# Development mode (all services in one terminal)
pnpm dev:core
```

### **Method 4: Individual Services**
```powershell
# Start services individually (separate terminals)
pnpm --filter @trenches/agent-core start
pnpm --filter @trenches/safety-engine start
# ... etc
```

---

## **🛡️ Windows-Specific Fixes Applied**

### **✅ Path Compatibility**
- Fixed hardcoded forward slashes in model loading
- Updated schema to use `path.join()` for cross-platform paths
- Fixed environment variables with Windows paths

### **✅ Process Management**
- Created Windows-compatible startup scripts (.bat and .ps1)
- Fixed process termination using `taskkill` instead of Unix signals
- Updated soak testing scripts for Windows process cleanup

### **✅ Build Compatibility**
- Fixed TypeScript nullable type issues
- Updated config schema for Windows path handling
- Verified all services build without errors

### **✅ Native Dependencies**
- `better-sqlite3`: Requires Visual Studio Build Tools ✅
- `tdl-tdlib-addon`: Requires native compilation ✅
- Python packages: Standard pip installation ✅

---

## **🔍 Verification Steps**

### **1. Test Configuration Loading**
```powershell
node -e "const { loadConfig } = require('./packages/config/dist/index.js'); console.log('Config loaded successfully'); console.log('Fast-entry threshold:', loadConfig().safety.fastEntry.sssThreshold);"
```

### **2. Test Database Creation**
```powershell
# Start any service to create database
pnpm --filter @trenches/agent-core start
# Ctrl+C to stop, check that ./data/trenches.db was created
```

### **3. Test All Builds**
```powershell
pnpm build
# Should complete without TypeScript errors
```

### **4. Test Service Health**
```powershell
# Start core services
pnpm dev:core

# In another terminal, test health endpoints
curl http://localhost:4010/healthz  # agent-core
curl http://localhost:4014/healthz  # safety-engine
curl http://localhost:4015/healthz  # policy-engine
```

---

## **⚠️ Common Windows Issues & Solutions**

### **Issue 1: "node-gyp" Build Errors**
```powershell
# Solution: Install Windows Build Tools
npm install -g windows-build-tools
# OR install Visual Studio Build Tools manually
```

### **Issue 2: "Permission Denied" Errors**
```powershell
# Solution: Run PowerShell as Administrator
# OR change execution policy:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### **Issue 3: "Path Too Long" Errors**
```powershell
# Solution: Use shorter paths
# Move project to C:\Trenches instead of deep nested folders
```

### **Issue 4: SQLite "Database Locked" Errors**
```powershell
# Solution: Close all Node.js processes
taskkill /f /im node.exe
# Then restart services
```

### **Issue 5: Port Already in Use**
```powershell
# Solution: Check which process is using the port
netstat -ano | findstr :4010
# Kill the process using the port
taskkill /PID <process_id> /F
```

---

## **🚀 Production Deployment**

### **1. Windows Service (Optional)**
```powershell
# Install pm2 for Windows service management
npm install -g pm2
npm install -g pm2-windows-service

# Setup pm2 as Windows service
pm2-service-install

# Start services with pm2
pm2 start ecosystem.config.js
pm2 save
```

### **2. Performance Optimization**
```powershell
# Increase Node.js memory limit
set NODE_OPTIONS=--max-old-space-size=8192

# Set production environment
set NODE_ENV=production
```

---

## **🎯 Quick Start Checklist**

- [ ] ✅ Node.js 20+ installed
- [ ] ✅ Python 3.8+ installed  
- [ ] ✅ Visual Studio Build Tools installed
- [ ] ✅ Repository cloned to simple path (no spaces)
- [ ] ✅ `pnpm install` completed successfully
- [ ] ✅ `pnpm build` completed without errors
- [ ] ✅ Environment variables configured in `.env`
- [ ] ✅ Required directories created (`data`, `models`, `tmp`)
- [ ] ✅ Services start without errors
- [ ] ✅ Health endpoints respond correctly
- [ ] ✅ Database file created automatically

---

## **🆘 Support**

If you encounter Windows-specific issues:

1. **Check this guide first** - Most common issues are covered
2. **Verify prerequisites** - Ensure all required tools are installed
3. **Check paths** - Avoid spaces in directory names
4. **Run as Administrator** - Some operations require elevated privileges
5. **Check antivirus** - Windows Defender may interfere with Node.js processes

---

## **🎉 Success Indicators**

When everything is working correctly, you should see:

```
🎯 TRENCHES MEMECOIN HUNTER ACTIVE
📊 Dashboard: http://localhost:3000
⚡ Fast-entry mode: ALWAYS ENABLED
💪 Position sizing: AGGRESSIVE DEFAULT
🎰 Max concurrent positions: 8
🚨 RugGuard threshold: 80% (relaxed)

🌙 MOONSHOT STRATEGY:
   - First exit: 100% profit (partial exit)
   - Second exit: 300% profit (partial exit)
   - Third exit: 800% profit (partial exit)
   - HODL target: 2000%+ gains

🚀 Trenches Memecoin Hunter is LIVE!
```

**Congratulations! Trenches is now running on Windows! 🎊**
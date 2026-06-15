# Starting the Local Agent Feature

## 🚀 Quick Start (5 minutes)

### Step 1: Stop Current Server
Press in your terminal:
```
Ctrl + C
```

### Step 2: Start Dev Server
```bash
npm run dev
```

Wait for server to start. You should see:
```
✓ Dev server running on http://localhost:5173
[agent-health] Agent health monitor started
```

### Step 3: Open AITAS
1. Open browser to `http://localhost:5173`
2. Login with your credentials
3. Navigate to **Agents** in sidebar

### Step 4: See the New Local Agent Setup

In the **Agents** page, you should now see:
- A new info card saying "Local Agent Setup"
- A **"View Setup Guide"** button

Click it to see the new **Local Agent Setup** page with:
- 📊 Agent statistics (Total, Online, Offline)
- 📋 Tabs for Overview, Installation, My Agents, Troubleshoot
- 🎯 Register New Agent button

---

## 📋 What You'll See

### Agents Page Updates
```
[SERVER ICON] Local Agent Setup

"Install & manage AITAS agents on your infrastructure..."

[View Setup Guide]  ← Click here
```

### New Local Agent Setup Page (`/agents/setup`)

#### Overview Tab
- What is a Local Agent?
- Benefits (Security, Performance, Scalability, 24/7)
- Quick Start guide (4 steps)

#### Installation Tab
- **Linux** - Quick install command + full script
- **macOS** - Homebrew + quick install
- **Windows** - PowerShell command
- **Docker** - Docker run command + Docker Compose

#### My Agents Tab
- List of registered agents
- Shows: Name, Status (Online/Offline), Type, Last Heartbeat
- Health check button for each agent
- Refresh capability button

#### Troubleshoot Tab
- Common issues & solutions:
  - Agent Shows Offline
  - Installation Failed
  - Tests Not Running
  - High CPU/Memory Usage
- View logs section

---

## ✅ Testing the Feature

### Test 1: Navigate to New Page
1. Click on **Agents** in sidebar
2. Look for "Local Agent Setup" card at bottom
3. Click **"View Setup Guide"**
4. ✅ Should show new setup page

### Test 2: Register an Agent
1. In Local Agent Setup page, click **"Register New Agent"**
2. Fill in:
   - Agent Name: `Test Local Agent`
   - Description: `For testing local agent feature`
3. Click **"Register Agent"**
4. ✅ Should show agent in "My Agents" section
5. Status should show as "Offline" initially

### Test 3: View Agent Information
1. In "My Agents" tab, find the registered agent
2. See:
   - Agent name
   - Status badge (currently Offline)
   - Type (Browser)
   - Last seen time
3. Click refresh icon
4. ✅ System should check agent health

### Test 4: View Installation Instructions
1. Go to **Installation** tab
2. See commands for:
   - Linux
   - macOS  
   - Windows
   - Docker
3. Click **"Copy Command"** on any
4. ✅ Command should be copied to clipboard

---

## 🔍 Verify Backend Changes

### Check Agent Endpoints

**In browser console or terminal:**

```bash
# Check if server is running
curl http://localhost:5000/health

# Check agents endpoint
curl http://localhost:5000/api/agents

# Should see your registered agent with status "offline"
```

### Check Logs for Health Monitor

**In terminal running dev server, look for:**
```
[agent-health] Agent health monitor started
[agent-health] Starting periodic health checks...
```

---

## 📁 What Changed

### New Files Created:
1. `client/src/pages/local-agent-setup.tsx` - New setup page
2. `server/agent-health-monitor.ts` - Health monitoring service
3. `LOCAL_AGENT_SETUP_GUIDE.md` - Installation guide
4. `LOCAL_AGENT_IMPLEMENTATION_SUMMARY.md` - Implementation details

### Modified Files:
1. `client/src/pages/agents.tsx` - Added setup card & button
2. `client/src/App.tsx` - Added /agents/setup route
3. `server/routes.ts` - Added registration & heartbeat endpoints
4. `server/index.ts` - Auto-start health monitor

---

## 🆘 If Something Doesn't Work

### If page doesn't load:
1. Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
2. Check browser console (F12) for errors
3. Check server logs for errors

### If agents don't appear:
1. Make sure you registered an agent
2. Check if API call succeeded (see network tab in DevTools)
3. Refresh the page

### If health monitor doesn't start:
1. Check server logs for `[agent-health]` messages
2. Ensure `agent-health-monitor.ts` is created
3. Check `server/index.ts` has health monitor import

---

## 🎯 Next Steps

### Try These Features:

1. **Register Multiple Agents:**
   - Create agents for different environments
   - See them all in "My Agents"

2. **Test Installation Commands:**
   - Copy commands for your OS
   - Share with team members

3. **Monitor Agent Status:**
   - See automatic status updates
   - Try health check button

4. **Review Documentation:**
   - Check `LOCAL_AGENT_SETUP_GUIDE.md`
   - See installation steps for your OS

---

## 📞 Common Questions

### Q: Why is my agent offline?
**A:** Agents go offline when they don't send a heartbeat within 60 seconds. To make it online:
1. Install the actual AITAS agent on your machine
2. Configure it with the API key from registration
3. Start the agent process
4. Agent status will automatically change to online

### Q: Where's the dialog to register agents?
**A:** Click the **"Register New Agent"** button in the Local Agent Setup page

### Q: How do I copy the install command?
**A:** In the Installation tab, hover over the command and click the copy icon (or use the "Copy Command" button)

### Q: Can I install on Windows?
**A:** Yes! Go to the Installation tab, find Windows section with PowerShell command

---

## ✨ Feature Highlights

🎯 **Easy Registration** - Register agents with just a few clicks
🌍 **Multi-OS Support** - Linux, macOS, Windows, Docker
🔄 **Auto Health Check** - Every 30 seconds, automatically detects offline agents
📊 **Live Status** - See real-time agent status in UI
🛠️ **Troubleshooting** - Built-in guide for common issues
📝 **Installation Guide** - Complete setup guide included
🔒 **Secure** - API keys auto-generated, code stays local

---

**Status:** ✅ Ready to Test
**Time to Setup:** 5 minutes
**Features:** Complete
**Documentation:** Included

Let me know if you need anything else! 🚀


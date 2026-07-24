# 🏠 Localhost Deployment

Run LLM Gateway on your local machine for development and personal use.

---

## 📦 Installation

Install LLM Gateway globally via npm:

```bash
npm install -g llm-gateway
```

**Requirements:**
- Node.js 20 or higher
- npm 9 or higher

---

## 🚀 Starting the Server

Start LLM Gateway with a single command:

```bash
llm-gateway
```

The dashboard will automatically open in your browser at `http://localhost:3000`

**Default Configuration:**
- **Dashboard**: `http://localhost:3000`
- **API Endpoint**: `http://localhost:20128/v1`
- **Data Directory**: `~/.llm-gateway`

---

## 🔧 Configuration

### Custom Data Directory

Set a custom data directory using environment variable:

```bash
DATA_DIR=/path/to/data llm-gateway
```

### Custom Port

The API port (20128) and dashboard port (3000) are configured in the application. To change them, you'll need to modify the source code or use environment variables if supported.

---

## 🛑 Stopping the Server

Press `Ctrl+C` in the terminal where LLM Gateway is running.

```bash
# In the terminal running llm-gateway
^C  # Press Ctrl+C
```

The server will gracefully shut down and save all data.

---

## 🔄 Restarting the Server

Simply run the start command again:

```bash
llm-gateway
```

All your configurations, API keys, and combos are preserved in the data directory.

---

## 📊 Updating LLM Gateway

Update to the latest version:

```bash
npm update -g llm-gateway
```

Check your current version:

```bash
npm list -g llm-gateway
```

---

## 🔍 Troubleshooting

### Port Already in Use

If port 20128 or 3000 is already in use:

```bash
# Find process using the port (macOS/Linux)
lsof -i :20128
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Permission Errors

If you encounter permission errors during installation:

```bash
# Use sudo (not recommended)
sudo npm install -g llm-gateway

# Or fix npm permissions (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Data Directory Issues

If the data directory is not accessible:

```bash
# Check permissions
ls -la ~/.llm-gateway

# Fix permissions
chmod 755 ~/.llm-gateway
```

---

## 📁 Data Directory Structure

```
~/.llm-gateway/
├── db/
│   ├── data.sqlite   # SQLite database (providers, keys, usage, audit)
│   └── backups/      # Automatic database backups
├── logs/             # Application logs
└── cache/            # Temporary cache files
```

**Backup Your Data:**

```bash
# Backup
cp -r ~/.llm-gateway ~/.llm-gateway.backup

# Restore
cp -r ~/.llm-gateway.backup ~/.llm-gateway
```

---

## 🔗 Next Steps

- [Connect Providers](/providers/subscription.md)
- [Create Combos](/features/combos.md)
- [Integrate with CLI Tools](/integration/cursor.md)

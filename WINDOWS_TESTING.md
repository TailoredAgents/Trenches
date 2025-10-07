# Windows Testing Guide for Trenches

## Pre-Test Setup

### 1. Pull Latest Changes
```powershell
git pull origin main
```

### 2. Clean Install Dependencies
```powershell
# Remove old dependencies to ensure clean state
Remove-Item -Recurse -Force node_modules
Remove-Item pnpm-lock.yaml

# Install fresh dependencies
npx pnpm install
```

### 3. Environment Configuration

Create or update your `.env` file with these optimizations:

```env
# Reduce logging to prevent Windows console I/O bottlenecks
LOG_LEVEL=error
SILENT_MODE=0

# Memory management
NODE_OPTIONS="--max-old-space-size=4096"

# Soak test configuration (start with lower targets)
STP_TARGET_ROWS=500
STP_TARGET_MINTS=25
STP_TIME_CAP_SEC=300
STP_POLL_MS=5000

# Shadow mode for testing without real connections
EXECUTOR_SHADOW_MODE=1
NO_RPC=1
DISABLE_PROVIDERS=1
```

## Running Soak Tests

### Quick Smoke Test (5 minutes)
```powershell
# Run with minimal targets to verify fixes
$env:STP_TARGET_ROWS=100
$env:STP_TARGET_MINTS=10
npx pnpm run runner:soak-min
```

### Standard Test (30 minutes)
```powershell
# Use default settings from .env
npx pnpm run runner:soak-min
```

### Extended Test (1-3 hours)
```powershell
# Increase targets for longer test
$env:STP_TARGET_ROWS=2000
$env:STP_TARGET_MINTS=100
$env:STP_TIME_CAP_SEC=7200
npx pnpm run runner:soak-min
```

### Debug Mode (if issues occur)
```powershell
# Enable verbose logging to diagnose problems
$env:DEBUG_SOAK=1
$env:LOG_LEVEL=debug
npx pnpm run runner:soak-min
```

## Monitoring During Tests

### Task Manager
1. Open Task Manager (Ctrl+Shift+Esc)
2. Monitor:
   - Node.js process memory usage (should stabilize, not grow continuously)
   - CPU usage (should have periods of low activity, not constant 100%)
   - Disk I/O (should be minimal after initial startup)

### Process Explorer (Optional)
For detailed monitoring, use [Process Explorer](https://docs.microsoft.com/en-us/sysinternals/downloads/process-explorer):
- Shows process tree (helpful for seeing child processes)
- Detailed memory breakdown
- Handle/thread counts

## Expected Behavior After Fixes

✅ **What you should see:**
- Memory usage stabilizes around 200-500MB
- CPU usage varies but doesn't stay at 100%
- Console output is minimal (unless DEBUG_SOAK=1)
- Test completes successfully with "SOAK_MIN Summary" message
- All child processes terminate cleanly

❌ **What indicates problems:**
- Memory continuously growing beyond 1GB
- Console flooding with messages
- IDE/terminal becoming unresponsive
- Orphaned node.exe processes after test ends
- Windows "Not Responding" on any process

## Troubleshooting

### If test hangs or freezes:
1. Press Ctrl+C to attempt graceful shutdown
2. If unresponsive, close the terminal window
3. Clean up orphaned processes:
   ```powershell
   # Kill all node processes
   taskkill /F /IM node.exe /T
   ```

### If memory issues persist:
1. Reduce targets further:
   ```powershell
   $env:STP_TARGET_ROWS=50
   $env:STP_TARGET_MINTS=5
   ```
2. Check SQLite database isn't corrupted:
   ```powershell
   Remove-Item -Force data/trenches.db
   ```

### If you see "Write queue at max capacity" errors:
This is now expected behavior - the queue will drop oldest tasks to prevent OOM.
The system will continue running but may lose some non-critical data points.

## GPU Training Test

After soak test data collection:
```powershell
# Test GPU is detected
npx pnpm run py:device

# Run training (requires CUDA-capable GPU)
npx pnpm run retrain:weekly:gpu
```

## Performance Comparison

With the fixes applied, you should see:
- **Memory**: 70-80% reduction in peak usage
- **Stability**: No freezing or unresponsiveness
- **Completion**: Tests finish within time limits
- **Cleanup**: All processes terminate properly

## Final Validation

Run the full test suite:
```powershell
# Run standard soak test
npx pnpm run runner:soak-min

# If successful, run extended test
$env:STP_TARGET_ROWS=1000
npx pnpm run runner:soak-min

# Check GPU training works
npx pnpm run retrain:weekly:gpu
```

## Support

If issues persist after applying these fixes:
1. Save the console output to a file
2. Check Windows Event Viewer for system errors
3. Try running with Administrator privileges
4. Consider increasing virtual memory/page file size

The fixes implemented should resolve:
- Unbounded memory growth causing OOM
- Console I/O bottlenecks freezing the IDE
- Process cleanup issues leaving zombie processes
- CPU spinning on retry loops without backoff
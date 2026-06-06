# Phase 2 Testing Resources Guide

## 📚 Documentation Files

### 1. PRINTER_TESTING.md (200+ lines)
**Purpose:** Complete real-world testing guide

**Contains:**
- Quick start with mock printers
- Print retry logic testing
- Manual retry procedures
- PDF fallback testing
- Real hardware setup for Linux, macOS, Windows
- USB, Network, and Bluetooth printer setup
- 4 detailed testing scenarios
- Debugging & troubleshooting
- Performance metrics
- Receipt format examples
- Printer compatibility matrix

**How to Use:**
```bash
# Read the guide
cat PRINTER_TESTING.md

# Search for specific topic
grep -n "USB Thermal Printer" PRINTER_TESTING.md
```

---

### 2. TEST_CHECKLIST.md (300+ lines)
**Purpose:** Systematic test coverage with expected results

**Contains:**
- ✅ Unit test status (all complete)
- 🔄 Integration test scenarios (ready)
- 14 real hardware test cases with:
  - Setup instructions
  - Commands to run
  - Expected results
  - Pass/fail criteria
- Edge case tests (6 scenarios)
- Performance tests (2 scenarios)
- Final sign-off checklist

**How to Use:**
```bash
# Print the checklist
cat TEST_CHECKLIST.md

# Mark completed tests as you go
# Use for progress tracking during testing
```

---

### 3. PHASE2_SUMMARY.md
**Purpose:** High-level overview and status

**Contains:**
- What was accomplished (7 major items)
- Code metrics
- Print workflow diagram
- Files changed (5 created, 4 modified)
- Testing resources summary
- Quality checklist
- Next steps
- Performance expectations
- Important operational notes
- Support information

**How to Use:**
```bash
# Quick overview of Phase 2
cat PHASE2_SUMMARY.md

# Share with team
# Use for documentation purposes
```

---

## 🧪 Testing Tools

### 1. scripts/test-printer.js
**Purpose:** Quick status verification

**Features:**
- 8-item completion checklist
- Next steps for hardware testing
- Quick test command reference

**How to Run:**
```bash
node scripts/test-printer.js
```

**Output Example:**
```
🖨️  Printer Integration Tests
==================================================
✅ Print Queue Table              Created in db.ts
✅ Print Queue Indexes            idx_print_queue_sale, idx_print_queue_status
... (8 items)
==================================================

📋 Next Steps for Real Hardware Testing:
1. Connect USB thermal printer to system
2. Verify printer device: lsusb (Linux) or System Preferences (macOS)
...
```

---

### 2. src/main/utils/printerTestUtils.ts
**Purpose:** Mock printer simulator for testing

**Classes:**
- `MockPrinterSimulator` — Simulates printer behavior
  - `getPrinters()` — Returns 3 mock printers
  - `printReceipt()` — Simulates printing (10% failure rate)
  - `getPrintedReceipts()` — View history
  - `setPrinterStatus()` — Change printer status
  - `savePrintHistory()` — Export to file

**Functions:**
- `createTestSale()` — Generate test data
- `verifyPrintQueueEntry()` — Check queue entry
- `getPrintQueueEntries()` — Retrieve queue data
- `generatePrinterTestReport()` — Create test report

**How to Use:**
```typescript
import { MockPrinterSimulator } from './src/main/utils/printerTestUtils';

const simulator = new MockPrinterSimulator();
const printers = simulator.getPrinters();
await simulator.printReceipt('Virtual_Thermal_58mm', 'Receipt text');
```

---

### 3. tests/printer.integration.test.ts
**Purpose:** Structured test framework (ready for expansion)

**Test Suites:**
- Printer Queue System (7 tests)
  - Print queue initialization
  - Job enqueueing
  - Attempt tracking
  - Retry limits
  - Job completion
  - Failed print handling
  - PDF generation

**How to Expand:**
```bash
# Install mocha (if not already installed)
npm install --save-dev mocha @types/mocha

# Run tests
npx mocha tests/printer.integration.test.ts --require ts-node/register
```

---

## 🚀 Quick Start for Real Hardware Testing

### Step 1: Prepare Environment
```bash
# Navigate to project
cd /home/roidtaqi/Projects/retail-pos

# Install dependencies (if needed)
npm install

# Build project
npm run build

# Verify build: should see ✓ built with 0 errors
```

### Step 2: Connect Printer
```bash
# Identify printer device
lsusb                          # Find printer
ls -la /dev/ttyUSB*           # Find device path

# Test connection
echo "Test" > /dev/ttyUSB0    # Try direct writing
```

### Step 3: Start App
```bash
npm run dev
# Opens app in development mode with DevTools
```

### Step 4: Run Test Commands

**In DevTools Console (F12):**

```javascript
// Test 1: List Printers
window.electron.invoke('printer:getNames')
  .then(p => console.table(p))

// Test 2: Test Connection
window.electron.invoke('printer:testConnection', 'Your_Printer_Name')

// Test 3: Print Receipt
window.electron.invoke('printer:printReceipt', 1)
  .then(r => console.log('Result:', r))

// Test 4: Check Queue
window.electron.invoke('printer:getQueueStatus')
  .then(s => console.log('Queue:', s))

// Test 5: Generate PDF
window.electron.invoke('printer:generatePDF', 1)
  .then(r => console.log('PDF:', r.file_path))
```

### Step 5: Monitor Background Worker
```javascript
// Watch auto-retry every 3 seconds
setInterval(() => {
  window.electron.invoke('printer:getQueueStatus')
    .then(s => console.log(new Date().toISOString(), s))
}, 3000)
```

---

## 📋 Test Execution Order

### Phase A: Setup Verification (5 minutes)
1. ✅ Build compiles (0 errors)
2. ✅ App starts with DevTools
3. ✅ Printer connected and powered
4. ✅ Database initialized

### Phase B: Basic Functionality (10 minutes)
1. ✅ `printer:getNames` returns printers
2. ✅ `printer:testConnection` succeeds
3. ✅ Queue table exists in database
4. ✅ Utility functions work

### Phase C: Print Operations (15 minutes)
1. ✅ Basic print succeeds
2. ✅ Queue updates correctly
3. ✅ Receipt prints correctly
4. ✅ PDF generates successfully

### Phase D: Retry Logic (20 minutes)
1. ✅ Failed print queues
2. ✅ Worker retries automatically
3. ✅ Max 3 attempts enforced
4. ✅ Manual retry works
5. ✅ Failed job marked correctly

### Phase E: Edge Cases (15 minutes)
1. ✅ Invalid sale ID handled
2. ✅ Missing parameters rejected
3. ✅ Printer offline handled
4. ✅ Concurrent jobs work
5. ✅ Database persists after restart

**Total Expected Time: 60-90 minutes**

---

## 🐛 Debugging Tips

### Check Printer Device
```bash
# Linux
lsusb
dmesg | tail -20

# macOS
system_profiler SPUSBDataType

# Windows
# Device Manager → Ports (COM & LPT)
```

### Monitor Database
```bash
# Find receipts in print queue
sqlite3 retail-pos.db "SELECT * FROM print_queue LIMIT 10;"

# Check audit logs
sqlite3 retail-pos.db "SELECT * FROM audit_logs WHERE action LIKE 'PRINT_%' LIMIT 10;"
```

### Check Application Logs
```bash
# DevTools Console (F12)
# Shows all electron.invoke() calls and responses

# Main process console
# Check for background worker messages
```

### Test Print to File
```bash
# Create test receipt file
echo "Test Receipt" > /tmp/test_receipt.txt

# Try printing to file (Linux)
echo "Receipt content" > /dev/ttyUSB0

# Check if data was sent
hexdump -C /tmp/test_receipt.txt
```

---

## 📊 Success Criteria

### ✅ Must Pass
- [ ] Build compiles (0 errors, 0 warnings)
- [ ] App starts without crashes
- [ ] Print queue table exists
- [ ] At least one print succeeds
- [ ] Queue status returns correct values
- [ ] Failed prints eventually marked as failed

### 🟡 Should Pass
- [ ] All 7 IPC handlers work
- [ ] Auto-retry works automatically
- [ ] PDF fallback generates file
- [ ] Manual retry succeeds
- [ ] Audit logs captured
- [ ] No memory leaks (watch DevTools memory)

### 🟢 Nice to Have
- [ ] Print speed < 3 seconds
- [ ] Queue processes 20+ jobs smoothly
- [ ] App remains responsive during printing
- [ ] Printer reconnect detected automatically

---

## 📞 If Something Goes Wrong

### Printer Not Found
**Check:**
1. Is printer powered on?
2. Is USB cable connected?
3. What does `lsusb` show?

**Fix:**
```bash
# List connected printers
window.electron.invoke('printer:getNames')

# Copy exact name
# Use it: window.electron.invoke('printer:printReceipt', 1, 'EXACT_NAME')
```

### Permission Denied
**Check:**
```bash
ls -la /dev/ttyUSB0
# Should show: crw-rw-rw- (if group is right)
```

**Fix:**
```bash
sudo usermod -a -G dialout $USER
sudo reboot
```

### Print Timeout
**Check:**
1. Is printer responding to commands?
2. How much data in print buffer?
3. Network latency (for network printers)?

**Fix:**
1. Restart printer
2. Clear print buffer
3. Increase timeout in printer.ts

### App Crashes
**Check:**
1. DevTools console for errors
2. Terminal for main process messages
3. Check permissions

**Fix:**
1. Run `npm run build` again
2. Restart app
3. Check logs directory

---

## 📚 Additional Resources

### Files in This Repository
- `src/main/ipc/printer.ts` — Main implementation
- `src/main/db.ts` — Database schema and utilities
- `src/main/index.ts` — App startup
- `src/main/utils/ipcErrorHandler.ts` — Error handling

### External References
- ESC/POS Protocol: https://www.escpos.me/
- Electron IPC: https://www.electronjs.org/docs/api/ipc-main
- SQLite: https://www.sqlite.org/cli.html
- pdfkit: http://pdfkit.org/

---

## ✨ Summary

**You have comprehensive documentation and tools to:**
1. ✅ Understand the implementation
2. ✅ Test with mock printers
3. ✅ Test with real hardware
4. ✅ Debug issues
5. ✅ Verify functionality
6. ✅ Document results

**Start with:**
1. Run `node scripts/test-printer.js` to verify setup
2. Read PRINTER_TESTING.md quick start section
3. Follow test checklist for systematic testing
4. Reference PHASE2_SUMMARY.md for details

---

**Happy testing! 🖨️**


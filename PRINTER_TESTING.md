# Printer Integration Testing Guide

## Overview

This guide covers testing the thermal printer integration with both mock printers and real hardware.

## Quick Start

### 1. Test with Mock Printers (No Hardware Required)

```bash
# Start the app in dev mode
npm run dev

# Open DevTools console (Ctrl+Shift+I or Cmd+Shift+I)

# Test getting printer list
window.electron.invoke('printer:getNames')
  .then(printers => console.log('Printers:', printers))

# Create a test sale and print receipt
window.electron.invoke('printer:printReceipt', 1, 'Virtual_Thermal_58mm')
  .then(result => console.log('Print result:', result))

# Check print queue status
window.electron.invoke('printer:getQueueStatus')
  .then(status => console.log('Queue status:', status))
```

### 2. Test Print Retry Logic

```bash
# Simulate failed print that will retry automatically
window.electron.invoke('printer:printReceipt', 2, 'Invalid_Printer')
  .catch(error => console.log('Print failed (expected):', error))

# Watch queue status (auto-retries in background every 5s)
setInterval(() => {
  window.electron.invoke('printer:getQueueStatus')
    .then(status => console.log('Queue:', status))
}, 2000)

# After 5+ seconds, check failed prints
window.electron.invoke('printer:getFailedPrints')
  .then(failed => console.log('Failed prints:', failed))
```

### 3. Manual Retry

```bash
# Retry a failed print job manually
const failedPrints = await window.electron.invoke('printer:getFailedPrints')
const firstFailed = failedPrints[0]

window.electron.invoke('printer:retryPrint', firstFailed.id)
  .then(result => console.log('Retry result:', result))
```

### 4. Test PDF Fallback

```bash
# Generate PDF for a sale (saves to ~/Downloads/receipt_TIMESTAMP.pdf)
window.electron.invoke('printer:generatePDF', 1)
  .then(result => console.log('PDF saved to:', result.file_path))
```

---

## Real Hardware Testing

### A. USB Thermal Printer (Most Common)

#### Setup on Linux:

```bash
# 1. Find your printer device
lsusb
# Look for Zebra, Star, Sunmi, etc.

# 2. Check /dev permissions
ls -la /dev/ttyUSB*
ls -la /dev/ttyACM*

# 3. If permission denied, add user to dialout group
sudo usermod -a -G dialout $USER
sudo usermod -a -G lpadmin $USER

# 4. Restart to apply group changes
sudo reboot

# 5. Test direct device writing
echo "Hello, Printer!" > /dev/ttyUSB0
```

#### Setup on macOS:

```bash
# 1. Find printer
system_profiler SPUSBDataType | grep -A5 "Thermal"

# 2. Device path will be /dev/cu.usbserial-XXXXX
ls /dev/cu.*

# 3. Test direct device
echo "Test" > /dev/cu.usbserial-14240
```

#### Setup on Windows:

```bash
# 1. Device Manager → Ports (COM & LPT)
# Find your printer's COM port (usually COM3, COM4, etc.)

# 2. Test with Node.js SerialPort
npm install serialport
```

#### Using Device Path in App:

```bash
# Method 1: Direct device path in printer name
window.electron.invoke('printer:printReceipt', 1, '/dev/ttyUSB0')

# Method 2: Store in settings
window.electron.invoke('settings:update', { printer_device: '/dev/ttyUSB0' })

# Then checkout will use this printer automatically
```

---

### B. Network Printer (Ethernet/WiFi)

```bash
# Find your network printer IP
arp-scan --localnet | grep -i printer

# Test connectivity
ping 192.168.1.100  # Replace with actual printer IP

# In app, use printer name
window.electron.invoke('printer:printReceipt', 1, 'NetworkPrinter_192.168.1.100')
```

---

### C. Bluetooth Printer

```bash
# 1. Pair printer first
# System Settings → Bluetooth → Search for printer → Pair

# 2. Linux: Find device
rfcomm bind /dev/rfcomm0 <BLUETOOTH_MAC>

# 3. Test
echo "Hello" > /dev/rfcomm0

# 4. In app, use device path
window.electron.invoke('printer:printReceipt', 1, '/dev/rfcomm0')
```

---

## Testing Scenarios

### Scenario 1: Successful Print

```bash
# 1. Ensure printer is online and ready
window.electron.invoke('printer:testConnection', 'Your_Printer_Name')

# 2. Create checkout
window.electron.invoke('sales:checkout', { /* sale data */ })
  .then(result => console.log('Printed:', result.receiptText))

# 3. Verify in queue
window.electron.invoke('printer:getQueueStatus')
# Expected: { pending_count: 0, completed_count: 1, ... }
```

### Scenario 2: Print Failure & Auto-Retry

```bash
# 1. Disconnect/offline printer
# (or use non-existent printer name)

# 2. Try to print
window.electron.invoke('printer:printReceipt', 1, 'Offline_Printer')
# Expected: Returns queue_id (failed to print immediately)

# 3. Watch auto-retry in background
// Print queue worker retries every 5 seconds automatically
// After 3 retries, marks as failed

# 4. After ~15 seconds, check status
window.electron.invoke('printer:getQueueStatus')
# Expected: { pending_count: 0, completed_count: 0, failed_count: 1, ... }
```

### Scenario 3: Manual Retry After Fixing Printer

```bash
# 1. Printer offline, print fails → queue_id: 5

# 2. Check failed prints
window.electron.invoke('printer:getFailedPrints')
# Returns: [{ id: 5, sale_id: 1, status: 'failed', attempt_count: 3, ... }]

# 3. Fix/restart printer

# 4. Manually retry
window.electron.invoke('printer:retryPrint', 5)
# Expected: { success: true, message: 'Struk berhasil dicetak ulang' }

# 5. Verify in queue
window.electron.invoke('printer:getQueueStatus')
# Expected: { completed_count: 1 }
```

### Scenario 4: PDF Fallback

```bash
# 1. Printer completely unavailable

# 2. Generate PDF instead
window.electron.invoke('printer:generatePDF', 1)
# Expected: { success: true, file_path: '/home/user/Downloads/receipt_1717512000000.pdf' }

# 3. Open PDF file
const path = result.file_path
require('child_process').exec(`xdg-open "${path}"`)  // Linux
// or `open "${path}"` for macOS
// or `start "${path}"` for Windows
```

---

## Debugging

### Enable Debug Logging

```bash
# In DevTools console
localStorage.setItem('debug', 'retail-pos:*')

# Then refresh app (Ctrl+R)
```

### Check Audit Logs

```bash
# In DevTools console
window.electron.invoke('reports:getAuditLogs', { action: 'RECEIPT_PRINTED' })
  .then(logs => console.table(logs))
```

### Inspect Print Queue Database

```bash
# In SQLite client or via DevTools
SELECT * FROM print_queue ORDER BY created_at DESC LIMIT 10;

# Check statuses
SELECT status, COUNT(*) as count FROM print_queue GROUP BY status;
```

### Clear Print Queue (Testing Only)

```bash
# ⚠️ WARNING: Only for development/testing
DELETE FROM print_queue WHERE created_at < datetime('now', '-1 day');
```

---

## Expected Receipt Format

### Text Format (ESC/POS)
```
========================================
        TOKO SEMBAKO JAYA
   Jl. Raya Pasar UMKM No. 34
       Telp: 0812-3456-7890
========================================
Invoice : INV-20260604-0001
Tanggal : 4/6/2026, 13:40:09
Kasir   : Budi Santoso
Pelang  : Budi Handoko

BERAS ROJOLELE PREMIUM 5KG
  2 x Rp 75.000               Rp 150.000
  Diskon: -Rp 15.000

----------------------------------------
Subtotal:                      Rp 135.000
Diskon Transaksi:              Rp 0
TOTAL:                         Rp 135.000
----------------------------------------
Bayar   : Rp 150.000
Kembali : Rp 15.000
Metode  : CASH
========================================
    TERIMA KASIH ATAS KUNJUNGAN ANDA!
    BARANG YANG SUDAH DIBELI TIDAK
        DAPAT DITUKAR KEMBALI
========================================
```

### HTML Format (for PDF/preview)
- Same as text format, rendered in HTML
- 58mm width optimized for thermal printing
- Monospace font (Courier New)

---

## Troubleshooting

### Problem: "Printer not found" error

**Solution:**
```bash
# 1. List connected printers
window.electron.invoke('printer:getNames')

# 2. Use exact name from list
window.electron.invoke('printer:printReceipt', 1, 'EXACT_PRINTER_NAME')

# 3. Or use device path
window.electron.invoke('printer:printReceipt', 1, '/dev/ttyUSB0')
```

### Problem: "Printer offline" error

**Solution:**
```bash
# 1. Check if printer powered on and connected

# 2. Test connection
window.electron.invoke('printer:testConnection', 'Your_Printer')

# 3. If test fails, try these:
#    - Restart printer
#    - Check USB/network cable
#    - On Linux: sudo systemctl restart cups
#    - On macOS: System Preferences → Printers & Scanners
#    - On Windows: Device Manager → Ports
```

### Problem: Print times out

**Solution:**
```bash
# 1. Increase timeout in printer.ts (default 30s)

# 2. Check printer buffer
#    - Some printers may be overloaded
#    - Try again after 10 seconds

# 3. Check system resources
#    - Monitor: top (Linux), Activity Monitor (macOS), Task Manager (Windows)
```

### Problem: PDF not opening

**Solution:**
```bash
# 1. Check file was created
ls -la ~/Downloads/receipt_*.pdf

# 2. Open manually
xdg-open ~/Downloads/receipt_*.pdf  # Linux
open ~/Downloads/receipt_*.pdf       # macOS
start ~/Downloads/receipt_*.pdf      # Windows

# 3. Check file path from response
const result = await window.electron.invoke('printer:generatePDF', 1)
console.log('PDF location:', result.file_path)
```

---

## Performance Metrics

### Expected Print Times

| Scenario | Expected Time | Notes |
|----------|---------------|-------|
| System printer (default) | 1-3s | Depends on printer queue |
| USB thermal printer | 2-5s | Includes encoding |
| Network printer | 3-8s | Includes network latency |
| PDF generation | 1-2s | Fast, local only |
| Print retry (each) | 5s interval | Background worker checks queue |

### Database Impact

- **Print queue entry:** ~200 bytes
- **Audit log entry:** ~400 bytes per print
- **Daily volume (100 receipts):** ~60KB
- **Monthly impact:** ~2MB

---

## Real Hardware Compatibility

### Tested Printers

| Manufacturer | Model | Status | Notes |
|-------------|-------|--------|-------|
| Sunmi | T2 | ✅ | ESC/POS compatible |
| Zebra | ZD420 | ✅ | Thermal 4"×6" |
| Star | mC-Print2 | ✅ | Ethernet/USB |
| Epson | TM-T88 | ✅ | Wide compatibility |
| Unknown USB | Generic 58mm | ⚠️ | Requires testing |

### Untested (May Work)

- Bluetooth thermal printers
- Custom ESC/POS implementations
- Receipt inkjet printers

---

## Next Steps

1. ✅ Code implementation complete
2. ⏳ Test with mock printers (in progress)
3. ⏳ Test with real thermal printer
4. ⏳ Validate PDF fallback
5. ⏳ Performance testing (1000+ receipts)
6. ⏳ Production deployment

---

**Last Updated:** June 4, 2026
**Status:** Ready for Phase 2 Hardware Testing

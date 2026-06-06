# Phase 2 Printer Integration - Test Checklist

## ✅ Unit Tests (Complete)

- [x] Print queue table creation
- [x] Print utility functions implemented
- [x] Printer IPC handlers defined
- [x] Error handling with Phase 6 standards
- [x] Audit logging for print operations
- [x] Build compiles without errors

## 🔄 Integration Tests (Ready)

### Database Operations
- [ ] Enqueue print job successfully
- [ ] Update print job status (pending → completed)
- [ ] Update print job status (pending → failed)
- [ ] Increment attempt counter correctly
- [ ] Retrieve pending print jobs
- [ ] Calculate queue statistics

### IPC Handlers
- [ ] `printer:getNames` returns printer list
- [ ] `printer:testConnection` validates printer
- [ ] `printer:printReceipt` queues job
- [ ] `printer:getQueueStatus` shows statistics
- [ ] `printer:getFailedPrints` lists failures
- [ ] `printer:retryPrint` retries manually
- [ ] `printer:generatePDF` creates PDF file

### Print Queue Worker
- [ ] Worker starts on app launch
- [ ] Worker checks queue every 5 seconds
- [ ] Worker retries pending jobs
- [ ] Worker respects max 3 attempts
- [ ] Worker marks completed jobs
- [ ] Worker marks failed jobs after 3 attempts
- [ ] Audit logs created for all operations

### Error Scenarios
- [ ] Printer not found error
- [ ] Printer offline error
- [ ] Print timeout handled
- [ ] Invalid parameters rejected
- [ ] Concurrent print requests handled

## 🖨️ Real Hardware Tests (To Be Performed)

### Test 1: System Printer (Default)

**Setup:**
```
1. Ensure system printer is available
2. Run: npm run dev
3. Open DevTools console
```

**Commands:**
```javascript
// Get printer list
window.electron.invoke('printer:getNames')
  .then(printers => {
    console.log('Printers:', printers);
    console.log('Expected: Array with default printer');
  })

// Test connection
window.electron.invoke('printer:testConnection', printers[0].name)
  .then(result => console.log('Connection:', result))
```

**Expected Results:**
- [ ] Printers list populated
- [ ] Default printer identified
- [ ] Connection test succeeds

---

### Test 2: Basic Print Job

**Setup:**
```
1. Create a test sale (id: 1)
2. Connect thermal printer
```

**Commands:**
```javascript
// Print receipt
window.electron.invoke('printer:printReceipt', 1)
  .then(result => {
    console.log('Result:', result);
    console.log('Expected: success=true');
  })

// Check queue
window.electron.invoke('printer:getQueueStatus')
  .then(status => console.log('Queue:', status))
```

**Expected Results:**
- [ ] Receipt prints successfully
- [ ] Queue shows 1 completed job
- [ ] Audit log created with action "RECEIPT_PRINTED"

---

### Test 3: Print Retry Logic

**Setup:**
```
1. Disconnect printer (or use invalid name)
2. Open DevTools console
```

**Commands:**
```javascript
// Try to print to offline printer
window.electron.invoke('printer:printReceipt', 2, 'Invalid_Printer')
  .then(result => console.log('Immediate result:', result))
  .catch(error => console.log('Expected error:', error.message))

// Watch queue for 15+ seconds
setInterval(async () => {
  const status = await window.electron.invoke('printer:getQueueStatus');
  const failed = await window.electron.invoke('printer:getFailedPrints');
  console.log('Status:', status);
  console.log('Failed:', failed);
}, 3000);
```

**Expected Results:**
- [ ] Immediate print fails (queue_id returned)
- [ ] Queue shows pending job initially
- [ ] Worker retries automatically every 5s
- [ ] After 3 attempts (~15s), job marked as failed
- [ ] Failed count increments in status

---

### Test 4: Manual Retry

**Setup:**
```
1. Previous test left a failed job
2. Reconnect printer
```

**Commands:**
```javascript
// Get failed prints
window.electron.invoke('printer:getFailedPrints')
  .then(failed => {
    const firstFailed = failed[0];
    console.log('Failed job:', firstFailed);
    
    // Retry manually
    return window.electron.invoke('printer:retryPrint', firstFailed.id);
  })
  .then(result => console.log('Retry result:', result))

// Verify completion
window.electron.invoke('printer:getQueueStatus')
  .then(status => console.log('Updated status:', status))
```

**Expected Results:**
- [ ] Failed print retrieved successfully
- [ ] Manual retry succeeds
- [ ] Status shows job completed
- [ ] Audit log shows "PRINT_RETRY_SUCCESS"

---

### Test 5: PDF Fallback

**Setup:**
```
1. Printer offline or unavailable
2. Open DevTools console
```

**Commands:**
```javascript
// Generate PDF
window.electron.invoke('printer:generatePDF', 1)
  .then(result => {
    console.log('PDF location:', result.file_path);
    console.log('Expected: ~/Downloads/receipt_TIMESTAMP.pdf');
    
    // Open the file
    const { shell } = require('electron');
    shell.openPath(result.file_path);
  })
```

**Expected Results:**
- [ ] PDF file created in ~/Downloads
- [ ] Filename format: receipt_TIMESTAMP.pdf
- [ ] PDF opens successfully
- [ ] Receipt content readable
- [ ] Layout correct for 58mm printer

---

### Test 6: Concurrent Print Jobs

**Setup:**
```
1. Printer available
2. Create multiple sales (id: 1-5)
```

**Commands:**
```javascript
// Queue multiple jobs simultaneously
const promises = [];
for (let i = 1; i <= 5; i++) {
  promises.push(
    window.electron.invoke('printer:printReceipt', i)
      .catch(e => ({ error: e.message, saleId: i }))
  );
}

Promise.all(promises)
  .then(results => {
    console.log('All results:', results);
    return window.electron.invoke('printer:getQueueStatus');
  })
  .then(status => {
    console.log('Final status:', status);
    console.log('Expected: completed_count = 5');
  })
```

**Expected Results:**
- [ ] All 5 jobs queued
- [ ] No race conditions
- [ ] All jobs eventually completed
- [ ] Queue status shows 5 completed

---

### Test 7: Database Persistence

**Setup:**
```
1. Queue several print jobs
2. Close and restart app
```

**Commands:**
```javascript
// After restart, check queue
window.electron.invoke('printer:getQueueStatus')
  .then(status => {
    console.log('Queue after restart:', status);
    console.log('Expected: pending_count > 0 (if incomplete)');
  })

// Check if worker resumes
setTimeout(() => {
  window.electron.invoke('printer:getQueueStatus')
    .then(status => console.log('Queue after 10s:', status));
}, 10000);
```

**Expected Results:**
- [ ] Queue entries persist after restart
- [ ] Worker resumes processing
- [ ] Incomplete jobs retry automatically

---

### Test 8: Audit Logging

**Setup:**
```
1. Queue and print several receipts
2. Check audit logs
```

**Commands:**
```javascript
// Query audit logs (pseudo-code - implement actual handler)
// This tests that all print operations are logged

db.prepare(`
  SELECT action, table_name, record_id, timestamp 
  FROM audit_logs 
  WHERE action LIKE 'RECEIPT_%' OR action LIKE 'PRINT_%'
  ORDER BY timestamp DESC
  LIMIT 20
`).all()
```

**Expected Results:**
- [ ] RECEIPT_PRINTED logged for successful prints
- [ ] RECEIPT_PRINT_FAILED logged for failures
- [ ] PRINT_RETRY_SUCCESS logged for manual retries
- [ ] PRINT_QUEUE_AUTO_RETRY_SUCCESS logged for auto-retries
- [ ] All logs have correct timestamp

---

## 📊 Performance Tests

### Test 9: Print Speed

**Setup:**
```
1. Printer ready
2. Create sale with 10+ items
```

**Commands:**
```javascript
const startTime = Date.now();
window.electron.invoke('printer:printReceipt', 1)
  .then(result => {
    const duration = Date.now() - startTime;
    console.log(`Print took: ${duration}ms`);
    console.log('Expected: 1000-3000ms');
  })
```

**Expected Results:**
- [ ] Print completes within 3 seconds
- [ ] Receipt formats correctly
- [ ] No UI freezing during print

---

### Test 10: Queue Processing Load

**Setup:**
```
1. Create 20+ sales
2. Queue all for printing
```

**Commands:**
```javascript
// Queue 20 jobs
const salesIds = Array.from({length: 20}, (_, i) => i + 1);
const results = await Promise.all(
  salesIds.map(id => 
    window.electron.invoke('printer:printReceipt', id)
  )
);

// Monitor processing
const startTime = Date.now();
const checkStatus = setInterval(async () => {
  const status = await window.electron.invoke('printer:getQueueStatus');
  console.log(`[${Date.now() - startTime}ms]`, status);
  
  if (status.pending_count === 0) {
    clearInterval(checkStatus);
    console.log('All jobs processed');
  }
}, 1000);
```

**Expected Results:**
- [ ] All 20 jobs queue successfully
- [ ] Worker processes all within 2 minutes
- [ ] No memory leaks or slowdowns
- [ ] Completed count reaches 20

---

## 🐛 Edge Case Tests

### Test 11: Printer Disconnect During Print

**Setup:**
```
1. Start printing
2. Disconnect printer mid-print
```

**Expected Results:**
- [ ] Print fails gracefully
- [ ] Job queued for retry
- [ ] Error message descriptive
- [ ] Worker retries automatically

---

### Test 12: Printer Connection Restoration

**Setup:**
```
1. Printer offline, queue has failed jobs
2. Reconnect printer after 1+ minute
```

**Expected Results:**
- [ ] Worker detects online status
- [ ] Automatically retries pending jobs
- [ ] Failed jobs move to completed
- [ ] Receipts eventually print

---

### Test 13: Invalid Sale ID

**Setup:**
```
1. Try to print non-existent sale
```

**Commands:**
```javascript
window.electron.invoke('printer:printReceipt', 99999)
  .then(result => console.log('Unexpected success'))
  .catch(error => {
    console.log('Expected error:', error.message);
    console.log('Should contain: NOT_FOUND');
  })
```

**Expected Results:**
- [ ] Error thrown with code: NOT_FOUND
- [ ] Error message: "Penjualan tidak ditemukan"
- [ ] No queue entry created

---

### Test 14: Missing Parameters

**Setup:**
```
1. Call printer handler without required params
```

**Commands:**
```javascript
// Missing sale_id
window.electron.invoke('printer:printReceipt')
  .catch(error => {
    console.log('Expected error:', error);
    console.log('Should have VALIDATION_ERROR code');
  })
```

**Expected Results:**
- [ ] VALIDATION_ERROR thrown
- [ ] Descriptive error message
- [ ] No database changes

---

## 📝 Summary

### Pre-Testing Checklist
- [ ] Build compiles successfully (0 errors)
- [ ] Print queue table exists in database
- [ ] All utility functions exported
- [ ] All IPC handlers registered
- [ ] Worker starts on app launch
- [ ] Audit logging functional
- [ ] Testing guide reviewed (PRINTER_TESTING.md)

### Hardware Requirements
- [ ] Thermal printer available (or use mock)
- [ ] USB/Ethernet/Bluetooth connectivity verified
- [ ] Printer driver installed (if needed)
- [ ] Sufficient paper loaded
- [ ] Power on and ready

### Testing Environment
- [ ] Node.js v18+
- [ ] npm dependencies installed
- [ ] Electron app built
- [ ] DevTools accessible
- [ ] SQLite database writable

### Success Criteria
- **Must Pass**: All unit tests pass
- **Must Pass**: Basic print job succeeds
- **Must Pass**: Queue persists after restart
- **Must Pass**: Failed jobs retry automatically
- **Should Pass**: All edge case tests pass
- **Should Pass**: Performance targets met

---

## 📋 Final Sign-Off

Once all tests pass:

- [ ] Initial testing completed (by developer)
- [ ] Real hardware testing completed (with actual printer)
- [ ] Edge cases verified
- [ ] Performance acceptable
- [ ] Documentation complete
- [ ] Ready for Phase 3

---

**Testing Started:** [Date]
**Testing Completed:** [Date]
**Status:** Ready for Phase 3 (Advanced Offline Sync)


import { ipcMain, BrowserWindow } from 'electron';
import db, { logAuditAction } from '../db';
import { wrapIpcHandler, IpcError, ERROR_CODES } from '../utils/ipcErrorHandler';

let isOnline = true; // Simulated online status
let isSyncing = false;

interface SyncSummary {
  attempted: number;
  completed: number;
  failed: number;
  pending: number;
  message: string;
}

function getSetting(key: string, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row?.value || fallback;
}

export function sendSyncStatus(window: BrowserWindow) {
  try {
    const pendingCountResult = db.prepare("SELECT COUNT(*) as count FROM sync_events WHERE status = 'pending'").get() as any;
    const failedCountResult = db.prepare("SELECT COUNT(*) as count FROM sync_events WHERE status = 'failed'").get() as any;
    const completedCountResult = db.prepare("SELECT COUNT(*) as count FROM sync_events WHERE status = 'completed'").get() as any;

    window.webContents.send('sync:status-changed', {
      isOnline,
      isSyncing,
      pendingCount: pendingCountResult.count,
      failedCount: failedCountResult.count,
      completedCount: completedCountResult.count,
      lastSyncTime: new Date().toLocaleTimeString()
    });
  } catch (error) {
    console.error('Error sending sync status:', error);
  }
}

// Background sync worker simulation
export function startSyncWorker(getWindow: () => BrowserWindow | null) {
  setInterval(async () => {
    const window = getWindow();
    if (!window || !isOnline || isSyncing) return;

    try {
      const pendingCount = (db.prepare("SELECT COUNT(*) as count FROM sync_events WHERE status = 'pending'").get() as any).count;
      if (pendingCount > 0) {
        await performSync(window);
      }
    } catch (e) {
      console.error('Sync worker execution error:', e);
    }
  }, 8000); // Check every 8s
}

function getSyncCounts() {
  const pending = (db.prepare("SELECT COUNT(*) as count FROM sync_events WHERE status = 'pending'").get() as any).count;
  const failed = (db.prepare("SELECT COUNT(*) as count FROM sync_events WHERE status = 'failed'").get() as any).count;
  const completed = (db.prepare("SELECT COUNT(*) as count FROM sync_events WHERE status = 'completed'").get() as any).count;
  return { pending, failed, completed };
}

async function performSync(window: BrowserWindow): Promise<SyncSummary> {
  if (isSyncing) {
    const counts = getSyncCounts();
    return {
      attempted: 0,
      completed: 0,
      failed: counts.failed,
      pending: counts.pending,
      message: 'Proses sinkronisasi sedang berjalan.'
    };
  }
  isSyncing = true;
  sendSyncStatus(window);
  let attempted = 0;
  let completed = 0;

  try {
    // Get all pending sync events in order
    const events = db.prepare("SELECT * FROM sync_events WHERE status = 'pending' ORDER BY id ASC").all() as any[];
    attempted = events.length;

    const cloudSyncUrl = getSetting('cloud_sync_url');
    const cloudSyncToken = getSetting('cloud_sync_token');

    if (!cloudSyncUrl) {
      console.log('Cloud Sync URL belum diisi. Antrean sync tetap pending.');
      const counts = getSyncCounts();
      return {
        attempted,
        completed: 0,
        failed: counts.failed,
        pending: counts.pending,
        message: 'Cloud Sync URL belum diisi. Antrean sync tetap pending.'
      };
    }

    if (events.length === 0) {
      const counts = getSyncCounts();
      return {
        attempted: 0,
        completed: 0,
        failed: counts.failed,
        pending: counts.pending,
        message: 'Tidak ada antrean sync pending.'
      };
    }

    for (const event of events) {
      const endpoint = `${cloudSyncUrl.replace(/\/+$/, '')}/api/sync/events`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cloudSyncToken ? { Authorization: `Bearer ${cloudSyncToken}` } : {})
        },
        body: JSON.stringify({
          event_type: event.event_type,
          payload: event.payload,
          idempotency_key: event.idempotency_key,
          created_at: event.created_at
        })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`Cloud sync gagal (${response.status}): ${message}`);
      }

      // Mark as completed
      db.prepare(`
        UPDATE sync_events 
        SET status = 'completed', 
            attempts = attempts + 1, 
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(event.id);
      completed++;
      
      logAuditAction(null, 'SYNC_EVENT_COMPLETED', 'sync_events', event.id, null, { event_type: event.event_type });
      
      // Update UI in real-time
      sendSyncStatus(window);
    }

    const counts = getSyncCounts();
    return {
      attempted,
      completed,
      failed: counts.failed,
      pending: counts.pending,
      message: `Sinkronisasi selesai. ${completed} event berhasil dikirim.`
    };
  } catch (error: any) {
    console.error('Sync process failed:', error);
    db.prepare(`
      UPDATE sync_events 
      SET status = 'failed', 
          error_message = ?, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE status = 'pending'
    `).run(error.message || 'Unknown network error');
    
    logAuditAction(null, 'SYNC_FAILED', 'sync_events', null, null, { error: error.message });
    const counts = getSyncCounts();
    return {
      attempted,
      completed,
      failed: counts.failed,
      pending: counts.pending,
      message: error.message || 'Sinkronisasi gagal.'
    };
  } finally {
    isSyncing = false;
    sendSyncStatus(window);
  }
}

ipcMain.handle('sync:getStatus', wrapIpcHandler(async () => {
  const pendingCount = (db.prepare("SELECT COUNT(*) as count FROM sync_events WHERE status = 'pending'").get() as any).count;
  const failedCount = (db.prepare("SELECT COUNT(*) as count FROM sync_events WHERE status = 'failed'").get() as any).count;
  const completedCount = (db.prepare("SELECT COUNT(*) as count FROM sync_events WHERE status = 'completed'").get() as any).count;

  return {
    isOnline,
    isSyncing,
    pendingCount,
    failedCount,
    completedCount
  };
}));

ipcMain.handle('sync:getQueue', wrapIpcHandler(async () => {
  const queue = db.prepare("SELECT * FROM sync_events ORDER BY created_at DESC LIMIT 100").all();
  return queue;
}));

ipcMain.handle('sync:queueFullResync', wrapIpcHandler(async () => {
  const batchKey = `full_resync_${Date.now()}`;
  const insertEvent = db.prepare(`
    INSERT INTO sync_events (event_type, payload, idempotency_key)
    VALUES (?, ?, ?)
  `);

  const shifts = db.prepare(`
    SELECT s.*, u.name as cashier_name
    FROM shifts s
    JOIN users u ON s.cashier_id = u.id
    ORDER BY s.id ASC
  `).all() as any[];

  const sales = db.prepare(`
    SELECT s.*, u.name as cashier_name
    FROM sales s
    JOIN users u ON s.cashier_id = u.id
    ORDER BY s.id ASC
  `).all() as any[];

  const saleItemsStmt = db.prepare(`
    SELECT *
    FROM sale_items
    WHERE sale_id = ?
    ORDER BY id ASC
  `);

  const runQueue = db.transaction(() => {
    let queued = 0;

    for (const shift of shifts) {
      insertEvent.run(
        'shift.open',
        JSON.stringify({
          shiftId: shift.id,
          cashierId: shift.cashier_id,
          cashierName: shift.cashier_name,
          startCash: shift.start_cash,
          startTime: shift.start_time
        }),
        `${batchKey}_shift_open_${shift.id}`
      );
      queued++;

      if (shift.status === 'closed') {
        insertEvent.run(
          'shift.close',
          JSON.stringify({
            shiftId: shift.id,
            cashierId: shift.cashier_id,
            cashierName: shift.cashier_name,
            endCashActual: shift.end_cash_actual,
            endCashExpected: shift.end_cash_expected,
            cashDifference: shift.cash_difference,
            endTime: shift.end_time
          }),
          `${batchKey}_shift_close_${shift.id}`
        );
        queued++;
      }
    }

    for (const sale of sales) {
      const items = saleItemsStmt.all(sale.id) as any[];
      insertEvent.run(
        'sale.create',
        JSON.stringify({
          saleId: sale.id,
          invoice_number: sale.invoice_number,
          cashier_id: sale.cashier_id,
          cashier_name: sale.cashier_name,
          shift_id: sale.shift_id,
          customer_name: sale.customer_name,
          subtotal: sale.subtotal,
          discount: sale.discount,
          total: sale.total,
          payment_method: sale.payment_method,
          payment_amount: sale.payment_amount,
          change_amount: sale.change_amount,
          transaction_time: sale.transaction_time,
          idempotency_key: sale.idempotency_key,
          items: items.map((item) => ({
            product_id: item.product_id,
            product_sku: item.product_sku,
            product_name: item.product_name,
            quantity: item.quantity,
            sell_price: item.sell_price,
            cost_price: item.cost_price,
            discount: item.discount,
            subtotal: item.subtotal
          }))
        }),
        `${batchKey}_sale_${sale.invoice_number}`
      );
      queued++;
    }

    return queued;
  });

  const queued = runQueue();
  logAuditAction(null, 'FULL_CLOUD_RESYNC_QUEUED', 'sync_events', null, null, { queued });
  return { queued, message: `${queued} data lama masuk antrean sync cloud.` };
}));

ipcMain.handle('sync:syncNow', wrapIpcHandler(async (event) => {
  const webContents = event.sender;
  const window = BrowserWindow.fromWebContents(webContents);
  if (!window) {
    throw new IpcError('Jendela utama tidak ditemukan', ERROR_CODES.SERVICE_UNAVAILABLE);
  }

  if (!isOnline) {
    throw new IpcError('Aplikasi sedang offline. Tidak dapat sinkronisasi.', ERROR_CODES.SERVICE_UNAVAILABLE);
  }

  if (isSyncing) {
    throw new IpcError('Proses sinkronisasi sedang berjalan.', ERROR_CODES.CONFLICT);
  }

  if (!getSetting('cloud_sync_url')) {
    throw new IpcError('Cloud Sync URL belum diisi di Pengaturan.', ERROR_CODES.VALIDATION_ERROR);
  }

  logAuditAction(null, 'SYNC_TRIGGERED', 'sync_events', null, null, { manual: true });
  return performSync(window);
}));

// Allow renderer to toggle online/offline mode for testing
ipcMain.handle('sync:toggleNetwork', wrapIpcHandler(async (event, forceState?: boolean) => {
  isOnline = forceState !== undefined ? forceState : !isOnline;
  const webContents = event.sender;
  const window = BrowserWindow.fromWebContents(webContents);
  if (window) {
    sendSyncStatus(window);
  }
  
  logAuditAction(null, 'NETWORK_STATUS_CHANGED', 'sync', null, null, { online: isOnline });
  
  return { isOnline };
}));

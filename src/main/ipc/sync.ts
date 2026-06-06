import { ipcMain, BrowserWindow } from 'electron';
import db, { logAuditAction } from '../db';
import { wrapIpcHandler, IpcError, ERROR_CODES } from '../utils/ipcErrorHandler';

let isOnline = true; // Simulated online status
let isSyncing = false;

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

async function performSync(window: BrowserWindow) {
  if (isSyncing) return;
  isSyncing = true;
  sendSyncStatus(window);

  try {
    // Get all pending sync events in order
    const events = db.prepare("SELECT * FROM sync_events WHERE status = 'pending' ORDER BY id ASC").all() as any[];

    const cloudSyncUrl = getSetting('cloud_sync_url');
    const cloudSyncToken = getSetting('cloud_sync_token');

    if (!cloudSyncUrl) {
      console.log('Cloud Sync URL belum diisi. Antrean sync tetap pending.');
      return;
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
      
      logAuditAction(null, 'SYNC_EVENT_COMPLETED', 'sync_events', event.id, null, { event_type: event.event_type });
      
      // Update UI in real-time
      sendSyncStatus(window);
    }
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

  // Trigger sync asynchronously in background
  performSync(window).catch(console.error);
  logAuditAction(null, 'SYNC_TRIGGERED', 'sync_events', null, null, { manual: true });
  
  return { message: 'Sinkronisasi dimulai' };
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

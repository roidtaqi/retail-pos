import { ipcMain } from 'electron';
import db, { logAuditAction } from '../db';
import { wrapIpcHandler, IpcError, ERROR_CODES } from '../utils/ipcErrorHandler';

ipcMain.handle('settings:getAll', wrapIpcHandler(async () => {
  const list = db.prepare('SELECT * FROM settings').all() as any[];
  const result: Record<string, string> = {};
  for (const item of list) {
    result[item.key] = item.value;
  }
  return result;
}));

ipcMain.handle('settings:update', wrapIpcHandler(async (_event, settingsData: Record<string, string>) => {
  if (!settingsData || Object.keys(settingsData).length === 0) {
    throw new IpcError('Data pengaturan tidak boleh kosong', ERROR_CODES.VALIDATION_ERROR);
  }

  const updateStmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at) 
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  const runUpdate = db.transaction(() => {
    for (const [key, value] of Object.entries(settingsData)) {
      updateStmt.run(key, value);
    }
  });

  runUpdate();
  logAuditAction(null, 'SETTINGS_UPDATE', 'settings', null, null, settingsData);
  
  return { success: true };
}));

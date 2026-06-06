import { ipcMain } from 'electron';
import db, { logAuditAction } from '../db';
import { wrapIpcHandler, IpcError, ERROR_CODES } from '../utils/ipcErrorHandler';

ipcMain.handle('categories:getAll', wrapIpcHandler(async () => {
  return db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC').all();
}));

ipcMain.handle('categories:create', wrapIpcHandler(async (_event, category: any) => {
  const { name, parent_id, sort_order, icon } = category;

  if (!name) {
    throw new IpcError('Nama kategori harus diisi', ERROR_CODES.VALIDATION_ERROR);
  }

  const stmt = db.prepare(`
    INSERT INTO categories (name, parent_id, sort_order, icon)
    VALUES (?, ?, ?, ?)
  `);
  const res = stmt.run(name, parent_id || null, sort_order || 0, icon || null);
  
  logAuditAction(null, 'CATEGORY_CREATE', 'categories', Number(res.lastInsertRowid), null, { name, parent_id, sort_order, icon });
  
  return { id: res.lastInsertRowid };
}));

ipcMain.handle('categories:update', wrapIpcHandler(async (_event, id: number, category: any) => {
  const { name, parent_id, sort_order, icon } = category;

  if (!name) {
    throw new IpcError('Nama kategori harus diisi', ERROR_CODES.VALIDATION_ERROR);
  }

  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) {
    throw new IpcError('Kategori tidak ditemukan', ERROR_CODES.NOT_FOUND);
  }

  db.prepare(`
    UPDATE categories 
    SET name = ?, parent_id = ?, sort_order = ?, icon = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, parent_id || null, sort_order || 0, icon || null, id);

  logAuditAction(null, 'CATEGORY_UPDATE', 'categories', id, existing, { name, parent_id, sort_order, icon });
  
  return { id };
}));

ipcMain.handle('categories:delete', wrapIpcHandler(async (_event, id: number) => {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) {
    throw new IpcError('Kategori tidak ditemukan', ERROR_CODES.NOT_FOUND);
  }

  const runDelete = db.transaction(() => {
    db.prepare('UPDATE products SET category_id = NULL WHERE category_id = ?').run(id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  });
  
  runDelete();
  logAuditAction(null, 'CATEGORY_DELETE', 'categories', id, existing, null);
  
  return { id };
}));

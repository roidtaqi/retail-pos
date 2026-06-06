import { ipcMain } from 'electron';
import db, { logAuditAction } from '../db';
import { wrapIpcHandler, IpcError, ERROR_CODES } from '../utils/ipcErrorHandler';

ipcMain.handle('customers:getAll', wrapIpcHandler(async () => {
  return db.prepare('SELECT * FROM customers ORDER BY name ASC').all();
}));

ipcMain.handle('customers:getById', wrapIpcHandler(async (_event, id: number) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) {
    throw new IpcError('Pelanggan tidak ditemukan', ERROR_CODES.NOT_FOUND);
  }
  return customer;
}));

ipcMain.handle('customers:create', wrapIpcHandler(async (_event, customer: any) => {
  const { name, phone, address, credit_limit, notes } = customer;
  
  if (!name) {
    throw new IpcError('Nama pelanggan harus diisi', ERROR_CODES.VALIDATION_ERROR);
  }

  const stmt = db.prepare(`
    INSERT INTO customers (name, phone, address, credit_limit, total_debt, status, notes)
    VALUES (?, ?, ?, ?, 0, 'active', ?)
  `);
  const res = stmt.run(name, phone || null, address || null, credit_limit || 0, notes || null);
  
  logAuditAction(null, 'CUSTOMER_CREATE', 'customers', Number(res.lastInsertRowid), null, { name, phone, address, credit_limit });
  
  return { id: res.lastInsertRowid };
}));

ipcMain.handle('customers:update', wrapIpcHandler(async (_event, id: number, customer: any) => {
  const { name, phone, address, credit_limit, status, notes } = customer;

  if (!name) {
    throw new IpcError('Nama pelanggan harus diisi', ERROR_CODES.VALIDATION_ERROR);
  }

  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!existing) {
    throw new IpcError('Pelanggan tidak ditemukan', ERROR_CODES.NOT_FOUND);
  }

  db.prepare(`
    UPDATE customers 
    SET name = ?, phone = ?, address = ?, credit_limit = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, phone || null, address || null, credit_limit || 0, status || 'active', notes || null, id);

  logAuditAction(null, 'CUSTOMER_UPDATE', 'customers', id, existing, { name, phone, address, credit_limit, status });
  
  return { id };
}));

ipcMain.handle('customers:getDebts', wrapIpcHandler(async (_event, customerId: number) => {
  const debts = db.prepare('SELECT * FROM debts WHERE customer_id = ? ORDER BY created_at DESC').all(customerId);
  if (!debts || debts.length === 0) {
    return [];
  }
  return debts;
}));

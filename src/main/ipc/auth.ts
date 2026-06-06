import { ipcMain } from 'electron';
import db, { logAuditAction } from '../db';
import { wrapIpcHandler, IpcError, ERROR_CODES } from '../utils/ipcErrorHandler';

ipcMain.handle('auth:login', wrapIpcHandler(async (_event, username: string, pin: string) => {
  // Validation
  if (!username || !pin) {
    throw new IpcError('Username dan PIN harus diisi', ERROR_CODES.VALIDATION_ERROR);
  }

  const user = db.prepare(
    'SELECT id, username, name, role, active FROM users WHERE username = ? AND pin = ? AND active = 1'
  ).get(username, pin) as any;
  
  if (!user) {
    logAuditAction(null, 'LOGIN_FAILED', 'users', null, { username, pin: '***' }, null);
    throw new IpcError('Username atau PIN salah.', ERROR_CODES.INVALID_CREDENTIALS);
  }

  logAuditAction(user.id, 'LOGIN_SUCCESS', 'users', user.id, null, { user_id: user.id });
  
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active
  };
}));

ipcMain.handle('auth:verifyPin', wrapIpcHandler(async (_event, pin: string) => {
  if (!pin) {
    throw new IpcError('PIN harus diisi', ERROR_CODES.VALIDATION_ERROR);
  }

  const user = db.prepare(
    'SELECT id, username, name, role FROM users WHERE pin = ? AND active = 1'
  ).get(pin) as any;
  
  if (!user) {
    logAuditAction(null, 'PIN_VERIFY_FAILED', 'users', null, { pin: '***' }, null);
    throw new IpcError('PIN salah atau kasir tidak aktif.', ERROR_CODES.INVALID_CREDENTIALS);
  }

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role
  };
}));

import { ipcMain } from 'electron';
import db, { logAuditAction } from '../db';
import { wrapIpcHandler, IpcError, ERROR_CODES } from '../utils/ipcErrorHandler';

ipcMain.handle('debts:getAll', wrapIpcHandler(async () => {
  return db.prepare(`
    SELECT d.*, c.name as customer_name, c.phone as customer_phone, s.invoice_number
    FROM debts d
    JOIN customers c ON d.customer_id = c.id
    LEFT JOIN sales s ON d.transaction_id = s.id
    ORDER BY d.created_at DESC
  `).all();
}));

ipcMain.handle('debts:getById', wrapIpcHandler(async (_event, id: number) => {
  const debt = db.prepare(`
    SELECT d.*, c.name as customer_name, c.phone as customer_phone, s.invoice_number
    FROM debts d
    JOIN customers c ON d.customer_id = c.id
    LEFT JOIN sales s ON d.transaction_id = s.id
    WHERE d.id = ?
  `).get(id) as any;

  if (!debt) {
    throw new IpcError('Hutang tidak ditemukan', ERROR_CODES.NOT_FOUND);
  }

  const installments = db.prepare('SELECT * FROM installments WHERE debt_id = ? ORDER BY sequence_no ASC').all(id);
  const payments = db.prepare('SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY created_at DESC').all(id);

  return { ...debt, installments, payments };
}));

ipcMain.handle('debts:pay', wrapIpcHandler(async (_event, payData: any) => {
  const { debt_id, amount, payment_method, collected_by, note } = payData;

  if (!debt_id || !amount || !payment_method) {
    throw new IpcError('Debt ID, amount, dan payment method harus diisi', ERROR_CODES.VALIDATION_ERROR);
  }

  const result = db.transaction(() => {
    const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(debt_id) as any;
    if (!debt) {
      throw new IpcError('Hutang tidak ditemukan.', ERROR_CODES.NOT_FOUND);
    }
    if (debt.status === 'paid') {
      throw new IpcError('Hutang ini sudah lunas.', ERROR_CODES.CONFLICT);
    }

    const actualAmountToPay = Math.min(amount, debt.remaining);
    const newPaidAmount = debt.paid_amount + actualAmountToPay;
    const newRemaining = debt.amount - newPaidAmount;
    const newStatus = newRemaining <= 0 ? 'paid' : 'partial';

    // 1. Update debt record
    db.prepare(`
      UPDATE debts 
      SET paid_amount = ?, remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newPaidAmount, newRemaining, newStatus, debt_id);

    // 2. Insert payment log
    db.prepare(`
      INSERT INTO debt_payments (debt_id, amount, payment_method, collected_by, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(debt_id, actualAmountToPay, payment_method, collected_by, note || 'Pembayaran cicilan/hutang');

    // 3. Update customer total_debt
    db.prepare(`
      UPDATE customers 
      SET total_debt = MAX(0, total_debt - ?) 
      WHERE id = ?
    `).run(actualAmountToPay, debt.customer_id);

    // 4. Create sync event
    const syncPayload = JSON.stringify({ debt_id, amount: actualAmountToPay, payment_method, collected_by, note });
    db.prepare(`
      INSERT INTO sync_events (event_type, payload, idempotency_key)
      VALUES ('debt.payment', ?, ?)
    `).run(syncPayload, `debt_pay_${debt_id}_${Date.now()}`);

    return { remaining: newRemaining };
  })();

  logAuditAction(collected_by, 'DEBT_PAYMENT', 'debts', debt_id, null, { amount, payment_method, note });
  
  return result;
}));

ipcMain.handle('debts:payInstallment', wrapIpcHandler(async (_event, payData: any) => {
  const { installment_id, amount, payment_method, collected_by, note } = payData;

  if (!installment_id || !amount || !payment_method) {
    throw new IpcError('Installment ID, amount, dan payment method harus diisi', ERROR_CODES.VALIDATION_ERROR);
  }

  const result = db.transaction(() => {
    const inst = db.prepare('SELECT * FROM installments WHERE id = ?').get(installment_id) as any;
    if (!inst) {
      throw new IpcError('Cicilan tidak ditemukan.', ERROR_CODES.NOT_FOUND);
    }
    if (inst.status === 'paid') {
      throw new IpcError('Cicilan ini sudah dibayar.', ERROR_CODES.CONFLICT);
    }

    const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(inst.debt_id) as any;
    if (!debt) {
      throw new IpcError('Hutang terkait tidak ditemukan.', ERROR_CODES.NOT_FOUND);
    }

    // 1. Update installment record
    db.prepare(`
      UPDATE installments 
      SET paid_at = CURRENT_TIMESTAMP, paid_amount = ?, status = 'paid', collected_by = ?
      WHERE id = ?
    `).run(amount, collected_by, installment_id);

    // 2. Update debt record
    const actualAmountToPay = amount;
    const newPaidAmount = debt.paid_amount + actualAmountToPay;
    const newRemaining = debt.amount - newPaidAmount;
    const newStatus = newRemaining <= 0 ? 'paid' : 'partial';

    db.prepare(`
      UPDATE debts 
      SET paid_amount = ?, remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newPaidAmount, newRemaining, newStatus, inst.debt_id);

    // 3. Insert payment log
    db.prepare(`
      INSERT INTO debt_payments (debt_id, installment_id, amount, payment_method, collected_by, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(inst.debt_id, installment_id, actualAmountToPay, payment_method, collected_by, note || `Bayar cicilan ke-${inst.sequence_no}`);

    // 4. Update customer total_debt
    db.prepare(`
      UPDATE customers 
      SET total_debt = MAX(0, total_debt - ?) 
      WHERE id = ?
    `).run(actualAmountToPay, debt.customer_id);

    // 5. Create sync event
    const syncPayload = JSON.stringify({ installment_id, amount, payment_method, collected_by });
    db.prepare(`
      INSERT INTO sync_events (event_type, payload, idempotency_key)
      VALUES ('installment.payment', ?, ?)
    `).run(syncPayload, `inst_pay_${installment_id}_${Date.now()}`);

    return { remaining: newRemaining };
  })();

  logAuditAction(collected_by, 'INSTALLMENT_PAYMENT', 'installments', installment_id, null, { amount, payment_method });
  
  return result;
}));

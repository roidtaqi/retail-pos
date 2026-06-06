import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import db, { logAuditAction } from '../db';
import { wrapIpcHandler, IpcError, ERROR_CODES } from '../utils/ipcErrorHandler';

function csvCell(value: any) {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function csvRow(values: any[]) {
  return values.map(csvCell).join(',');
}

function addCsvSection(lines: string[], title: string, headers: string[], rows: any[][]) {
  lines.push('');
  lines.push(csvRow([title]));
  lines.push(csvRow(headers));
  if (rows.length === 0) {
    lines.push(csvRow(['Tidak ada data']));
    return;
  }
  rows.forEach((row) => lines.push(csvRow(row)));
}

function exportShiftSettlementCsv(shiftId: number) {
  const shift = db.prepare(`
    SELECT s.*, u.name as cashier_name
    FROM shifts s
    JOIN users u ON s.cashier_id = u.id
    WHERE s.id = ?
  `).get(shiftId) as any;

  if (!shift) {
    throw new Error('Shift tidak ditemukan untuk settle.');
  }

  const salesSummary = db.prepare(`
    SELECT
      COALESCE(SUM(total), 0) as total_sales,
      COALESCE(SUM(discount), 0) as total_discount,
      COUNT(id) as transaction_count,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN payment_amount - change_amount ELSE 0 END), 0) as cash_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total ELSE 0 END), 0) as transfer_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'qris' THEN total ELSE 0 END), 0) as qris_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'debt' THEN total ELSE 0 END), 0) as debt_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'installment' THEN total ELSE 0 END), 0) as installment_sales
    FROM sales
    WHERE shift_id = ?
  `).get(shiftId) as any;

  const paymentRows = db.prepare(`
    SELECT payment_method, COUNT(id) as transaction_count, COALESCE(SUM(total), 0) as total
    FROM sales
    WHERE shift_id = ?
    GROUP BY payment_method
    ORDER BY total DESC
  `).all(shiftId) as any[];

  const salesRows = db.prepare(`
    SELECT
      s.invoice_number, s.transaction_time, u.name as cashier_name,
      s.customer_name, s.payment_method, s.subtotal, s.discount,
      s.total, s.payment_amount, s.change_amount
    FROM sales s
    JOIN users u ON s.cashier_id = u.id
    WHERE s.shift_id = ?
    ORDER BY s.transaction_time ASC
  `).all(shiftId) as any[];

  const itemRows = db.prepare(`
    SELECT
      s.invoice_number, s.transaction_time, si.product_sku, si.product_name,
      si.quantity, si.sell_price, si.discount, si.subtotal
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE s.shift_id = ?
    ORDER BY s.transaction_time ASC, si.id ASC
  `).all(shiftId) as any[];

  const cashRows = db.prepare(`
    SELECT type, amount, reason, created_at
    FROM shift_transactions
    WHERE shift_id = ?
    ORDER BY id ASC
  `).all(shiftId) as any[];

  const debtRows = db.prepare(`
    SELECT
      s.invoice_number, c.name as customer_name, d.amount, d.paid_amount,
      d.remaining, d.due_date, d.status, d.notes
    FROM debts d
    JOIN sales s ON d.transaction_id = s.id
    JOIN customers c ON d.customer_id = c.id
    WHERE s.shift_id = ?
    ORDER BY d.created_at ASC
  `).all(shiftId) as any[];

  const stockRows = db.prepare(`
    SELECT
      sc.reference_id, p.sku, p.name, sc.qty_change, sc.qty_balance,
      sc.reason, sc.created_at
    FROM stock_cards sc
    JOIN products p ON sc.product_id = p.id
    WHERE sc.type = 'sale'
      AND sc.reference_id IN (SELECT invoice_number FROM sales WHERE shift_id = ?)
    ORDER BY sc.created_at ASC, sc.id ASC
  `).all(shiftId) as any[];

  const lines: string[] = ['\ufeff' + csvRow(['SETTLE SHIFT', `#${shift.id}`, shift.cashier_name])];

  addCsvSection(lines, 'RINGKASAN SHIFT', ['Field', 'Nilai'], [
    ['Shift ID', shift.id],
    ['Kasir', shift.cashier_name],
    ['Mulai', shift.start_time],
    ['Selesai', shift.end_time],
    ['Status', shift.status],
    ['Modal Awal', shift.start_cash],
    ['Penjualan Total', salesSummary.total_sales],
    ['Total Diskon', salesSummary.total_discount],
    ['Jumlah Transaksi', salesSummary.transaction_count],
    ['Tunai Masuk', salesSummary.cash_sales],
    ['Transfer', salesSummary.transfer_sales],
    ['QRIS', salesSummary.qris_sales],
    ['Hutang', salesSummary.debt_sales],
    ['Cicilan', salesSummary.installment_sales],
    ['Kas Diharapkan', shift.end_cash_expected],
    ['Kas Fisik', shift.end_cash_actual],
    ['Selisih Kas', shift.cash_difference]
  ]);

  addCsvSection(
    lines,
    'RINGKASAN METODE PEMBAYARAN',
    ['Metode Pembayaran', 'Jumlah Transaksi', 'Total'],
    paymentRows.map((row) => [row.payment_method, row.transaction_count, row.total])
  );

  addCsvSection(
    lines,
    'KAS MASUK / KELUAR',
    ['Tipe', 'Nominal', 'Alasan', 'Waktu'],
    cashRows.map((row) => [row.type, row.amount, row.reason, row.created_at])
  );

  addCsvSection(
    lines,
    'RIWAYAT TRANSAKSI',
    ['Invoice', 'Waktu', 'Kasir', 'Pelanggan', 'Metode', 'Subtotal', 'Diskon', 'Total', 'Bayar', 'Kembali'],
    salesRows.map((row) => [
      row.invoice_number, row.transaction_time, row.cashier_name, row.customer_name,
      row.payment_method, row.subtotal, row.discount, row.total, row.payment_amount, row.change_amount
    ])
  );

  addCsvSection(
    lines,
    'ITEM TERJUAL',
    ['Invoice', 'Waktu', 'SKU', 'Produk', 'Qty', 'Harga', 'Diskon Item', 'Subtotal Item'],
    itemRows.map((row) => [
      row.invoice_number, row.transaction_time, row.product_sku, row.product_name,
      row.quantity, row.sell_price, row.discount, row.subtotal
    ])
  );

  addCsvSection(
    lines,
    'HUTANG / CICILAN DIBUAT',
    ['Invoice', 'Pelanggan', 'Nominal', 'Terbayar', 'Sisa', 'Jatuh Tempo', 'Status', 'Catatan'],
    debtRows.map((row) => [
      row.invoice_number, row.customer_name, row.amount, row.paid_amount,
      row.remaining, row.due_date, row.status, row.notes
    ])
  );

  addCsvSection(
    lines,
    'KARTU STOK KELUAR',
    ['Invoice', 'SKU', 'Produk', 'Qty Keluar', 'Sisa Stok', 'Alasan', 'Waktu'],
    stockRows.map((row) => [
      row.reference_id, row.sku, row.name, row.qty_change, row.qty_balance, row.reason, row.created_at
    ])
  );

  const safeCashier = String(shift.cashier_name || 'kasir').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `settle-shift-${shift.id}-${safeCashier}-${timestamp}.csv`;
  const filePath = path.join(app.getPath('downloads'), fileName);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

ipcMain.handle('shifts:getCurrent', wrapIpcHandler(async () => {
  const shift = db.prepare(`
    SELECT s.*, u.name as cashier_name 
    FROM shifts s
    JOIN users u ON s.cashier_id = u.id
    WHERE s.status = 'open'
    ORDER BY s.id DESC LIMIT 1
  `).get() as any;
  return shift || null;
}));

ipcMain.handle('shifts:open', wrapIpcHandler(async (_event, cashierId: number, startCash: number) => {
  if (!cashierId || isNaN(startCash)) {
    throw new IpcError('Cashier ID dan start cash harus valid', ERROR_CODES.VALIDATION_ERROR);
  }

  const runOpen = db.transaction(() => {
    // Check if there is already an open shift
    const activeShift = db.prepare("SELECT id FROM shifts WHERE status = 'open'").get();
    if (activeShift) {
      throw new IpcError(
        'Ada shift yang masih terbuka. Tutup shift tersebut terlebih dahulu.',
        ERROR_CODES.CONFLICT
      );
    }

    // Create new shift
    const stmt = db.prepare(`
      INSERT INTO shifts (cashier_id, start_time, start_cash, status)
      VALUES (?, CURRENT_TIMESTAMP, ?, 'open')
    `);
    const result = stmt.run(cashierId, startCash);
    const shiftId = result.lastInsertRowid;

    // Add a default cash_in transaction for starting balance
    db.prepare(`
      INSERT INTO shift_transactions (shift_id, type, amount, reason)
      VALUES (?, 'cash_in', ?, 'Modal Awal')
    `).run(shiftId, startCash);

    const cashier = db.prepare('SELECT name FROM users WHERE id = ?').get(cashierId) as any;

    // Create sync event
    const syncPayload = JSON.stringify({
      shiftId,
      cashierId,
      cashierName: cashier?.name || null,
      startCash,
      startTime: new Date().toISOString()
    });
    db.prepare(`
      INSERT INTO sync_events (event_type, payload, idempotency_key)
      VALUES ('shift.open', ?, ?)
    `).run(syncPayload, `shift_open_${shiftId}_${Date.now()}`);

    return shiftId;
  });

  const shiftId = runOpen();
  logAuditAction(null, 'SHIFT_OPEN', 'shifts', shiftId as number, null, { cashier_id: cashierId, start_cash: startCash });
  
  return {
    id: shiftId,
    cashier_id: cashierId,
    start_cash: startCash,
    status: 'open'
  };
}));

ipcMain.handle('shifts:close', wrapIpcHandler(async (_event, shiftId: number, endCashActual: number) => {
  if (!shiftId || isNaN(endCashActual)) {
    throw new IpcError('Shift ID dan end cash harus valid', ERROR_CODES.VALIDATION_ERROR);
  }

  const runClose = db.transaction(() => {
    // Get current shift
    const shift = db.prepare(`
      SELECT s.start_cash, s.status, s.cashier_id, u.name as cashier_name
      FROM shifts s
      JOIN users u ON s.cashier_id = u.id
      WHERE s.id = ?
    `).get(shiftId) as any;
    if (!shift) {
      throw new IpcError('Shift tidak ditemukan.', ERROR_CODES.NOT_FOUND);
    }
    if (shift.status === 'closed') {
      throw new IpcError('Shift sudah ditutup.', ERROR_CODES.CONFLICT);
    }

    // Calculate expected cash:
    // Expected = start_cash + sales (cash method only) + cash_in - cash_out
    const salesCashResult = db.prepare(`
      SELECT COALESCE(SUM(payment_amount - change_amount), 0) as total 
      FROM sales 
      WHERE shift_id = ? AND payment_method = 'cash'
    `).get(shiftId) as any;
    const salesCash = salesCashResult.total;

    const adjustments = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'cash_in' AND reason != 'Modal Awal' THEN amount ELSE 0 END), 0) as cash_in,
        COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount ELSE 0 END), 0) as cash_out
      FROM shift_transactions 
      WHERE shift_id = ?
    `).get(shiftId) as any;

    const endCashExpected = shift.start_cash + salesCash + adjustments.cash_in - adjustments.cash_out;
    const cashDifference = endCashActual - endCashExpected;

    // Close shift in db
    db.prepare(`
      UPDATE shifts 
      SET end_time = CURRENT_TIMESTAMP, 
          end_cash_expected = ?, 
          end_cash_actual = ?, 
          cash_difference = ?, 
          status = 'closed',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(endCashExpected, endCashActual, cashDifference, shiftId);

    // Create sync event
    const syncPayload = JSON.stringify({
      shiftId,
      cashierId: shift.cashier_id,
      cashierName: shift.cashier_name,
      endCashActual,
      endCashExpected,
      cashDifference,
      endTime: new Date().toISOString()
    });
    db.prepare(`
      INSERT INTO sync_events (event_type, payload, idempotency_key)
      VALUES ('shift.close', ?, ?)
    `).run(syncPayload, `shift_close_${shiftId}_${Date.now()}`);

    return { endCashExpected, endCashActual, cashDifference };
  });

  const result = runClose();
  const settleCsvPath = exportShiftSettlementCsv(shiftId);
  logAuditAction(null, 'SHIFT_CLOSE', 'shifts', shiftId, null, { ...result, settleCsvPath });
  
  return { ...result, settleCsvPath };
}));

async function addShiftCashTransaction(shiftId: number, transaction: any) {
  const { type, amount, reason } = transaction;

  if (!shiftId || !type || !amount || !reason) {
    throw new IpcError('Shift ID, type, amount, dan reason harus diisi', ERROR_CODES.VALIDATION_ERROR);
  }

  if (!['cash_in', 'cash_out'].includes(type)) {
    throw new IpcError('Type harus cash_in atau cash_out', ERROR_CODES.INVALID_INPUT);
  }

  const runAdd = db.transaction(() => {
    const shift = db.prepare('SELECT status FROM shifts WHERE id = ?').get(shiftId) as any;
    if (!shift) {
      throw new IpcError('Shift tidak ditemukan.', ERROR_CODES.NOT_FOUND);
    }
    if (shift.status !== 'open') {
      throw new IpcError('Shift tidak aktif atau sudah tutup.', ERROR_CODES.CONFLICT);
    }

    db.prepare(`
      INSERT INTO shift_transactions (shift_id, type, amount, reason)
      VALUES (?, ?, ?, ?)
    `).run(shiftId, type, amount, reason);

    // Create sync event
    const syncPayload = JSON.stringify({ shiftId, type, amount, reason, createdAt: new Date().toISOString() });
    db.prepare(`
      INSERT INTO sync_events (event_type, payload, idempotency_key)
      VALUES ('shift.transaction', ?, ?)
    `).run(syncPayload, `shift_tx_${shiftId}_${Date.now()}`);
  });

  runAdd();
  logAuditAction(null, 'SHIFT_TRANSACTION', 'shift_transactions', shiftId, null, { type, amount, reason });
  
  return { success: true };
}

ipcMain.handle('shifts:addCashInOut', wrapIpcHandler(async (_event, shiftId: number, transaction: any) => {
  return addShiftCashTransaction(shiftId, transaction);
}));

ipcMain.handle('shifts:addTransaction', wrapIpcHandler(async (_event, shiftId: number, type: 'cash_in' | 'cash_out', amount: number, reason: string) => {
  return addShiftCashTransaction(shiftId, { type, amount, reason });
}));

ipcMain.handle('shifts:getTransactions', wrapIpcHandler(async (_event, shiftId: number) => {
  if (!shiftId) {
    throw new IpcError('Shift ID harus diisi', ERROR_CODES.VALIDATION_ERROR);
  }

  return db.prepare('SELECT * FROM shift_transactions WHERE shift_id = ? ORDER BY id DESC').all(shiftId);
}));

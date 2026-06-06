import { ipcMain } from 'electron';
import db from '../db';
import { wrapIpcHandler, IpcError, ERROR_CODES } from '../utils/ipcErrorHandler';

ipcMain.handle('reports:getDailySummary', wrapIpcHandler(async (_event, date: string) => {
  const filterDate = date || new Date().toISOString().split('T')[0];
  const dateStart = `${filterDate} 00:00:00`;
  const dateEnd = `${filterDate} 23:59:59`;

  const summary = db.prepare(`
    SELECT 
      COALESCE(SUM(total), 0) as total_sales,
      COALESCE(SUM(discount), 0) as total_discount,
      COUNT(id) as transaction_count
    FROM sales
    WHERE transaction_time BETWEEN ? AND ?
  `).get(dateStart, dateEnd) as any;

  const paymentMethods = db.prepare(`
    SELECT payment_method, COALESCE(SUM(total), 0) as total
    FROM sales
    WHERE transaction_time BETWEEN ? AND ?
    GROUP BY payment_method
  `).all(dateStart, dateEnd) as any[];

  return {
    date: filterDate,
    total_sales: summary.total_sales,
    total_discount: summary.total_discount,
    transaction_count: summary.transaction_count,
    payment_breakdown: paymentMethods
  };
}));

ipcMain.handle('reports:getBestSellers', wrapIpcHandler(async (_event, limit = 5) => {
  if (isNaN(limit) || limit < 1) {
    throw new IpcError('Limit harus angka positif', ERROR_CODES.VALIDATION_ERROR);
  }

  return db.prepare(`
    SELECT 
      product_name, product_sku, 
      SUM(quantity) as total_qty, 
      SUM(subtotal) as total_sales
    FROM sale_items
    GROUP BY product_id
    ORDER BY total_qty DESC
    LIMIT ?
  `).all(limit);
}));

ipcMain.handle('reports:getShiftPerformance', wrapIpcHandler(async (_event, shiftId: number) => {
  if (!shiftId) {
    throw new IpcError('Shift ID harus diisi', ERROR_CODES.VALIDATION_ERROR);
  }

  const shift = db.prepare(`
    SELECT s.*, u.name as cashier_name 
    FROM shifts s
    JOIN users u ON s.cashier_id = u.id
    WHERE s.id = ?
  `).get(shiftId) as any;

  if (!shift) {
    throw new IpcError('Shift tidak ditemukan', ERROR_CODES.NOT_FOUND);
  }

  const salesSummary = db.prepare(`
    SELECT 
      COALESCE(SUM(total), 0) as total_sales,
      COUNT(id) as transaction_count,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN (payment_amount - change_amount) ELSE 0 END), 0) as cash_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total ELSE 0 END), 0) as transfer_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'qris' THEN total ELSE 0 END), 0) as qris_sales
    FROM sales
    WHERE shift_id = ?
  `).get(shiftId) as any;

  const adjustments = db.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN type = 'cash_in' AND reason != 'Modal Awal' THEN amount ELSE 0 END), 0) as cash_in,
      COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount ELSE 0 END), 0) as cash_out
    FROM shift_transactions
    WHERE shift_id = ?
  `).get(shiftId) as any;

  return {
    ...shift,
    ...salesSummary,
    cash_in_adjustment: adjustments.cash_in,
    cash_out_adjustment: adjustments.cash_out
  };
}));

ipcMain.handle('reports:getInventoryStatus', wrapIpcHandler(async () => {
  const lowStockProducts = db.prepare(`
    SELECT id, sku, name, stock, min_stock, (min_stock - stock) as shortage
    FROM products
    WHERE stock < min_stock AND active = 1
    ORDER BY shortage DESC
  `).all();

  const totalValue = db.prepare(`
    SELECT 
      COALESCE(SUM(stock * cost_price), 0) as inventory_value
    FROM products
    WHERE active = 1
  `).get() as any;

  return {
    low_stock_products: lowStockProducts,
    total_inventory_value: totalValue.inventory_value,
    low_stock_count: (lowStockProducts as any[]).length
  };
}));

ipcMain.handle('reports:getStockLevels', wrapIpcHandler(async () => {
  const lowStock = db.prepare(`
    SELECT sku, name, stock, category 
    FROM products 
    WHERE stock < 10 AND active = 1 
    ORDER BY stock ASC
  `).all();

  const summary = db.prepare(`
    SELECT 
      COUNT(id) as total_skus,
      COALESCE(SUM(stock), 0) as total_stock_qty,
      COALESCE(SUM(stock * cost_price), 0) as total_valuation_cost,
      COALESCE(SUM(stock * sell_price), 0) as total_valuation_sell
    FROM products
    WHERE active = 1
  `).get() as any;

  return {
    low_stock: lowStock,
    summary
  };
}));

ipcMain.handle('reports:getStockCard', wrapIpcHandler(async (_event, productId: number) => {
  if (!productId) {
    throw new IpcError('Product ID harus diisi', ERROR_CODES.VALIDATION_ERROR);
  }

  return db.prepare(`
    SELECT * FROM stock_cards 
    WHERE product_id = ? 
    ORDER BY id DESC 
    LIMIT 100
  `).all(productId);
}));

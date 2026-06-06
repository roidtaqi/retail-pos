import { ipcMain } from 'electron';
import db, { generateInvoiceNumber, logAuditAction } from '../db';
import { printReceiptSilentCompat } from './printer';
import { wrapIpcHandler, IpcError, ERROR_CODES } from '../utils/ipcErrorHandler';
import fs from 'fs';
import path from 'path';

ipcMain.handle('sales:checkout', async (_event, saleData: any) => {
  try {
    const {
      invoice_number,
      cashier_id,
      shift_id,
      customer_id,
      customer_name,
      subtotal,
      discount,
      total,
      payment_method,
      payment_amount,
      change_amount,
      idempotency_key,
      items
    } = saleData;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Keranjang belanja masih kosong.');
    }

    // Execute atomic SQLite transaction
    const runCheckout = db.transaction(() => {
      // 1. Double checkout check using idempotency key
      const duplicate = db.prepare('SELECT id FROM sales WHERE idempotency_key = ?').get(idempotency_key);
      if (duplicate) {
        throw new IpcError(
          'Transaksi ganda terdeteksi (Idempotency Key duplicate).',
          ERROR_CODES.IDEMPOTENCY_CONFLICT
        );
      }

      // Check if invoice number is duplicate
      const duplicateInvoice = db.prepare('SELECT id FROM sales WHERE invoice_number = ?').get(invoice_number);
      if (duplicateInvoice) {
        throw new IpcError(
          `Nomor Invoice ${invoice_number} sudah ada di database.`,
          ERROR_CODES.DUPLICATE_ENTRY
        );
      }

      if (payment_method !== 'debt' && payment_method !== 'installment' && Number(payment_amount) < Number(total)) {
        throw new Error('Nominal uang pembayaran kurang.');
      }

      if ((payment_method === 'transfer' || payment_method === 'qris') && Number(payment_amount) !== Number(total)) {
        throw new Error('Pembayaran Transfer dan QRIS harus sesuai total belanja.');
      }

      if ((payment_method === 'transfer' || payment_method === 'qris') && Number(change_amount) !== 0) {
        throw new Error('Pembayaran Transfer dan QRIS tidak boleh memiliki kembalian.');
      }

      // 2. Save sales record
      const saleStmt = db.prepare(`
        INSERT INTO sales (
          invoice_number, cashier_id, shift_id, customer_id, customer_name, 
          subtotal, discount, total, payment_method, 
          payment_amount, change_amount, idempotency_key, transaction_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      
      const saleResult = saleStmt.run(
        invoice_number, cashier_id, shift_id, customer_id || null, customer_name || null,
        subtotal, discount, total, payment_method,
        payment_amount, change_amount, idempotency_key
      );
      
      const saleId = saleResult.lastInsertRowid;

      // 2b. Process Debts / Installments if payment method is debt or installment
      if (payment_method === 'debt' || payment_method === 'installment') {
        if (!customer_id) {
          throw new Error('Pelanggan (Customer) harus dipilih untuk pembayaran Hutang/Cicilan.');
        }

        const downPayment = payment_amount || 0;
        if (downPayment > total) {
          throw new Error('Uang muka tidak boleh lebih besar dari total transaksi.');
        }
        const remaining = total - downPayment;
        const status = remaining <= 0 ? 'paid' : (downPayment > 0 ? 'partial' : 'unpaid');
        
        // Calculate due date (default to 30 days from now if not provided)
        const dueDateVal = saleData.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const debtStmt = db.prepare(`
          INSERT INTO debts (customer_id, transaction_id, amount, paid_amount, remaining, due_date, status, notes, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const debtResult = debtStmt.run(
          customer_id, saleId, total, downPayment, remaining, dueDateVal, status, saleData.note || 'Transaksi POS', cashier_id
        );
        const debtId = debtResult.lastInsertRowid;

        // Increment customer's total_debt
        db.prepare('UPDATE customers SET total_debt = total_debt + ? WHERE id = ?').run(remaining, customer_id);

        // Generate installments if installment_count > 1
        const installmentCount = saleData.installment_count || 1;
        if (payment_method === 'installment' && installmentCount > 1) {
          const installmentAmount = Math.round(remaining / installmentCount);
          const insertInstStmt = db.prepare(`
            INSERT INTO installments (debt_id, sequence_no, amount, due_date, status)
            VALUES (?, ?, ?, ?, 'pending')
          `);
          
          for (let i = 1; i <= installmentCount; i++) {
            const instDueDate = new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            insertInstStmt.run(debtId, i, installmentAmount, instDueDate);
          }
        }
      }

      // Statements for loops
      const updateStockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      const getProductStmt = db.prepare('SELECT sku, name, sell_price, cost_price, stock FROM products WHERE id = ?');
      const insertItemStmt = db.prepare(`
        INSERT INTO sale_items (
          sale_id, product_id, product_sku, product_name, 
          sell_price, cost_price, quantity, discount, subtotal
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertStockCardStmt = db.prepare(`
        INSERT INTO stock_cards (
          product_id, type, reference_id, qty_change, qty_balance, reason
        ) VALUES (?, 'sale', ?, ?, ?, 'Penjualan POS')
      `);

      // 3. Process each item
      for (const item of items) {
        const { product_id, quantity, discount: itemDiscount, subtotal: itemSubtotal } = item;
        
        // Fetch current product state
        const product = getProductStmt.get(product_id) as any;
        if (!product) {
          throw new Error(`Produk dengan ID ${product_id} tidak ditemukan.`);
        }

        if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
          throw new Error(`Quantity produk ${product.name} tidak valid.`);
        }

        if (Number(product.stock) < Number(quantity)) {
          throw new Error(`Stok ${product.name} tidak cukup. Stok tersedia: ${product.stock}, diminta: ${quantity}.`);
        }

        // Deduct product stock
        updateStockStmt.run(quantity, product_id);
        
        // Fetch updated stock to update stock cards
        const updatedProduct = getProductStmt.get(product_id) as any;
        const newStock = updatedProduct.stock;

        // Save sale item details
        insertItemStmt.run(
          saleId,
          product_id,
          product.sku,
          product.name,
          item.sell_price || product.sell_price,
          item.cost_price || product.cost_price,
          quantity,
          itemDiscount || 0,
          itemSubtotal
        );

        // Record stock card entry (qty_change is negative for sales)
        insertStockCardStmt.run(
          product_id,
          invoice_number,
          -quantity,
          newStock
        );
      }

      const cashier = db.prepare('SELECT name FROM users WHERE id = ?').get(cashier_id) as any;

      // 4. Create sync event
      const syncPayload = JSON.stringify({
        saleId,
        invoice_number,
        cashier_id,
        cashier_name: cashier?.name || null,
        shift_id,
        customer_name,
        subtotal,
        discount,
        total,
        payment_method,
        payment_amount,
        change_amount,
        transaction_time: new Date().toISOString(),
        idempotency_key,
        items: items.map((it: any) => ({
          product_id: it.product_id,
          product_sku: it.sku,
          product_name: it.name,
          quantity: it.quantity,
          sell_price: it.sell_price,
          cost_price: it.cost_price,
          discount: it.discount,
          subtotal: it.subtotal
        }))
      });

      db.prepare(`
        INSERT INTO sync_events (event_type, payload, idempotency_key)
        VALUES ('sale.create', ?, ?)
      `).run(syncPayload, `sale_sync_${invoice_number}`);

      return saleId;
    });

    const saleId = runCheckout();
    return { success: true, saleId };
  } catch (error: any) {
    console.error('Checkout failed:', error);
    return { success: false, error: error.message || 'Terjadi kesalahan saat menyimpan transaksi.' };
  }
});

// Printer Abstraction Simulation
ipcMain.handle('sales:printReceipt', async (_event, saleId: number) => {
  try {
    // Fetch sale
    const sale = db.prepare(`
      SELECT s.*, u.name as cashier_name 
      FROM sales s
      JOIN users u ON s.cashier_id = u.id
      WHERE s.id = ?
    `).get(saleId) as any;

    if (!sale) throw new Error('Penjualan tidak ditemukan.');

    // Fetch items
    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId) as any[];

    // Format receipt text
    const border = '========================================';
    const divider = '----------------------------------------';
    
    let text = '';
    text += '              TOKO HASNAWIR             \n';
    text += '      Jl. Raya Pasar UMKM No. 34, Indo  \n';
    text += '            Telp: 0812-3456-7890        \n';
    text += border + '\n';
    text += `Invoice : ${sale.invoice_number}\n`;
    text += `Tanggal : ${sale.transaction_time}\n`;
    text += `Kasir   : ${sale.cashier_name}\n`;
    if (sale.customer_name) {
      text += `Pelang  : ${sale.customer_name}\n`;
    }
    text += divider + '\n';

    for (const item of items) {
      // Line 1: Item Name
      text += `${item.product_name.substring(0, 40)}\n`;
      // Line 2: Qty x Price, Discount, Subtotal
      const qtyStr = `${item.quantity} x Rp ${item.sell_price.toLocaleString('id-ID')}`;
      const subtotalStr = `Rp ${item.subtotal.toLocaleString('id-ID')}`;
      const spaces = 40 - qtyStr.length - subtotalStr.length;
      
      text += qtyStr + ' '.repeat(spaces > 0 ? spaces : 2) + subtotalStr + '\n';
      if (item.discount > 0) {
        text += `  Diskon: -Rp ${item.discount.toLocaleString('id-ID')}\n`;
      }
    }

    text += divider + '\n';
    
    const subtotalText = `Subtotal: Rp ${sale.subtotal.toLocaleString('id-ID')}`;
    text += ' '.repeat(40 - subtotalText.length) + subtotalText + '\n';
    
    if (sale.discount > 0) {
      const discText = `Diskon Transaksi: -Rp ${sale.discount.toLocaleString('id-ID')}`;
      text += ' '.repeat(40 - discText.length) + discText + '\n';
    }

    const totalText = `TOTAL: Rp ${sale.total.toLocaleString('id-ID')}`;
    text += ' '.repeat(40 - totalText.length) + totalText + '\n';

    text += divider + '\n';
    text += `Bayar   : Rp ${sale.payment_amount.toLocaleString('id-ID')}\n`;
    if (sale.payment_method === 'cash') {
      text += `Kembali : Rp ${sale.change_amount.toLocaleString('id-ID')}\n`;
    }
    text += `Metode  : ${sale.payment_method.toUpperCase()}\n`;
    text += border + '\n';
    text += '    Terima Kasih Atas Kunjungan Anda   \n';
    text += '      Barang Yang Sudah Dibeli Tidak   \n';
    text += '            Dapat Ditukar              \n';
    text += '\n\n\n';

    // Try to print silently to default printer (or custom printer if configured)
    let printerName = '';
    try {
      const printerSetting = db.prepare("SELECT value FROM settings WHERE key = 'printer_name'").get() as any;
      if (printerSetting) printerName = printerSetting.value;
    } catch (e) {}

    const printResult = await printReceiptSilentCompat(saleId, printerName);

    // Simulate sending to USB/Bluetooth printer by writing to a log file
    const receiptPath = path.join(process.cwd(), 'receipt_simulation.txt');
    fs.writeFileSync(receiptPath, text);

    console.log(`Receipt successfully printed to simulation file: ${receiptPath}`);
    return { 
      success: true, 
      receiptText: text, 
      filepath: receiptPath,
      printedSilently: printResult.success,
      printError: printResult.error
    };
  } catch (error: any) {
    console.error('Receipt print failed:', error);
    return { success: false, error: error.message };
  }
});

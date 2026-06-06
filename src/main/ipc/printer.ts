import { ipcMain, BrowserWindow, app } from 'electron';
import db, { logAuditAction, enqueuePrintJob, updatePrintJobStatus, incrementPrintAttempt, getPendingPrintJobs, getPrintQueueStatus } from '../db';
import { wrapIpcHandler, IpcError, ERROR_CODES } from '../utils/ipcErrorHandler';
import fs from 'fs';
import path from 'path';

// Get user's Downloads directory for PDF fallback
const getPDFPath = () => {
  const downloadsPath = path.join(app.getPath('downloads'));
  return path.join(downloadsPath, `receipt_${Date.now()}.pdf`);
};

ipcMain.handle('printer:getNames', wrapIpcHandler(async () => {
  try {
    const dummyWin = new BrowserWindow({ show: false });
    const printers = await dummyWin.webContents.getPrintersAsync();
    dummyWin.destroy();
    return printers.map(p => ({
      name: p.name,
      isDefault: p.isDefault,
      status: p.status
    }));
  } catch (error: any) {
    console.error('Error fetching system printers:', error);
    return [];
  }
}));

ipcMain.handle('printer:testConnection', wrapIpcHandler(async (_event, printerName: string) => {
  if (!printerName) {
    throw new IpcError('Printer name harus diisi', ERROR_CODES.VALIDATION_ERROR);
  }

  try {
    const dummyWin = new BrowserWindow({ show: false });
    const printers = await dummyWin.webContents.getPrintersAsync();
    dummyWin.destroy();

    const printer = printers.find(p => p.name === printerName);
    if (!printer) {
      throw new IpcError('Printer tidak ditemukan', ERROR_CODES.NOT_FOUND);
    }

    logAuditAction(null, 'PRINTER_TEST', 'printer', null, null, { printer_name: printerName });
    return { success: true, message: `Printer "${printerName}" siap digunakan` };
  } catch (error: any) {
    throw new IpcError(`Gagal terhubung ke printer: ${error.message}`, ERROR_CODES.SERVICE_UNAVAILABLE);
  }
}));

ipcMain.handle('printer:printReceipt', wrapIpcHandler(async (_event, saleId: number, printerName?: string) => {
  if (!saleId || isNaN(saleId)) {
    throw new IpcError('Sale ID harus valid', ERROR_CODES.VALIDATION_ERROR);
  }

  const sale = db.prepare(`
    SELECT s.*, u.name as cashier_name 
    FROM sales s
    JOIN users u ON s.cashier_id = u.id
    WHERE s.id = ?
  `).get(saleId) as any;

  if (!sale) {
    throw new IpcError('Penjualan tidak ditemukan', ERROR_CODES.NOT_FOUND);
  }

  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId) as any[];

  // Generate receipt text
  const receiptText = generatePlainTextReceipt(sale, items);

  // Enqueue print job
  const printQueueId = enqueuePrintJob(saleId, receiptText, printerName || 'default');

  // Try immediate print
  try {
    await printReceiptSilent(sale, items, printerName);
    updatePrintJobStatus(printQueueId as number, 'completed');
    logAuditAction(null, 'RECEIPT_PRINTED', 'sales', saleId, null, { printer: printerName, queue_id: printQueueId });
    return { success: true, message: 'Struk berhasil dicetak', queue_id: printQueueId };
  } catch (error: any) {
    incrementPrintAttempt(printQueueId as number);
    logAuditAction(null, 'RECEIPT_PRINT_FAILED', 'sales', saleId, null, { error: error.message, queue_id: printQueueId });
    return { 
      success: false, 
      message: 'Printer tidak tersedia. Struk disimpan di antrian cetak.',
      queue_id: printQueueId,
      error: error.message 
    };
  }
}));

ipcMain.handle('printer:getQueueStatus', wrapIpcHandler(async () => {
  const status = getPrintQueueStatus();
  return status;
}));

ipcMain.handle('printer:getFailedPrints', wrapIpcHandler(async () => {
  const failed = db.prepare(`
    SELECT pq.*, s.invoice_number 
    FROM print_queue pq
    JOIN sales s ON pq.sale_id = s.id
    WHERE pq.status = 'failed'
    ORDER BY pq.created_at DESC
    LIMIT 50
  `).all();

  return failed;
}));

ipcMain.handle('printer:retryPrint', wrapIpcHandler(async (_event, printQueueId: number) => {
  if (!printQueueId || isNaN(printQueueId)) {
    throw new IpcError('Print Queue ID harus valid', ERROR_CODES.VALIDATION_ERROR);
  }

  const printJob = db.prepare('SELECT * FROM print_queue WHERE id = ?').get(printQueueId) as any;
  if (!printJob) {
    throw new IpcError('Print job tidak ditemukan', ERROR_CODES.NOT_FOUND);
  }

  if (printJob.attempt_count >= 3) {
    throw new IpcError('Sudah mencoba 3x, hubungi teknisi', ERROR_CODES.CONFLICT);
  }

  try {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(printJob.sale_id) as any;
    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(printJob.sale_id) as any[];
    
    await printReceiptSilent(sale, items, printJob.printer_name);
    updatePrintJobStatus(printQueueId, 'completed');
    
    logAuditAction(null, 'PRINT_RETRY_SUCCESS', 'print_queue', printQueueId, null, { sale_id: printJob.sale_id });
    return { success: true, message: 'Struk berhasil dicetak ulang' };
  } catch (error: any) {
    incrementPrintAttempt(printQueueId);
    updatePrintJobStatus(printQueueId, 'failed', error.message);
    
    throw new IpcError(`Gagal cetak: ${error.message}`, ERROR_CODES.SERVICE_UNAVAILABLE);
  }
}));

ipcMain.handle('printer:generatePDF', wrapIpcHandler(async (_event, saleId: number) => {
  if (!saleId || isNaN(saleId)) {
    throw new IpcError('Sale ID harus valid', ERROR_CODES.VALIDATION_ERROR);
  }

  const sale = db.prepare(`
    SELECT s.*, u.name as cashier_name 
    FROM sales s
    JOIN users u ON s.cashier_id = u.id
    WHERE s.id = ?
  `).get(saleId) as any;

  if (!sale) {
    throw new IpcError('Penjualan tidak ditemukan', ERROR_CODES.NOT_FOUND);
  }

  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId) as any[];

  try {
    // Generate HTML for PDF
    const htmlContent = generateReceiptHTML(sale, items);
    const pdfPath = getPDFPath();

    // Create a hidden window to render and print to PDF
    const pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    return new Promise((resolve, reject) => {
      pdfWindow.webContents.on('did-finish-load', () => {
        pdfWindow.webContents.printToPDF({
          pageSize: { width: 58000, height: 200000 },
          printBackground: true,
          margins: { top: 0, bottom: 0, left: 0, right: 0 }
        }).then((data: Buffer) => {
          fs.writeFileSync(pdfPath, data);
          pdfWindow.destroy();
          
          logAuditAction(null, 'RECEIPT_PDF_GENERATED', 'sales', saleId, null, { pdf_path: pdfPath });
          
          resolve({ 
            success: true, 
            message: 'PDF berhasil dibuat',
            file_path: pdfPath 
          });
        }).catch((err: any) => {
          pdfWindow.destroy();
          reject(new IpcError(`Gagal membuat PDF: ${err.message}`, ERROR_CODES.SERVICE_UNAVAILABLE));
        });
      });
    });
  } catch (error: any) {
    throw new IpcError(`Gagal generate PDF: ${error.message}`, ERROR_CODES.SERVICE_UNAVAILABLE);
  }
}));

// Background print queue worker
export function startPrintQueueWorker() {
  setInterval(() => {
    try {
      const pendingJobs = getPendingPrintJobs();
      
      for (const job of pendingJobs as any[]) {
        if (job.attempt_count >= 3) {
          updatePrintJobStatus(job.id, 'failed', 'Max attempts reached');
          continue;
        }

        try {
          const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(job.sale_id) as any;
          const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(job.sale_id) as any[];
          
          // Sync version for background worker
          printReceiptSilentSync(sale, items, job.printer_name);
          updatePrintJobStatus(job.id, 'completed');
          
          logAuditAction(null, 'PRINT_QUEUE_AUTO_RETRY_SUCCESS', 'print_queue', job.id, null, { sale_id: job.sale_id });
        } catch (error: any) {
          incrementPrintAttempt(job.id);
          console.error(`Print queue job ${job.id} failed on attempt ${job.attempt_count + 1}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Print queue worker error:', error);
    }
  }, 5000); // Check every 5 seconds
}

// Helper functions
function generateReceiptHTML(sale: any, items: any[]): string {
  const getSetting = (key: string, defaultVal: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
    return row ? row.value : defaultVal;
  };

  const storeName = getSetting('store_name', 'Toko Hasnawir');
  const storeAddress = getSetting('store_address', 'Jl. Raya Pasar UMKM No. 34');
  const storePhone = getSetting('store_phone', '0812-3456-7890');
  const receiptFooter = getSetting('receipt_footer', 'Terima Kasih!');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { size: 58mm auto; margin: 0; }
          body {
            font-family: 'Courier New', monospace;
            width: 50mm;
            margin: 0;
            padding: 4px 0 20px 0;
            font-size: 10px;
            color: #000;
            line-height: 1.25;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          .double-divider { border-top: 2px double #000; margin: 5px 0; }
          .item-row { display: flex; justify-content: space-between; }
          .item-name { word-break: break-all; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="text-center bold" style="font-size: 12px;">${storeName}</div>
        <div class="text-center">${storeAddress}</div>
        <div class="text-center">Telp: ${storePhone}</div>
        <div class="divider"></div>
        <div>Invoice : ${sale.invoice_number}</div>
        <div>Tanggal : ${new Date(sale.transaction_time).toLocaleString('id-ID')}</div>
        <div>Kasir   : ${sale.cashier_name}</div>
        ${sale.customer_name ? `<div>Pelanggan: ${sale.customer_name}</div>` : ''}
        <div class="divider"></div>
        
        ${items.map(item => `
          <div class="item-name">${item.product_name.substring(0, 32)}</div>
          <div class="item-row">
            <span>&nbsp;&nbsp;${item.quantity} x Rp ${item.sell_price.toLocaleString('id-ID')}</span>
            <span>Rp ${item.subtotal.toLocaleString('id-ID')}</span>
          </div>
          ${item.discount > 0 ? `
            <div class="item-row" style="font-size: 9px; color: #333;">
              <span>&nbsp;&nbsp;Diskon:</span>
              <span>-Rp ${item.discount.toLocaleString('id-ID')}</span>
            </div>
          ` : ''}
        `).join('')}
        
        <div class="divider"></div>
        <div class="item-row">
          <span>Subtotal:</span>
          <span>Rp ${sale.subtotal.toLocaleString('id-ID')}</span>
        </div>
        ${sale.discount > 0 ? `
          <div class="item-row">
            <span>Diskon:</span>
            <span>-Rp ${sale.discount.toLocaleString('id-ID')}</span>
          </div>
        ` : ''}
        <div class="item-row bold" style="font-size: 11px;">
          <span>TOTAL:</span>
          <span>Rp ${sale.total.toLocaleString('id-ID')}</span>
        </div>
        <div class="divider"></div>
        <div class="item-row">
          <span>Bayar (${sale.payment_method.toUpperCase()}):</span>
          <span>Rp ${sale.payment_amount.toLocaleString('id-ID')}</span>
        </div>
        ${sale.payment_method === 'cash' ? `
          <div class="item-row">
            <span>Kembali:</span>
            <span>Rp ${sale.change_amount.toLocaleString('id-ID')}</span>
          </div>
        ` : ''}
        <div class="double-divider"></div>
        <div class="text-center" style="white-space: pre-line; font-size: 9px;">${receiptFooter}</div>
      </body>
    </html>
  `;
}

function generatePlainTextReceipt(sale: any, items: any[]): string {
  const getSetting = (key: string, defaultVal: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
    return row ? row.value : defaultVal;
  };

  const storeName = getSetting('store_name', 'Toko Hasnawir');
  const storeAddress = getSetting('store_address', 'Jl. Raya Pasar UMKM No. 34');
  const storePhone = getSetting('store_phone', '0812-3456-7890');
  const receiptFooter = getSetting('receipt_footer', 'Terima Kasih!');

  const border = '========================================\n';
  const divider = '----------------------------------------\n';
  
  let text = '';
  const centerText = (str: string) => {
    const pad = Math.max(0, Math.floor((40 - str.length) / 2));
    return ' '.repeat(pad) + str + '\n';
  };

  text += centerText(storeName);
  text += centerText(storeAddress);
  text += centerText(storePhone);
  text += border;
  text += `Invoice : ${sale.invoice_number}\n`;
  text += `Tanggal : ${new Date(sale.transaction_time).toLocaleString('id-ID')}\n`;
  text += `Kasir   : ${sale.cashier_name}\n`;
  if (sale.customer_name) {
    text += `Pelang  : ${sale.customer_name}\n`;
  }
  text += divider;

  for (const item of items) {
    text += `${item.product_name.substring(0, 40)}\n`;
    const qtyStr = `  ${item.quantity} x Rp ${item.sell_price.toLocaleString('id-ID')}`;
    const subtotalStr = `Rp ${item.subtotal.toLocaleString('id-ID')}`;
    const spaces = 40 - qtyStr.length - subtotalStr.length;
    text += qtyStr + ' '.repeat(spaces > 0 ? spaces : 2) + subtotalStr + '\n';
    if (item.discount > 0) {
      text += `  Diskon: -Rp ${item.discount.toLocaleString('id-ID')}\n`;
    }
  }

  text += divider;
  const subtotalText = `Subtotal: Rp ${sale.subtotal.toLocaleString('id-ID')}`;
  text += ' '.repeat(Math.max(0, 40 - subtotalText.length)) + subtotalText + '\n';
  
  if (sale.discount > 0) {
    const discText = `Diskon: -Rp ${sale.discount.toLocaleString('id-ID')}`;
    text += ' '.repeat(Math.max(0, 40 - discText.length)) + discText + '\n';
  }

  const totalText = `TOTAL: Rp ${sale.total.toLocaleString('id-ID')}`;
  text += ' '.repeat(Math.max(0, 40 - totalText.length)) + totalText + '\n';
  text += divider;
  text += `Bayar   : Rp ${sale.payment_amount.toLocaleString('id-ID')}\n`;
  if (sale.payment_method === 'cash') {
    text += `Kembali : Rp ${sale.change_amount.toLocaleString('id-ID')}\n`;
  }
  text += `Metode  : ${sale.payment_method.toUpperCase()}\n`;
  text += border;
  
  receiptFooter.split('\n').forEach((line: string) => {
    text += centerText(line.trim());
  });

  text += '\n\n\n\n\n';
  return text;
}

async function printReceiptSilent(sale: any, items: any[], printerName?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const htmlContent = generateReceiptHTML(sale, items);

      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

      printWindow.webContents.on('did-finish-load', () => {
        printWindow.webContents.print(
          {
            silent: true,
            printBackground: true,
            deviceName: printerName || '',
            margins: { marginType: 'none' },
            pageSize: { width: 58000, height: 200000 }
          },
          (success, errorType) => {
            printWindow.destroy();
            if (success) {
              resolve();
            } else {
              reject(new Error(errorType || 'Gagal cetak'));
            }
          }
        );
      });

      setTimeout(() => {
        printWindow.destroy();
        reject(new Error('Print timeout'));
      }, 30000);
    } catch (error) {
      reject(error);
    }
  });
}

// Backward-compatibility export for sales.ts
export async function printReceiptSilentCompat(saleId: number, printerName?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const sale = db.prepare(`
      SELECT s.*, u.name as cashier_name 
      FROM sales s
      JOIN users u ON s.cashier_id = u.id
      WHERE s.id = ?
    `).get(saleId) as any;

    if (!sale) {
      return { success: false, error: 'Penjualan tidak ditemukan' };
    }

    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId) as any[];
    await printReceiptSilent(sale, items, printerName);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

function printReceiptSilentSync(sale: any, items: any[], printerName?: string): void {
  try {
    const htmlContent = generateReceiptHTML(sale, items);

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    printWindow.webContents.on('did-finish-load', () => {
      printWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: printerName || '',
          margins: { marginType: 'none' },
          pageSize: { width: 58000, height: 200000 }
        },
        (success) => {
          printWindow.destroy();
          if (!success) {
            throw new Error('Print failed');
          }
        }
      );
    });
  } catch (error) {
    throw error;
  }
}

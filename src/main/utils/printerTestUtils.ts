import db from '../db';
import path from 'path';
import fs from 'fs';

/**
 * Mock Printer Simulator for Testing
 * Simulates receipt printing for development without real hardware
 */

export class MockPrinterSimulator {
  private printedReceipts: Array<{
    id: number;
    timestamp: Date;
    printerName: string;
    receiptText: string;
    status: 'success' | 'failed';
    error?: string;
  }> = [];

  private simulatedPrinters = [
    { name: 'Virtual_Thermal_58mm', status: 'ready', isDefault: true },
    { name: 'Virtual_Thermal_80mm', status: 'ready', isDefault: false },
    { name: 'Network_Printer', status: 'offline', isDefault: false }
  ];

  constructor() {}

  /**
   * Simulate getting available printers
   */
  getPrinters() {
    return this.simulatedPrinters;
  }

  /**
   * Simulate printing to a specific printer
   */
  async printReceipt(printerName: string, receiptText: string): Promise<boolean> {
    const printer = this.simulatedPrinters.find(p => p.name === printerName);
    if (!printer) {
      throw new Error(`Printer "${printerName}" not found`);
    }

    if (printer.status !== 'ready') {
      throw new Error(`Printer "${printerName}" is offline`);
    }

    // Simulate random print failures (10% failure rate for testing)
    if (Math.random() < 0.1) {
      this.printedReceipts.push({
        id: this.printedReceipts.length + 1,
        timestamp: new Date(),
        printerName,
        receiptText,
        status: 'failed',
        error: 'Simulated printer error'
      });
      throw new Error('Simulated printer error');
    }

    this.printedReceipts.push({
      id: this.printedReceipts.length + 1,
      timestamp: new Date(),
      printerName,
      receiptText,
      status: 'success'
    });

    return true;
  }

  /**
   * Get all printed receipts for inspection
   */
  getPrintedReceipts() {
    return this.printedReceipts;
  }

  /**
   * Clear print history
   */
  clearHistory() {
    this.printedReceipts = [];
  }

  /**
   * Simulate printer status change
   */
  setPrinterStatus(printerName: string, status: 'ready' | 'offline') {
    const printer = this.simulatedPrinters.find(p => p.name === printerName);
    if (printer) {
      printer.status = status;
    }
  }

  /**
   * Save printed receipts to file for review
   */
  savePrintHistory(filepath: string) {
    fs.writeFileSync(
      filepath,
      JSON.stringify(this.printedReceipts, null, 2)
    );
  }
}

/**
 * Create a test sale and verify print queue
 */
export function createTestSale() {
  const saleData = {
    cashier_id: 1,
    shift_id: 1,
    customer_id: null,
    items: [
      { product_id: 1, quantity: 2, sell_price: 75000, discount: 0 },
      { product_id: 5, quantity: 1, sell_price: 18000, discount: 0 }
    ],
    discount: 0,
    payment_method: 'cash',
    payment_amount: 168000,
    change_amount: 0
  };

  // Insert sale
  const invoiceNumber = `TEST-${Date.now()}`;
  const result = db.prepare(`
    INSERT INTO sales (
      invoice_number, cashier_id, shift_id, customer_id,
      subtotal, discount, total, payment_method, payment_amount, change_amount
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    invoiceNumber,
    saleData.cashier_id,
    saleData.shift_id,
    saleData.customer_id,
    168000,
    saleData.discount,
    168000,
    saleData.payment_method,
    saleData.payment_amount,
    saleData.change_amount
  );

  const saleId = result.lastInsertRowid as number;

  // Insert sale items
  const insertItem = db.prepare(`
    INSERT INTO sale_items (sale_id, product_id, quantity, sell_price, subtotal, discount)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const item of saleData.items) {
    insertItem.run(
      saleId,
      item.product_id,
      item.quantity,
      item.sell_price,
      item.quantity * item.sell_price,
      item.discount
    );
  }

  return { saleId, invoiceNumber };
}

/**
 * Verify print queue entry
 */
export function verifyPrintQueueEntry(printQueueId: number) {
  const entry = db.prepare(`
    SELECT pq.*, s.invoice_number
    FROM print_queue pq
    JOIN sales s ON pq.sale_id = s.id
    WHERE pq.id = ?
  `).get(printQueueId) as any;

  return entry;
}

/**
 * Get all print queue entries
 */
export function getPrintQueueEntries() {
  return db.prepare(`
    SELECT pq.*, s.invoice_number
    FROM print_queue pq
    JOIN sales s ON pq.sale_id = s.id
    ORDER BY pq.created_at DESC
    LIMIT 50
  `).all();
}

/**
 * Generate test report
 */
export function generatePrinterTestReport(simulator: MockPrinterSimulator) {
  const printedReceipts = simulator.getPrintedReceipts();
  const queueEntries = getPrintQueueEntries();

  return {
    timestamp: new Date().toISOString(),
    totalReceipts: printedReceipts.length,
    successCount: printedReceipts.filter(r => r.status === 'success').length,
    failureCount: printedReceipts.filter(r => r.status === 'failed').length,
    successRate: printedReceipts.length > 0 
      ? (printedReceipts.filter(r => r.status === 'success').length / printedReceipts.length * 100).toFixed(2) + '%'
      : 'N/A',
    queueStatus: {
      total: queueEntries.length,
      pending: (queueEntries as any[]).filter(e => e.status === 'pending').length,
      completed: (queueEntries as any[]).filter(e => e.status === 'completed').length,
      failed: (queueEntries as any[]).filter(e => e.status === 'failed').length
    },
    printedReceipts,
    queueEntries
  };
}

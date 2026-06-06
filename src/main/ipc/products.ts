import { ipcMain } from 'electron';
import db from '../db';
import { wrapIpcHandler, IpcError, ERROR_CODES } from '../utils/ipcErrorHandler';

// Product cache for barcode lookup performance (debounced)
const productCache = new Map<string, any>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let cacheRefreshTimer: NodeJS.Timeout;

function setProductCache(barcode: string, product: any) {
  productCache.set(barcode, { data: product, timestamp: Date.now() });
  
  clearTimeout(cacheRefreshTimer);
  cacheRefreshTimer = setTimeout(() => {
    productCache.clear();
  }, CACHE_TTL);
}

function getProductFromCache(barcode: string): any | null {
  const cached = productCache.get(barcode);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  productCache.delete(barcode);
  return null;
}

ipcMain.handle('products:search', wrapIpcHandler(async (_event, query: string) => {
  if (!query || query.trim() === '') {
    return [];
  }
  const searchTerm = `%${query.trim()}%`;
  const products = db.prepare(`
    SELECT * FROM products 
    WHERE (barcode = ? OR sku LIKE ? OR name LIKE ?) AND active = 1
    LIMIT 30
  `).all(query.trim(), searchTerm, searchTerm);
  return products;
}));

ipcMain.handle('products:getByBarcode', wrapIpcHandler(async (_event, barcode: string) => {
  // Check cache first
  const cached = getProductFromCache(barcode);
  if (cached) {
    return cached;
  }
  
  const product = db.prepare('SELECT * FROM products WHERE barcode = ? AND active = 1').get(barcode);
  if (product) {
    setProductCache(barcode, product);
  }
  return product || null;
}));

ipcMain.handle('products:getAll', wrapIpcHandler(async () => {
  return db.prepare('SELECT * FROM products ORDER BY name ASC').all();
}));

ipcMain.handle('products:create', wrapIpcHandler(async (_event, product: any) => {
  const { sku, name, barcode, category, sell_price, cost_price, stock } = product;
  
  // Validation
  const errors: Record<string, string> = {};
  if (!sku) errors.sku = 'SKU is required';
  if (!name) errors.name = 'Name is required';
  if (!barcode) errors.barcode = 'Barcode is required';
  if (!category) errors.category = 'Category is required';
  if (isNaN(sell_price)) errors.sell_price = 'Sell price must be a number';
  if (isNaN(cost_price)) errors.cost_price = 'Cost price must be a number';
  if (isNaN(stock)) errors.stock = 'Stock must be a number';
  
  if (Object.keys(errors).length > 0) {
    throw new IpcError('Validation error', ERROR_CODES.VALIDATION_ERROR, errors);
  }
  
  const stmt = db.prepare(`
    INSERT INTO products (sku, name, barcode, category, sell_price, cost_price, stock)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const runCreate = db.transaction(() => {
    const res = stmt.run(sku, name, barcode, category, sell_price, cost_price, stock);
    const productId = res.lastInsertRowid;
    
    db.prepare(`
      INSERT INTO stock_cards (product_id, type, reference_id, qty_change, qty_balance, reason)
      VALUES (?, 'manual_in', 'MANUAL_CREATE', ?, ?, 'Initial product creation')
    `).run(productId, stock, stock);
    
    const syncPayload = JSON.stringify({ sku, name, barcode, category, sell_price, cost_price, stock });
    db.prepare(`
      INSERT INTO sync_events (event_type, payload, idempotency_key)
      VALUES ('product.create', ?, ?)
    `).run(syncPayload, `prod_create_${sku}_${Date.now()}`);
    
    return productId;
  });

  const newId = runCreate();
  productCache.clear(); // Invalidate cache
  return { id: newId, sku, name, barcode };
}));

ipcMain.handle('products:update', wrapIpcHandler(async (_event, id: number, product: any) => {
  const { sku, name, barcode, category, sell_price, cost_price, stock, active, adjustmentReason } = product;
  
  const current = db.prepare('SELECT stock, sku, barcode FROM products WHERE id = ?').get(id) as any;
  if (!current) {
    throw new IpcError('Product not found', ERROR_CODES.NOT_FOUND);
  }

  const runUpdate = db.transaction(() => {
    db.prepare(`
      UPDATE products 
      SET sku = ?, name = ?, barcode = ?, category = ?, sell_price = ?, cost_price = ?, stock = ?, active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(sku, name, barcode, category, sell_price, cost_price, stock, active, id);

    const diff = stock - current.stock;
    if (diff !== 0) {
      db.prepare(`
        INSERT INTO stock_cards (product_id, type, reference_id, qty_change, qty_balance, reason)
        VALUES (?, 'adjustment', ?, ?, ?, ?)
      `).run(id, 'MANUAL_ADJUSTMENT', diff, stock, adjustmentReason || 'Manual adjustment');
    }

    const syncPayload = JSON.stringify({ id, sku, name, barcode, category, sell_price, cost_price, stock, active });
    db.prepare(`
      INSERT INTO sync_events (event_type, payload, idempotency_key)
      VALUES ('product.update', ?, ?)
    `).run(syncPayload, `prod_update_${sku}_${Date.now()}`);
  });

  runUpdate();
  productCache.delete(current.barcode); // Invalidate cache for old barcode
  productCache.delete(barcode); // Invalidate cache for new barcode
  return { id, sku, name, barcode };
}));

ipcMain.handle('products:importCsv', async (_event, productsList: any[]) => {
  try {
    const runImport = db.transaction(() => {
      const checkProduct = db.prepare('SELECT id, stock FROM products WHERE sku = ? OR barcode = ?');
      
      const insertProduct = db.prepare(`
        INSERT INTO products (sku, name, barcode, category, sell_price, cost_price, stock)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const updateProduct = db.prepare(`
        UPDATE products 
        SET name = ?, category = ?, sell_price = ?, cost_price = ?, stock = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      const insertStockCard = db.prepare(`
        INSERT INTO stock_cards (product_id, type, reference_id, qty_change, qty_balance, reason)
        VALUES (?, 'manual_in', 'CSV_IMPORT', ?, ?, 'Stock updated via CSV import')
      `);

      let inserted = 0;
      let updated = 0;

      for (const p of productsList) {
        const { sku, name, barcode, category, sell_price, cost_price, stock } = p;
        if (!sku || !name || !barcode) continue;

        const existing = checkProduct.get(sku, barcode) as any;
        if (existing) {
          updateProduct.run(name, category, sell_price, cost_price, stock, existing.id);
          
          const diff = stock - existing.stock;
          if (diff !== 0) {
            insertStockCard.run(existing.id, diff, stock);
          }
          updated++;
        } else {
          const result = insertProduct.run(sku, name, barcode, category, sell_price, cost_price, stock);
          const productId = result.lastInsertRowid;
          insertStockCard.run(productId, stock, stock);
          inserted++;
        }
      }

      const syncPayload = JSON.stringify({ count: productsList.length, timestamp: Date.now() });
      db.prepare(`
        INSERT INTO sync_events (event_type, payload, idempotency_key)
        VALUES ('products.bulk_import', ?, ?)
      `).run(syncPayload, `bulk_import_${Date.now()}`);

      return { inserted, updated };
    });

    const summary = runImport();
    return { success: true, ...summary };
  } catch (error: any) {
    console.error('Error importing CSV:', error);
    return { success: false, error: error.message };
  }
});

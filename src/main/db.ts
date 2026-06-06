import { app } from 'electron';
import Database from 'better-sqlite3';
import path from 'path';

let dbPath: string;
if (app) {
  const isDev = !app.isPackaged;
  dbPath = isDev 
    ? path.join(process.cwd(), 'retail-pos.db')
    : path.join(app.getPath('userData'), 'retail-pos.db');
} else {
  dbPath = path.join(process.cwd(), 'retail-pos.db');
}

console.log(`Database path: ${dbPath}`);
const db = new Database(dbPath, { verbose: console.log });

// Enable foreign keys
db.pragma('foreign_keys = ON');

export function initDatabase() {
  // 1. Users/Cashiers Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin', 'cashier')) NOT NULL DEFAULT 'cashier',
        pin TEXT NOT NULL,
        active INTEGER CHECK(active IN (0, 1)) NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 1b. Categories Table (hierarchical)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL,
        parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        sort_order INTEGER DEFAULT 0,
        icon VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 2. Products Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        barcode TEXT UNIQUE NOT NULL,
        category TEXT NOT NULL,
        category_id INTEGER REFERENCES categories(id),
        unit VARCHAR(20) DEFAULT 'pcs',
        sell_price DECIMAL(12, 2) NOT NULL,
        cost_price DECIMAL(12, 2) NOT NULL,
        wholesale_price DECIMAL(12, 2),
        promo_price DECIMAL(12, 2),
        promo_start DATE,
        promo_end DATE,
        stock DECIMAL(12, 2) NOT NULL DEFAULT 0,
        min_stock DECIMAL(12, 2) DEFAULT 5,
        photo_path VARCHAR(255),
        active INTEGER CHECK(active IN (0, 1)) NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Handle migration for products table (adding new columns if they don't exist)
  const productCols = [
    { name: 'category_id', type: 'INTEGER REFERENCES categories(id)' },
    { name: 'unit', type: "VARCHAR(20) DEFAULT 'pcs'" },
    { name: 'wholesale_price', type: 'DECIMAL(12, 2)' },
    { name: 'promo_price', type: 'DECIMAL(12, 2)' },
    { name: 'promo_start', type: 'DATE' },
    { name: 'promo_end', type: 'DATE' },
    { name: 'min_stock', type: 'DECIMAL(12, 2) DEFAULT 5' },
    { name: 'photo_path', type: 'VARCHAR(255)' }
  ];
  for (const col of productCols) {
    try {
      db.prepare(`ALTER TABLE products ADD COLUMN ${col.name} ${col.type}`).run();
    } catch (e) {
      // Column already exists
    }
  }

  // Indexing for faster scan search
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`).run();

  // 2b. Customers Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        address TEXT,
        credit_limit DECIMAL(12, 2) DEFAULT 0,
        total_debt DECIMAL(12, 2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active', 'blocked')),
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 3. Shifts Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cashier_id INTEGER NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        start_cash DECIMAL(12, 2) NOT NULL,
        end_cash_expected DECIMAL(12, 2),
        end_cash_actual DECIMAL(12, 2),
        cash_difference DECIMAL(12, 2),
        status TEXT CHECK(status IN ('open', 'closed')) NOT NULL DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(cashier_id) REFERENCES users(id)
    )
  `).run();

  // 4. Shift Transactions (Cash In / Cash Out)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS shift_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shift_id INTEGER NOT NULL,
        type TEXT CHECK(type IN ('cash_in', 'cash_out')) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        reason TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(shift_id) REFERENCES shifts(id)
    )
  `).run();

  // 5. Sales Table (Extended with customer_id and new payment methods)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT UNIQUE NOT NULL,
        cashier_id INTEGER NOT NULL,
        shift_id INTEGER NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        customer_name TEXT,
        subtotal DECIMAL(12, 2) NOT NULL,
        discount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        total DECIMAL(12, 2) NOT NULL,
        payment_method TEXT CHECK(payment_method IN ('cash', 'transfer', 'qris', 'debt', 'installment', 'split')) NOT NULL,
        payment_amount DECIMAL(12, 2) NOT NULL,
        change_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        idempotency_key TEXT UNIQUE NOT NULL,
        transaction_time DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(cashier_id) REFERENCES users(id),
        FOREIGN KEY(shift_id) REFERENCES shifts(id)
    )
  `).run();

  // Handle migration for sales table (adding new columns and altering constraints)
  const salesCols = [
    { name: 'customer_id', type: 'INTEGER REFERENCES customers(id)' }
  ];
  for (const col of salesCols) {
    try {
      db.prepare(`ALTER TABLE sales ADD COLUMN ${col.name} ${col.type}`).run();
    } catch (e) {
      // Column already exists
    }
  }

  // 6. Sale Items Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        product_sku TEXT NOT NULL,
        product_name TEXT NOT NULL,
        sell_price DECIMAL(12, 2) NOT NULL,
        cost_price DECIMAL(12, 2) NOT NULL,
        quantity DECIMAL(12, 2) NOT NULL,
        discount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        subtotal DECIMAL(12, 2) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(sale_id) REFERENCES sales(id),
        FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `).run();

  // 7. Stock Cards Table (Inventory Audit Log)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS stock_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        type TEXT CHECK(type IN ('sale', 'manual_in', 'adjustment', 'return')) NOT NULL,
        reference_id TEXT NOT NULL,
        qty_change DECIMAL(12, 2) NOT NULL,
        qty_balance DECIMAL(12, 2) NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `).run();

  // 7b. Debts Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS debts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        transaction_id INTEGER REFERENCES sales(id),
        amount DECIMAL(12, 2) NOT NULL,
        paid_amount DECIMAL(12, 2) DEFAULT 0,
        remaining DECIMAL(12, 2) NOT NULL,
        due_date DATE,
        status VARCHAR(20) DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid')),
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 7c. Installments Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS installments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
        sequence_no INTEGER NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        due_date DATE,
        paid_at DATETIME,
        paid_amount DECIMAL(12, 2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
        collected_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 7d. Debt Payments Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS debt_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        debt_id INTEGER NOT NULL REFERENCES debts(id),
        installment_id INTEGER REFERENCES installments(id),
        amount DECIMAL(12, 2) NOT NULL,
        payment_method VARCHAR(20) DEFAULT 'cash',
        collected_by INTEGER REFERENCES users(id),
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 7e. Settings Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 8. Sync Events Table (Outbox Queue)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sync_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        status TEXT CHECK(status IN ('pending', 'processing', 'completed', 'failed')) NOT NULL DEFAULT 'pending',
        error_message TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 9. Audit Logs Table (Security & compliance logging)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        action TEXT NOT NULL,
        table_name TEXT,
        record_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        ip_address TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 10. Print Queue Table (Print job management with offline retry support)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS print_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL REFERENCES sales(id),
        printer_name TEXT,
        receipt_text TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        attempt_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
    )
  `).run();

  // Create indexes for better performance
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_stock_cards_product ON stock_cards(product_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_debts_customer ON debts(customer_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sync_events_status ON sync_events(status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_print_queue_sale ON print_queue(sale_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status)`).run();

  seedData();
}

function seedData() {
  // Check if users exist
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
  if (userCount === 0) {
    console.log('Seeding default users...');
    const insertUser = db.prepare(`
      INSERT INTO users (username, name, role, pin, active)
      VALUES (?, ?, ?, ?, 1)
    `);
    
    insertUser.run('admin', 'Administrator', 'admin', '9999');
    insertUser.run('kasir1', 'Hasnawir', 'cashier', '1234');
    insertUser.run('kasir2', 'Roid Taqi', 'cashier', '5678');
  }

  db.prepare('UPDATE users SET name = ? WHERE username = ?').run('Hasnawir', 'kasir1');
  db.prepare('UPDATE users SET name = ? WHERE username = ?').run('Roid Taqi', 'kasir2');

  // Check if categories exist
  const categoryCount = (db.prepare('SELECT COUNT(*) as count FROM categories').get() as any).count;
  if (categoryCount === 0) {
    console.log('Seeding default categories...');
    const insertCat = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)');
    const categories = [
      'Beras & Pokok', 'Minyak & Margarin', 'Gula & Bumbu', 'Tepung & Bahan',
      'Telur & Susu', 'Mie & Instan', 'Kopi & Teh', 'Minuman Ringan',
      'Sabun & Mandi', 'Kebutuhan Rumah'
    ];
    categories.forEach((cat, idx) => {
      insertCat.run(cat, idx);
    });
  }

  // Load categories map
  const cats = db.prepare('SELECT id, name FROM categories').all() as any[];
  const catMap = new Map<string, number>(cats.map(c => [c.name, c.id]));

  // Check if products exist
  const productCount = (db.prepare('SELECT COUNT(*) as count FROM products').get() as any).count;
  if (productCount === 0) {
    console.log('Seeding products...');
    const insertProduct = db.prepare(`
      INSERT INTO products (sku, name, barcode, category, category_id, sell_price, cost_price, stock, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const sembakoProducts = [
      // Beras (1 - 5)
      ['BRS001', 'Beras Rojolele premium 5kg', '8999999000010', 'Beras & Pokok', 75000, 68000, 45],
      ['BRS002', 'Beras Pandan Wangi 5kg', '8999999000027', 'Beras & Pokok', 85000, 77000, 30],
      ['BRS003', 'Beras C4 Cianjur 10kg', '8999999000034', 'Beras & Pokok', 145000, 132000, 20],
      ['BRS004', 'Beras Merah Organik 1kg', '8999999000041', 'Beras & Pokok', 25000, 21000, 15],
      ['BRS005', 'Beras Ketan Putih 1kg', '8999999000058', 'Beras & Pokok', 18000, 15000, 25],
      
      // Minyak Goreng & Margarin (6 - 12)
      ['MYK001', 'Minyak Goreng Bimoli 2L', '8999999000065', 'Minyak & Margarin', 38000, 34000, 80],
      ['MYK002', 'Minyak Goreng Filma 2L', '8999999000072', 'Minyak & Margarin', 37500, 33500, 50],
      ['MYK003', 'Minyak Goreng Sania 1L', '8999999000089', 'Minyak & Margarin', 19500, 17500, 100],
      ['MYK004', 'Minyak Goreng Fortune 2L', '8999999000096', 'Minyak & Margarin', 36500, 32500, 60],
      ['MYK005', 'Minyak Goreng Kita 1L', '8999999000102', 'Minyak & Margarin', 14000, 12500, 120],
      ['MGR001', 'Blue Band Serbaguna 200g', '8999999000119', 'Minyak & Margarin', 9500, 8000, 150],
      ['MGR002', 'Simas Margarin 200g', '8999999000126', 'Minyak & Margarin', 7000, 5800, 90],

      // Gula & Garam & Pemanis (13 - 17)
      ['GUL001', 'Gulaku Gula Pasir Putih 1kg', '8999999000133', 'Gula & Bumbu', 17500, 15500, 100],
      ['GUL002', 'Gula Merah Aren Premium 500g', '8999999000140', 'Gula & Bumbu', 15000, 12500, 40],
      ['GRM001', 'Garam Dapur Cap Kapal 250g', '8999999000157', 'Gula & Bumbu', 3000, 2200, 200],
      ['GRM002', 'Garam Refina Halus 500g', '8999999000164', 'Gula & Bumbu', 6500, 5200, 100],
      ['PEM001', 'Kecap Manis Bango 520ml', '8999999000171', 'Gula & Bumbu', 24000, 21500, 70],

      // Tepung & Bahan Kue (18 - 22)
      ['TPG001', 'Tepung Terigu Segitiga Biru 1kg', '8999999000188', 'Tepung & Bahan', 13000, 11500, 110],
      ['TPG002', 'Tepung Terigu Cakra Kembar 1kg', '8999999000195', 'Tepung & Bahan', 14000, 12200, 80],
      ['TPG003', 'Tepung Kunci Biru 1kg', '8999999000201', 'Tepung & Bahan', 13500, 11800, 50],
      ['TPG004', 'Tepung Tapioka Rose Brand 500g', '8999999000218', 'Tepung & Bahan', 8500, 7000, 95],
      ['TPG005', 'Tepung Beras Rose Brand 500g', '8999999000225', 'Tepung & Bahan', 9000, 7500, 60],

      // Telur & Susu (23 - 27)
      ['TLR001', 'Telur Ayam Negeri 1kg', '8999999000232', 'Telur & Susu', 29000, 26000, 50],
      ['SSU001', 'Susu Kental Manis Frisian Flag 370g', '8999999000249', 'Telur & Susu', 12500, 10800, 120],
      ['SSU002', 'Susu UHT Ultra Milk Cokelat 1L', '8999999000256', 'Telur & Susu', 19500, 17200, 64],
      ['SSU003', 'Susu UHT Ultra Milk Full Cream 1L', '8999999000263', 'Telur & Susu', 19000, 16800, 80],
      ['SSU004', 'Susu Bubuk Dancow Fortigro 800g', '8999999000270', 'Telur & Susu', 92000, 84000, 30],

      // Mie Instan & Pasta (28 - 34)
      ['MIE001', 'Indomie Goreng Spesial', '8999999000287', 'Mie & Instan', 3500, 2950, 400],
      ['MIE002', 'Indomie Kuah Rasa Soto Mie', '8999999000294', 'Mie & Instan', 3300, 2750, 350],
      ['MIE003', 'Indomie Kuah Rasa Ayam Bawang', '8999999000300', 'Mie & Instan', 3300, 2750, 300],
      ['MIE004', 'Indomie Kuah Kari Ayam', '8999999000317', 'Mie & Instan', 3600, 3050, 250],
      ['MIE005', 'Mie Sedaap Goreng', '8999999000324', 'Mie & Instan', 3400, 2850, 300],
      ['MIE006', 'Supermi Rasa Ayam Bawang', '8999999000331', 'Mie & Instan', 3100, 2600, 150],
      ['MIE007', 'Sarimi Isi 2 Goreng Kecap', '8999999000348', 'Mie & Instan', 4800, 4100, 200],

      // Kopi & Teh & Minuman Seduh (35 - 40)
      ['KPI001', 'Kopi Kapal Api Spesial Mix 20g x 10', '8999999000355', 'Kopi & Teh', 14500, 12500, 85],
      ['KPI002', 'Luwak White Koffie 20g x 10', '8999999000362', 'Kopi & Teh', 16000, 14000, 70],
      ['KPI003', 'Kopi Nescafe Classic Jar 100g', '8999999000379', 'Kopi & Teh', 42000, 37000, 35],
      ['TEH001', 'Teh Celup Sariwangi isi 25', '8999999000386', 'Kopi & Teh', 7500, 6200, 110],
      ['TEH002', 'Teh Bendera Bubuk 50g', '8999999000393', 'Kopi & Teh', 4000, 3100, 90],
      ['TEH003', 'Sariwangi Teh Tarik 20g x 4', '8999999000409', 'Kopi & Teh', 11500, 9800, 50],

      // Minuman Dingin / Botol (41 - 45)
      ['MNM001', 'Air Mineral Aqua 600ml', '8999999000416', 'Minuman Ringan', 3500, 2500, 240],
      ['MNM002', 'Air Mineral Aqua 1.5L', '8999999000423', 'Minuman Ringan', 6500, 4800, 120],
      ['MNM003', 'Teh Pucuk Harum 350ml', '8999999000430', 'Minuman Ringan', 4000, 2900, 180],
      ['MNM004', 'Coca Cola Botol 390ml', '8999999000447', 'Minuman Ringan', 5500, 4300, 96],
      ['MNM005', 'Pocari Sweat Botol 500ml', '8999999000454', 'Minuman Ringan', 8000, 6700, 100],

      // Sabun, Sampo, & Kebersihan (46 - 52)
      ['SBN001', 'Sabun Lifebuoy Merah 85g', '8999999000461', 'Sabun & Mandi', 4500, 3600, 150],
      ['SBN002', 'Sabun Mandi Lux Cair Refill 400ml', '8999999000478', 'Sabun & Mandi', 26000, 22200, 60],
      ['SMP001', 'Sunsilk Black Shine Sampo 160ml', '8999999000485', 'Sabun & Mandi', 22500, 19200, 48],
      ['SMP002', 'Pantene Anti Dandruff Sampo 150ml', '8999999000492', 'Sabun & Mandi', 24000, 20500, 40],
      ['SBN003', 'Pasta Gigi Pepsodent J Jumbo 225g', '8999999000508', 'Sabun & Mandi', 15500, 13100, 75],
      ['DET001', 'Rinso Bubuk Anti Noda 770g', '8999999000515', 'Kebutuhan Rumah', 28500, 25000, 36],
      ['DET002', 'Sunlight Pencuci Piring Jeruk Nipis 755ml', '8999999000522', 'Kebutuhan Rumah', 17000, 14500, 80]
    ];

    for (const prod of sembakoProducts) {
      const categoryId = catMap.get(prod[3] as string) || null;
      insertProduct.run(
        prod[0], prod[1], prod[2], prod[3], categoryId,
        prod[4], prod[5], prod[6]
      );
    }
    
    // Create initial stock card entries for these items
    const insertedProds = db.prepare('SELECT id, stock FROM products').all() as any[];
    const insertStockCard = db.prepare(`
      INSERT INTO stock_cards (product_id, type, reference_id, qty_change, qty_balance, reason)
      VALUES (?, 'manual_in', 'SEED_DATA', ?, ?, 'Initial seeding stock')
    `);

    const runSeedStockCards = db.transaction(() => {
      for (const p of insertedProds) {
        insertStockCard.run(p.id, p.stock, p.stock);
      }
    });
    runSeedStockCards();
  }

  // Check if customers exist
  const customerCount = (db.prepare('SELECT COUNT(*) as count FROM customers').get() as any).count;
  if (customerCount === 0) {
    console.log('Seeding default customers...');
    const insertCust = db.prepare(`
      INSERT INTO customers (name, phone, address, credit_limit, total_debt, status, notes)
      VALUES (?, ?, ?, ?, 0, 'active', ?)
    `);
    insertCust.run('Basnawir', '081234567890', 'Jl. Kenanga No. 12, Samarinda', 1000000, 'Pelanggan setia');
    insertCust.run('Kiting', '085678901234', 'Jl. Melati No. 5, Samarinda', 500000, 'Tetangga sebelah');
    insertCust.run('Toko Tekad Mandiri', '089912345678', 'Jl. Pasar Pagi No. 45, Samarinda', 2000000, 'Pemilik Warung Makan');
  }

  const renameCustomer = db.prepare('UPDATE customers SET name = ? WHERE name = ?');
  renameCustomer.run('Basnawir', 'Budi Handoko');
  renameCustomer.run('Kiting', 'Siti Rahma');
  renameCustomer.run('Toko Tekad Mandiri', 'Warung Makan Barokah');

  // Check if settings exist
  const settingsCount = (db.prepare('SELECT COUNT(*) as count FROM settings').get() as any).count;
  if (settingsCount === 0) {
    console.log('Seeding default settings...');
    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    insertSetting.run('store_name', 'Toko Hasnawir');
    insertSetting.run('store_address', 'Jl. Raya Pasar UMKM No. 34, Samarinda');
    insertSetting.run('store_phone', '0812-3456-7890');
    insertSetting.run('tax_enabled', 'false');
    insertSetting.run('tax_percent', '0');
    insertSetting.run('currency', 'IDR');
    insertSetting.run('qris_static_payload', '');
    insertSetting.run('receipt_footer', 'Terima Kasih Atas Kunjungan Anda!\nBarang Yang Sudah Dibeli Tidak Dapat Ditukar');
    insertSetting.run('sync_enabled', 'true');
    insertSetting.run('terminal_id', 'TERM-001');
    insertSetting.run('is_lan_server', 'true');
    insertSetting.run('monitoring_enabled', 'true');
    insertSetting.run('monitoring_port', '3030');
    insertSetting.run('monitoring_token', `monitor-${Math.random().toString(36).slice(2, 10)}`);
    insertSetting.run('cloud_sync_url', '');
    insertSetting.run('cloud_sync_token', '');
  }

  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('store_name', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `).run('Toko Hasnawir');

  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('qris_static_payload', '', CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO NOTHING
  `).run();

  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('monitoring_enabled', 'true', CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO NOTHING
  `).run();

  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('monitoring_port', '3030', CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO NOTHING
  `).run();

  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('monitoring_token', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO NOTHING
  `).run(`monitor-${Math.random().toString(36).slice(2, 10)}`);

  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('cloud_sync_url', '', CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO NOTHING
  `).run();

  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('cloud_sync_token', '', CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO NOTHING
  `).run();
}

// Export database client for other query handlers
export default db;

// Utility function for audit logging
export function logAuditAction(userId: number | null, action: string, tableName: string | null, recordId: number | null, oldValues: any = null, newValues: any = null) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      action,
      tableName,
      recordId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null
    );
  } catch (error) {
    console.error('Failed to log audit action:', error);
  }
}

// Utility function for generating daily invoice number
export function generateInvoiceNumber(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const lastInvoice = db.prepare(`
    SELECT invoice_number FROM sales 
    WHERE invoice_number LIKE ? 
    ORDER BY id DESC LIMIT 1
  `).get(`INV-${dateStr}-%`) as any;
  
  let nextNum = 1;
  if (lastInvoice) {
    const parts = lastInvoice.invoice_number.split('-');
    nextNum = parseInt(parts[3]) + 1;
  }
  
  return `INV-${dateStr}-${String(nextNum).padStart(4, '0')}`;
}

// Standard error response format
export function createErrorResponse(message: string, code: string = 'INTERNAL_ERROR', errors?: Record<string, any>) {
  return {
    success: false,
    message,
    code,
    ...(errors && { errors })
  };
}

// Standard success response format
export function createSuccessResponse(data: any, message: string = 'Success') {
  return {
    success: true,
    message,
    data
  };
}

// Print queue utility functions
export function enqueuePrintJob(saleId: number, receiptText: string, printerName?: string) {
  try {
    const result = db.prepare(`
      INSERT INTO print_queue (sale_id, printer_name, receipt_text, status)
      VALUES (?, ?, ?, 'pending')
    `).run(saleId, printerName || 'default', receiptText);
    
    return result.lastInsertRowid;
  } catch (error) {
    console.error('Failed to enqueue print job:', error);
    throw error;
  }
}

export function updatePrintJobStatus(printQueueId: number, status: 'pending' | 'completed' | 'failed', errorMessage?: string) {
  try {
    const update = {
      status,
      updated_at: new Date().toISOString(),
      ...(status === 'completed' && { completed_at: new Date().toISOString() }),
      ...(errorMessage && { error_message: errorMessage })
    };

    db.prepare(`
      UPDATE print_queue 
      SET status = ?, updated_at = ?, completed_at = ?, error_message = ?
      WHERE id = ?
    `).run(status, update.updated_at, update.completed_at || null, errorMessage || null, printQueueId);

    logAuditAction(null, 'PRINT_JOB_' + status.toUpperCase(), 'print_queue', printQueueId, null, update);
  } catch (error) {
    console.error('Failed to update print job status:', error);
  }
}

export function incrementPrintAttempt(printQueueId: number) {
  try {
    db.prepare(`
      UPDATE print_queue 
      SET attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(printQueueId);
  } catch (error) {
    console.error('Failed to increment print attempt:', error);
  }
}

export function getPendingPrintJobs() {
  try {
    return db.prepare(`
      SELECT * FROM print_queue 
      WHERE status = 'pending' AND attempt_count < 3
      ORDER BY created_at ASC
    `).all();
  } catch (error) {
    console.error('Failed to get pending print jobs:', error);
    return [];
  }
}

export function getPrintQueueStatus() {
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
      FROM print_queue
    `).get() as any;

    return stats;
  } catch (error) {
    console.error('Failed to get print queue status:', error);
    return { total: 0, pending_count: 0, completed_count: 0, failed_count: 0 };
  }
}

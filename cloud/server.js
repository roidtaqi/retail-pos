import express from 'express';
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const syncToken = process.env.SYNC_TOKEN || '';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || process.env.DASHBOARD_PASSWORD || syncToken;
const sessionSecret = process.env.SESSION_SECRET || syncToken || adminPassword;
const sessionCookieName = 'retail_pos_admin';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';
  return cookies
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || '';
}

function signSession(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('hex');
}

function createSessionValue(username) {
  const payload = Buffer.from(JSON.stringify({
    username,
    exp: Date.now() + 1000 * 60 * 60 * 24
  })).toString('base64url');
  return `${payload}.${signSession(payload)}`;
}

function readSession(req) {
  const value = getCookie(req, sessionCookieName);
  const [payload, signature] = value.split('.');
  if (!payload || !signature || signature !== signSession(payload)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session?.username || !session?.exp || session.exp < Date.now()) return null;
    return session;
  } catch (_error) {
    return null;
  }
}

function setSessionCookie(res, username) {
  res.cookie(sessionCookieName, createSessionValue(username), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24
  });
}

function clearSessionCookie(res) {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax'
  });
}

function loginHtml(error = '') {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Login Admin Dashboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7f9; color: #17202a; padding: 20px; }
    main { width: min(420px, 100%); background: #fff; border: 1px solid #dfe5eb; border-radius: 8px; padding: 22px; }
    h1 { margin: 0 0 6px; font-size: 21px; }
    p { margin: 0 0 18px; color: #637381; line-height: 1.5; }
    form { display: grid; gap: 12px; }
    label { display: grid; gap: 5px; color: #637381; font-size: 12px; font-weight: 900; text-transform: uppercase; }
    input, button { border: 1px solid #cfd8e3; border-radius: 6px; padding: 11px 12px; font: inherit; min-height: 42px; }
    input { background: #fff; color: #17202a; }
    button { cursor: pointer; background: #166534; color: #fff; border-color: #166534; font-weight: 800; }
    .error { margin-bottom: 12px; padding: 10px 12px; border-radius: 6px; background: #fee2e2; color: #b42318; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>Login Admin</h1>
    <p>Masuk untuk membuka dashboard online Toko Hasnawir.</p>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="post" action="/login">
      <label>Username<input name="username" autocomplete="username" required autofocus /></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
      <button type="submit">Masuk</button>
    </form>
  </main>
</body>
</html>`;
}

function requireSyncToken(req, res, next) {
  if (!syncToken) return next();
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${syncToken}`) return next();
  return res.status(401).json({ error: 'Token tidak valid.' });
}

function requireAdmin(req, res, next) {
  if (!adminPassword || !sessionSecret) {
    return res.status(503).type('html').send(loginHtml('ADMIN_PASSWORD atau SYNC_TOKEN belum diatur di Railway.'));
  }

  const session = readSession(req);
  if (session?.username === adminUsername) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Login admin diperlukan.' });
  return res.redirect('/login');
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_events (
      id BIGSERIAL PRIMARY KEY,
      idempotency_key TEXT UNIQUE NOT NULL,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      source_created_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id BIGSERIAL PRIMARY KEY,
      local_shift_id INTEGER UNIQUE NOT NULL,
      cashier_id INTEGER,
      cashier_name TEXT,
      start_time TIMESTAMPTZ,
      end_time TIMESTAMPTZ,
      start_cash NUMERIC(14,2) DEFAULT 0,
      end_cash_expected NUMERIC(14,2) DEFAULT 0,
      end_cash_actual NUMERIC(14,2) DEFAULT 0,
      cash_difference NUMERIC(14,2) DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS shift_transactions (
      id BIGSERIAL PRIMARY KEY,
      local_shift_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sales (
      id BIGSERIAL PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      local_sale_id INTEGER,
      local_shift_id INTEGER,
      cashier_id INTEGER,
      cashier_name TEXT,
      customer_name TEXT,
      subtotal NUMERIC(14,2) DEFAULT 0,
      discount NUMERIC(14,2) DEFAULT 0,
      total NUMERIC(14,2) DEFAULT 0,
      payment_method TEXT,
      payment_amount NUMERIC(14,2) DEFAULT 0,
      change_amount NUMERIC(14,2) DEFAULT 0,
      transaction_time TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id BIGSERIAL PRIMARY KEY,
      invoice_number TEXT NOT NULL,
      product_id INTEGER,
      product_sku TEXT,
      product_name TEXT,
      quantity NUMERIC(14,3) DEFAULT 0,
      sell_price NUMERIC(14,2) DEFAULT 0,
      cost_price NUMERIC(14,2) DEFAULT 0,
      discount NUMERIC(14,2) DEFAULT 0,
      subtotal NUMERIC(14,2) DEFAULT 0
    );
  `);
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function applyEvent(eventType, payload) {
  if (eventType === 'shift.open') {
    await pool.query(`
      INSERT INTO shifts (local_shift_id, cashier_id, cashier_name, start_time, start_cash, status, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'open', NOW())
      ON CONFLICT (local_shift_id) DO UPDATE SET
        cashier_id = EXCLUDED.cashier_id,
        cashier_name = EXCLUDED.cashier_name,
        start_time = EXCLUDED.start_time,
        start_cash = EXCLUDED.start_cash,
        status = CASE WHEN shifts.status = 'closed' THEN shifts.status ELSE 'open' END,
        updated_at = NOW()
    `, [
      payload.shiftId,
      payload.cashierId,
      payload.cashierName || null,
      payload.startTime || new Date().toISOString(),
      toNumber(payload.startCash)
    ]);
    return;
  }

  if (eventType === 'shift.close') {
    await pool.query(`
      UPDATE shifts SET
        end_time = $2,
        end_cash_expected = $3,
        end_cash_actual = $4,
        cash_difference = $5,
        status = 'closed',
        updated_at = NOW()
      WHERE local_shift_id = $1
    `, [
      payload.shiftId,
      payload.endTime || new Date().toISOString(),
      toNumber(payload.endCashExpected),
      toNumber(payload.endCashActual),
      toNumber(payload.cashDifference)
    ]);
    return;
  }

  if (eventType === 'shift.transaction') {
    await pool.query(`
      INSERT INTO shift_transactions (local_shift_id, type, amount, reason, created_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      payload.shiftId,
      payload.type,
      toNumber(payload.amount),
      payload.reason || '',
      payload.createdAt || new Date().toISOString()
    ]);
    return;
  }

  if (eventType === 'sale.create') {
    await pool.query(`
      INSERT INTO sales (
        invoice_number, local_sale_id, local_shift_id, cashier_id, cashier_name, customer_name,
        subtotal, discount, total, payment_method, payment_amount, change_amount, transaction_time, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (invoice_number) DO UPDATE SET
        local_sale_id = EXCLUDED.local_sale_id,
        local_shift_id = EXCLUDED.local_shift_id,
        cashier_id = EXCLUDED.cashier_id,
        cashier_name = EXCLUDED.cashier_name,
        customer_name = EXCLUDED.customer_name,
        subtotal = EXCLUDED.subtotal,
        discount = EXCLUDED.discount,
        total = EXCLUDED.total,
        payment_method = EXCLUDED.payment_method,
        payment_amount = EXCLUDED.payment_amount,
        change_amount = EXCLUDED.change_amount,
        transaction_time = EXCLUDED.transaction_time,
        updated_at = NOW()
    `, [
      payload.invoice_number,
      payload.saleId,
      payload.shift_id,
      payload.cashier_id,
      payload.cashier_name || null,
      payload.customer_name || 'Pelanggan Umum',
      toNumber(payload.subtotal),
      toNumber(payload.discount),
      toNumber(payload.total),
      payload.payment_method,
      toNumber(payload.payment_amount),
      toNumber(payload.change_amount),
      payload.transaction_time || new Date().toISOString()
    ]);

    await pool.query('DELETE FROM sale_items WHERE invoice_number = $1', [payload.invoice_number]);
    for (const item of payload.items || []) {
      await pool.query(`
        INSERT INTO sale_items (
          invoice_number, product_id, product_sku, product_name, quantity,
          sell_price, cost_price, discount, subtotal
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        payload.invoice_number,
        item.product_id,
        item.product_sku || null,
        item.product_name || null,
        toNumber(item.quantity),
        toNumber(item.sell_price),
        toNumber(item.cost_price),
        toNumber(item.discount),
        toNumber(item.subtotal)
      ]);
    }
  }
}

async function ingestEvent(event) {
  const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
  const inserted = await pool.query(`
    INSERT INTO sync_events (idempotency_key, event_type, payload, source_created_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id
  `, [
    event.idempotency_key,
    event.event_type,
    payload,
    event.created_at || null
  ]);

  if (inserted.rowCount === 0) return { duplicate: true };
  await applyEvent(event.event_type, payload);
  return { duplicate: false };
}

async function getDashboardData(date, requestedShiftId) {
  const filterDate = date || new Date().toISOString().slice(0, 10);
  const shiftsResult = await pool.query(`
    SELECT *
    FROM shifts
    WHERE DATE(start_time AT TIME ZONE 'Asia/Makassar') = $1
       OR DATE(COALESCE(end_time, start_time) AT TIME ZONE 'Asia/Makassar') = $1
    ORDER BY start_time DESC NULLS LAST, local_shift_id DESC
  `, [filterDate]);

  const shifts = shiftsResult.rows;
  const selectedShift = shifts.find((shift) => Number(shift.local_shift_id) === Number(requestedShiftId)) || shifts[0] || null;
  const selectedShiftId = selectedShift?.local_shift_id || 0;

  const summary = await pool.query(`
    SELECT
      COALESCE(SUM(total), 0) as total_sales,
      COALESCE(SUM(discount), 0) as total_discount,
      COUNT(*)::int as transaction_count
    FROM sales
    WHERE local_shift_id = $1
  `, [selectedShiftId]);

  const payments = await pool.query(`
    SELECT payment_method, COALESCE(SUM(total), 0) as total, COUNT(*)::int as count
    FROM sales
    WHERE local_shift_id = $1
    GROUP BY payment_method
    ORDER BY total DESC
  `, [selectedShiftId]);

  const recentSales = await pool.query(`
    SELECT invoice_number, customer_name, total, payment_method, transaction_time, cashier_name
    FROM sales
    WHERE local_shift_id = $1
    ORDER BY transaction_time DESC
    LIMIT 50
  `, [selectedShiftId]);

  const bestItems = await pool.query(`
    SELECT si.product_sku, si.product_name, SUM(si.quantity) as total_qty, SUM(si.subtotal) as total_sales
    FROM sale_items si
    JOIN sales s ON s.invoice_number = si.invoice_number
    WHERE s.local_shift_id = $1
    GROUP BY product_sku, product_name
    ORDER BY total_qty DESC
    LIMIT 20
  `, [selectedShiftId]);

  return {
    date: filterDate,
    generated_at: new Date().toISOString(),
    shifts,
    selected_shift_id: selectedShiftId || null,
    selected_shift: selectedShift,
    summary: summary.rows[0],
    payment_breakdown: payments.rows,
    recent_sales: recentSales.rows,
    best_items: bestItems.rows
  };
}

function dashboardHtml() {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dashboard Online Toko Hasnawir</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7f9; color: #17202a; }
    header { background: #fff; border-bottom: 1px solid #dfe5eb; padding: 14px 16px; display: flex; justify-content: space-between; gap: 12px; position: sticky; top: 0; z-index: 2; }
    h1 { font-size: 18px; margin: 0; }
    h3 { margin: 0 0 12px; font-size: 15px; }
    main { max-width: 1180px; margin: 0 auto; padding: 16px; display: grid; gap: 14px; }
    .toolbar { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; }
    .field { display: grid; gap: 4px; }
    .field label, .label { color: #637381; font-size: 11px; font-weight: 900; text-transform: uppercase; }
    input, select, button { border: 1px solid #cfd8e3; background: #fff; border-radius: 6px; padding: 9px 10px; font-weight: 700; min-height: 38px; }
    button { cursor: pointer; background: #166534; color: #fff; border-color: #166534; }
    .logout { background: #fff; color: #b42318; border-color: #fecaca; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .two { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; }
    .card { background: #fff; border: 1px solid #dfe5eb; border-radius: 8px; padding: 14px; min-width: 0; }
    .metric { font-size: 24px; font-weight: 900; margin-top: 6px; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 9px 8px; border-bottom: 1px solid #edf1f5; text-align: left; vertical-align: top; }
    th { color: #637381; font-size: 11px; text-transform: uppercase; }
    .muted { color: #637381; }
    .pill { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #eef2f6; font-size: 11px; font-weight: 800; }
    .pay-cash { background: #dcfce7; color: #166534; }
    .pay-transfer { background: #dbeafe; color: #1d4ed8; }
    .pay-qris { background: #f3e8ff; color: #7e22ce; }
    .pay-debt { background: #fee2e2; color: #b42318; }
    .pay-installment { background: #fef3c7; color: #92400e; }
    .mobile-list { display: none; }
    .mobile-item { border: 1px solid #edf1f5; border-radius: 8px; padding: 11px; display: grid; gap: 7px; }
    .mobile-row { display: flex; justify-content: space-between; gap: 12px; }
    .mobile-value { font-weight: 600; text-align: right; }
    .mobile-total { font-weight: 800; }
    @media (max-width: 1024px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .two { grid-template-columns: 1fr; } }
    @media (max-width: 640px) { header { flex-direction: column; } main { padding: 12px; } .toolbar { display: grid; grid-template-columns: 1fr; } input, select, button { width: 100%; } .grid { grid-template-columns: 1fr; } table { display: none; } .mobile-list { display: grid; gap: 8px; } }
  </style>
</head>
<body>
  <header>
    <div><h1>Dashboard Online Toko Hasnawir</h1><div class="muted" id="generated">Memuat data...</div></div>
    <div class="toolbar">
      <div class="field"><label for="date">Tanggal Shift</label><input type="date" id="date" /></div>
      <div class="field"><label for="shiftSelect">Pilih Shift / Kasir</label><select id="shiftSelect"></select></div>
      <button id="refresh">Refresh</button>
      <form method="post" action="/logout"><button class="logout" type="submit">Keluar</button></form>
    </div>
  </header>
  <main>
    <section class="grid">
      <div class="card"><div class="label">Penjualan Shift</div><div class="metric" id="totalSales">Rp 0</div></div>
      <div class="card"><div class="label">Transaksi</div><div class="metric" id="txCount">0</div></div>
      <div class="card"><div class="label">Diskon</div><div class="metric" id="discount">Rp 0</div></div>
      <div class="card"><div class="label">Shift Dipilih</div><div class="metric" id="shift">-</div></div>
    </section>
    <section class="two">
      <div class="card"><h3>Riwayat Transaksi Shift</h3><div id="sales"></div></div>
      <div class="card"><h3>Metode Pembayaran</h3><div id="payments"></div></div>
    </section>
    <section class="card"><h3>Produk Terjual</h3><div id="items"></div></section>
  </main>
  <script>
    const rupiah = (value) => 'Rp ' + Number(value || 0).toLocaleString('id-ID');
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const today = new Date().toISOString().slice(0, 10);
    let selectedShiftId = new URLSearchParams(location.search).get('shift') || '';
    document.getElementById('date').value = today;

    function paymentBadge(method) {
      const normalized = String(method || '').toLowerCase();
      const allowed = ['cash', 'transfer', 'qris', 'debt', 'installment', 'split'];
      return '<span class="pill ' + (allowed.includes(normalized) ? 'pay-' + normalized : '') + '">' + esc(method).toUpperCase() + '</span>';
    }

    function table(headers, rows, mobileRows, empty) {
      if (!rows.length) return '<div class="muted">' + empty + '</div>';
      return '<table><thead><tr>' + headers.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table><div class="mobile-list">' + mobileRows.join('') + '</div>';
    }

    function mobileItem(rows) {
      return '<div class="mobile-item">' + rows.map((row) => '<div class="mobile-row"><span class="muted">' + row[0] + '</span><span class="mobile-value">' + row[1] + '</span></div>').join('') + '</div>';
    }

    function formatShiftOption(shift) {
      const start = shift.start_time ? new Date(shift.start_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
      const end = shift.end_time ? new Date(shift.end_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'sekarang';
      return '#' + shift.local_shift_id + ' - ' + (shift.cashier_name || 'Kasir') + ' (' + start + ' - ' + end + ', ' + shift.status + ')';
    }

    function syncShiftSelect(shifts, selectedId) {
      const select = document.getElementById('shiftSelect');
      if (!shifts.length) {
        select.innerHTML = '<option value="">Tidak ada shift di tanggal ini</option>';
        selectedShiftId = '';
        return;
      }
      select.innerHTML = shifts.map((shift) => '<option value="' + shift.local_shift_id + '">' + esc(formatShiftOption(shift)) + '</option>').join('');
      select.value = selectedId ? String(selectedId) : String(shifts[0].local_shift_id);
      selectedShiftId = select.value;
    }

    async function load() {
      const date = document.getElementById('date').value || today;
      const shiftParam = selectedShiftId ? '&shift=' + encodeURIComponent(selectedShiftId) : '';
      const res = await fetch('/api/dashboard?date=' + encodeURIComponent(date) + shiftParam);
      if (!res.ok) {
        if (res.status === 401) {
          location.href = '/login';
          return;
        }
        document.getElementById('generated').textContent = 'Gagal memuat data: ' + res.status;
        return;
      }
      const data = await res.json();
      syncShiftSelect(data.shifts || [], data.selected_shift_id);
      document.getElementById('generated').textContent = 'Update: ' + new Date(data.generated_at).toLocaleString('id-ID');
      document.getElementById('totalSales').textContent = rupiah(data.summary.total_sales);
      document.getElementById('txCount').textContent = Number(data.summary.transaction_count || 0).toLocaleString('id-ID');
      document.getElementById('discount').textContent = rupiah(data.summary.total_discount);
      document.getElementById('shift').textContent = data.selected_shift ? (data.selected_shift.cashier_name || '-') : '-';
      document.getElementById('sales').innerHTML = table(['Invoice', 'Kasir', 'Metode', 'Total', 'Waktu'], data.recent_sales.map((sale) =>
        '<tr><td>' + esc(sale.invoice_number) + '<br><span class="muted">' + esc(sale.customer_name || 'Pelanggan Umum') + '</span></td><td>' + esc(sale.cashier_name || '-') + '</td><td>' + paymentBadge(sale.payment_method) + '</td><td>' + rupiah(sale.total) + '</td><td>' + new Date(sale.transaction_time).toLocaleString('id-ID') + '</td></tr>'
      ), data.recent_sales.map((sale) => mobileItem([
        ['Invoice', esc(sale.invoice_number)],
        ['Pelanggan', esc(sale.customer_name || 'Pelanggan Umum')],
        ['Metode', paymentBadge(sale.payment_method)],
        ['Total', '<span class="mobile-total">' + rupiah(sale.total) + '</span>'],
        ['Waktu', new Date(sale.transaction_time).toLocaleString('id-ID')]
      ])), 'Belum ada transaksi.');
      document.getElementById('payments').innerHTML = table(['Metode', 'Total'], data.payment_breakdown.map((pm) =>
        '<tr><td>' + paymentBadge(pm.payment_method) + '<br><span class="muted">' + Number(pm.count || 0) + ' transaksi</span></td><td>' + rupiah(pm.total) + '</td></tr>'
      ), data.payment_breakdown.map((pm) => mobileItem([
        ['Metode', paymentBadge(pm.payment_method)],
        ['Transaksi', Number(pm.count || 0).toLocaleString('id-ID')],
        ['Total', '<span class="mobile-total">' + rupiah(pm.total) + '</span>']
      ])), 'Belum ada pembayaran.');
      document.getElementById('items').innerHTML = table(['SKU', 'Produk', 'Qty', 'Total'], data.best_items.map((item) =>
        '<tr><td>' + esc(item.product_sku || '-') + '</td><td>' + esc(item.product_name || '-') + '</td><td>' + Number(item.total_qty || 0).toLocaleString('id-ID') + '</td><td>' + rupiah(item.total_sales) + '</td></tr>'
      ), data.best_items.map((item) => mobileItem([
        ['SKU', esc(item.product_sku || '-')],
        ['Produk', esc(item.product_name || '-')],
        ['Qty', Number(item.total_qty || 0).toLocaleString('id-ID')],
        ['Total', '<span class="mobile-total">' + rupiah(item.total_sales) + '</span>']
      ])), 'Belum ada item terjual.');
    }

    document.getElementById('refresh').addEventListener('click', load);
    document.getElementById('date').addEventListener('change', () => { selectedShiftId = ''; load(); });
    document.getElementById('shiftSelect').addEventListener('change', (event) => { selectedShiftId = event.target.value; load(); });
    load();
    setInterval(load, 15000);
  </script>
</body>
</html>`;
}

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/login', (req, res) => {
  if (readSession(req)?.username === adminUsername) return res.redirect('/');
  return res.type('html').send(loginHtml());
});
app.post('/login', (req, res) => {
  const username = String(req.body.username || '');
  const password = String(req.body.password || '');
  if (username === adminUsername && password === adminPassword) {
    setSessionCookie(res, username);
    return res.redirect('/');
  }
  return res.status(401).type('html').send(loginHtml('Username atau password salah.'));
});
app.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  return res.redirect('/login');
});
app.get('/', requireAdmin, (_req, res) => res.type('html').send(dashboardHtml()));
app.get('/api/dashboard', requireAdmin, async (req, res, next) => {
  try {
    const shiftId = Number(req.query.shift || 0);
    res.json(await getDashboardData(req.query.date, Number.isFinite(shiftId) && shiftId > 0 ? shiftId : undefined));
  } catch (error) {
    next(error);
  }
});

app.post('/api/sync/events', requireSyncToken, async (req, res, next) => {
  try {
    const events = Array.isArray(req.body.events) ? req.body.events : [req.body];
    const results = [];
    for (const event of events) {
      if (!event?.event_type || !event?.idempotency_key || event.payload === undefined) {
        return res.status(400).json({ error: 'event_type, idempotency_key, dan payload wajib diisi.' });
      }
      results.push(await ingestEvent(event));
    }
    res.json({ success: true, results });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Server error.' });
});

await initDb();
app.listen(port, '0.0.0.0', () => {
  console.log(`Retail POS cloud dashboard running on port ${port}`);
});

import { ipcMain } from 'electron';
import http from 'http';
import os from 'os';
import { URL } from 'url';
import db from './db';
import { wrapIpcHandler } from './utils/ipcErrorHandler';

let server: http.Server | null = null;
let activePort = 3030;

function getSetting(key: string, fallback: string) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row?.value ?? fallback;
}

function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    const lowerName = name.toLowerCase();
    if (
      lowerName.startsWith('lo') ||
      lowerName.startsWith('docker') ||
      lowerName.startsWith('br-') ||
      lowerName.startsWith('veth') ||
      lowerName.startsWith('virbr')
    ) {
      continue;
    }

    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        ips.push(entry.address);
      }
    }
  }

  return ips;
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
}

function requireToken(reqUrl: URL, res: http.ServerResponse) {
  const token = getSetting('monitoring_token', '');
  if (!token) return true;
  if (reqUrl.searchParams.get('token') === token) return true;

  sendJson(res, 401, { error: 'Token monitoring tidak valid.' });
  return false;
}

function getDashboardData(date?: string, requestedShiftId?: number) {
  const filterDate = date || new Date().toISOString().split('T')[0];

  const shifts = db.prepare(`
    SELECT s.*, u.name as cashier_name
    FROM shifts s
    JOIN users u ON s.cashier_id = u.id
    WHERE date(s.start_time) = ?
       OR date(COALESCE(s.end_time, s.start_time)) = ?
    ORDER BY s.start_time DESC
  `).all(filterDate, filterDate) as any[];

  const activeShift = db.prepare(`
    SELECT s.*, u.name as cashier_name
    FROM shifts s
    JOIN users u ON s.cashier_id = u.id
    WHERE s.status = 'open'
    ORDER BY s.id DESC
    LIMIT 1
  `).get() as any;

  const requestedShift = requestedShiftId
    ? shifts.find((shift) => Number(shift.id) === requestedShiftId)
    : null;
  const defaultShift = shifts.find((shift) => activeShift && Number(shift.id) === Number(activeShift.id)) || shifts[0] || null;
  const selectedShift = requestedShift || defaultShift;
  const selectedShiftId = selectedShift?.id || 0;

  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(total), 0) as total_sales,
      COALESCE(SUM(discount), 0) as total_discount,
      COUNT(id) as transaction_count
    FROM sales
    WHERE shift_id = ?
  `).get(selectedShiftId) as any;

  const paymentBreakdown = db.prepare(`
    SELECT payment_method, COALESCE(SUM(total), 0) as total, COUNT(id) as count
    FROM sales
    WHERE shift_id = ?
    GROUP BY payment_method
    ORDER BY total DESC
  `).all(selectedShiftId);

  const recentSales = db.prepare(`
    SELECT
      s.id, s.invoice_number, s.customer_name, s.total, s.payment_method,
      s.transaction_time, u.name as cashier_name
    FROM sales s
    JOIN users u ON s.cashier_id = u.id
    WHERE s.shift_id = ?
    ORDER BY s.transaction_time DESC
    LIMIT 30
  `).all(selectedShiftId);

  const lowStock = db.prepare(`
    SELECT sku, name, stock, category
    FROM products
    WHERE active = 1 AND stock < 10
    ORDER BY stock ASC, name ASC
    LIMIT 20
  `).all();

  const debts = db.prepare(`
    SELECT d.id, c.name as customer_name, d.remaining, d.due_date, d.status
    FROM debts d
    JOIN customers c ON d.customer_id = c.id
    JOIN sales s ON d.transaction_id = s.id
    WHERE d.remaining > 0
      AND s.shift_id = ?
    ORDER BY d.due_date ASC
    LIMIT 20
  `).all(selectedShiftId);

  return {
    date: filterDate,
    selected_shift_id: selectedShiftId || null,
    generated_at: new Date().toISOString(),
    summary,
    payment_breakdown: paymentBreakdown,
    recent_sales: recentSales,
    low_stock: lowStock,
    debts,
    shifts,
    selected_shift: selectedShift,
    active_shift: activeShift
  };
}

function dashboardHtml() {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Monitoring Toko Hasnawir</title>
  <style>
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body { margin: 0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f6f8; color: #17202a; }
    header { background: #ffffff; border-bottom: 1px solid #dfe5eb; padding: 14px max(14px, env(safe-area-inset-right)) 14px max(14px, env(safe-area-inset-left)); display: flex; align-items: center; justify-content: space-between; gap: 12px; position: sticky; top: 0; z-index: 2; }
    h1 { font-size: 18px; margin: 0; line-height: 1.25; }
    h3 { margin: 0 0 12px; font-size: 15px; }
    main { max-width: 1180px; margin: 0 auto; padding: 16px; display: grid; gap: 14px; }
    .toolbar { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; }
    .field { display: grid; gap: 4px; }
    .field label { color: #637381; font-size: 11px; font-weight: 900; text-transform: uppercase; }
    input, select, button { border: 1px solid #cfd8e3; background: #fff; border-radius: 6px; padding: 9px 10px; font-weight: 700; min-height: 38px; }
    button { cursor: pointer; background: #166534; color: #fff; border-color: #166534; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .card { background: #fff; border: 1px solid #dfe5eb; border-radius: 8px; padding: 14px; min-width: 0; }
    .metric-label { color: #637381; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .metric-value { font-size: 24px; font-weight: 900; margin-top: 6px; word-break: break-word; }
    .two { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; }
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
    .pay-split { background: #e0f2fe; color: #0369a1; }
    .danger { color: #b42318; font-weight: 800; }
    .ok { color: #166534; font-weight: 800; }
    .mobile-list { display: none; }
    .mobile-item { border: 1px solid #edf1f5; border-radius: 8px; padding: 11px; display: grid; gap: 7px; }
    .mobile-row { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .mobile-title { font-weight: 700; }
    .mobile-value { font-weight: 600; text-align: right; line-height: 1.35; }
    .mobile-total { font-weight: 800; }
    @media (max-width: 1024px) {
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .two { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      header { align-items: stretch; flex-direction: column; padding: 12px; }
      main { padding: 12px; gap: 12px; }
      .toolbar { display: grid; grid-template-columns: 1fr; width: 100%; }
      input, select, button { width: 100%; font-size: 14px; }
      .grid { grid-template-columns: 1fr; gap: 10px; }
      .card { padding: 12px; }
      .metric-value { font-size: 21px; }
      table { display: none; }
      .mobile-list { display: grid; gap: 8px; }
      .pill { white-space: nowrap; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Monitoring Toko Hasnawir</h1>
      <div class="muted" id="generated">Memuat data...</div>
    </div>
    <div class="toolbar">
      <div class="field">
        <label for="date">Tanggal Shift</label>
        <input type="date" id="date" />
      </div>
      <div class="field">
        <label for="shiftSelect">Pilih Shift / Kasir</label>
        <select id="shiftSelect">
          <option value="">Memuat shift...</option>
        </select>
      </div>
      <button id="refresh">Refresh</button>
    </div>
  </header>
  <main>
    <section class="grid">
      <div class="card"><div class="metric-label">Penjualan Shift</div><div class="metric-value" id="totalSales">Rp 0</div></div>
      <div class="card"><div class="metric-label">Jumlah Transaksi</div><div class="metric-value" id="txCount">0</div></div>
      <div class="card"><div class="metric-label">Diskon</div><div class="metric-value" id="discount">Rp 0</div></div>
      <div class="card"><div class="metric-label">Shift Dipilih</div><div class="metric-value" id="shift">-</div></div>
    </section>
    <section class="two">
      <div class="card"><h3>Riwayat Transaksi Shift</h3><div id="sales"></div></div>
      <div class="card"><h3>Metode Pembayaran</h3><div id="payments"></div></div>
    </section>
    <section class="two">
      <div class="card"><h3>Stok Rendah</h3><div id="stocks"></div></div>
      <div class="card"><h3>Hutang Berjalan</h3><div id="debts"></div></div>
    </section>
  </main>
  <script>
    const token = new URLSearchParams(location.search).get('token') || '';
    const rupiah = (value) => 'Rp ' + Number(value || 0).toLocaleString('id-ID');
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const today = new Date().toISOString().slice(0, 10);
    let selectedShiftId = new URLSearchParams(location.search).get('shift') || '';
    document.getElementById('date').value = today;

    function table(headers, rows, mobileRows, empty) {
      if (!rows.length) return '<div class="muted">' + empty + '</div>';
      return '<table><thead><tr>' + headers.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table><div class="mobile-list">' + mobileRows.join('') + '</div>';
    }

    function mobileItem(rows) {
      return '<div class="mobile-item">' + rows.map((row) => '<div class="mobile-row"><span class="muted">' + row[0] + '</span><span class="mobile-value">' + row[1] + '</span></div>').join('') + '</div>';
    }

    function paymentBadge(method) {
      const normalized = String(method || '').toLowerCase();
      const allowed = ['cash', 'transfer', 'qris', 'debt', 'installment', 'split'];
      const className = allowed.includes(normalized) ? 'pay-' + normalized : '';
      return '<span class="pill ' + className + '">' + esc(method).toUpperCase() + '</span>';
    }

    function formatShiftOption(shift) {
      const start = new Date(shift.start_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const end = shift.end_time ? new Date(shift.end_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'sekarang';
      const status = shift.status === 'open' ? 'aktif' : 'selesai';
      return '#' + shift.id + ' - ' + shift.cashier_name + ' (' + start + ' - ' + end + ', ' + status + ')';
    }

    function syncShiftSelect(shifts, selectedId) {
      const select = document.getElementById('shiftSelect');
      if (!shifts.length) {
        select.innerHTML = '<option value="">Tidak ada shift di tanggal ini</option>';
        select.value = '';
        selectedShiftId = '';
        return;
      }

      select.innerHTML = shifts.map((shift) => '<option value="' + shift.id + '">' + esc(formatShiftOption(shift)) + '</option>').join('');
      select.value = selectedId ? String(selectedId) : String(shifts[0].id);
      selectedShiftId = select.value;
    }

    async function load() {
      const date = document.getElementById('date').value || today;
      const shiftParam = selectedShiftId ? '&shift=' + encodeURIComponent(selectedShiftId) : '';
      const res = await fetch('/api/dashboard?date=' + encodeURIComponent(date) + shiftParam + '&token=' + encodeURIComponent(token));
      if (!res.ok) {
        document.getElementById('generated').textContent = 'Gagal memuat data: ' + res.status;
        return;
      }
      const data = await res.json();
      syncShiftSelect(data.shifts || [], data.selected_shift_id);
      document.getElementById('generated').textContent = 'Update: ' + new Date(data.generated_at).toLocaleString('id-ID');
      document.getElementById('totalSales').textContent = rupiah(data.summary.total_sales);
      document.getElementById('txCount').textContent = Number(data.summary.transaction_count || 0).toLocaleString('id-ID');
      document.getElementById('discount').textContent = rupiah(data.summary.total_discount);
      document.getElementById('shift').innerHTML = data.selected_shift ? '<span class="ok">' + esc(data.selected_shift.cashier_name) + '</span>' : '<span class="danger">-</span>';
      document.getElementById('sales').innerHTML = table(['Invoice', 'Kasir', 'Metode', 'Total', 'Waktu'], data.recent_sales.map((sale) =>
        '<tr><td>' + esc(sale.invoice_number) + '<br><span class="muted">' + esc(sale.customer_name || 'Pelanggan Umum') + '</span></td><td>' + esc(sale.cashier_name) + '</td><td>' + paymentBadge(sale.payment_method) + '</td><td>' + rupiah(sale.total) + '</td><td>' + new Date(sale.transaction_time).toLocaleString('id-ID') + '</td></tr>'
      ), data.recent_sales.map((sale) => mobileItem([
        ['Invoice', '<span class="mobile-title">' + esc(sale.invoice_number) + '</span>'],
        ['Pelanggan', esc(sale.customer_name || 'Pelanggan Umum')],
        ['Kasir', esc(sale.cashier_name)],
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
      document.getElementById('stocks').innerHTML = table(['SKU', 'Produk', 'Stok'], data.low_stock.map((item) =>
        '<tr><td>' + esc(item.sku) + '</td><td>' + esc(item.name) + '<br><span class="muted">' + esc(item.category) + '</span></td><td class="danger">' + Number(item.stock || 0).toLocaleString('id-ID') + '</td></tr>'
      ), data.low_stock.map((item) => mobileItem([
        ['SKU', esc(item.sku)],
        ['Produk', esc(item.name)],
        ['Kategori', esc(item.category)],
        ['Stok', '<span class="danger">' + Number(item.stock || 0).toLocaleString('id-ID') + '</span>']
      ])), 'Tidak ada stok rendah.');
      document.getElementById('debts').innerHTML = table(['Pelanggan', 'Sisa', 'Jatuh Tempo'], data.debts.map((debt) =>
        '<tr><td>' + esc(debt.customer_name) + '</td><td>' + rupiah(debt.remaining) + '</td><td>' + esc(debt.due_date || '-') + '</td></tr>'
      ), data.debts.map((debt) => mobileItem([
        ['Pelanggan', esc(debt.customer_name)],
        ['Sisa', '<span class="mobile-total">' + rupiah(debt.remaining) + '</span>'],
        ['Jatuh Tempo', esc(debt.due_date || '-')]
      ])), 'Tidak ada hutang berjalan.');
    }

    document.getElementById('refresh').addEventListener('click', load);
    document.getElementById('date').addEventListener('change', () => {
      selectedShiftId = '';
      load();
    });
    document.getElementById('shiftSelect').addEventListener('change', (event) => {
      selectedShiftId = event.target.value;
      load();
    });
    load();
    setInterval(load, 15000);
  </script>
</body>
</html>`;
}

export function getMonitoringInfo() {
  const token = getSetting('monitoring_token', '');
  const enabled = getSetting('monitoring_enabled', 'true') === 'true';
  const port = activePort || Number(getSetting('monitoring_port', '3030'));
  const ips = getLocalIps();
  const urls = ips.map((ip) => `http://${ip}:${port}/?token=${encodeURIComponent(token)}`);

  return {
    enabled,
    port,
    token,
    bindAddress: '0.0.0.0',
    isListening: Boolean(server?.listening),
    urls,
    localUrl: `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`
  };
}

export function startMonitoringServer() {
  if (server) return getMonitoringInfo();

  const enabled = getSetting('monitoring_enabled', 'true') === 'true';
  if (!enabled) return getMonitoringInfo();

  activePort = Number(getSetting('monitoring_port', '3030')) || 3030;

  server = http.createServer((req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

      if (reqUrl.pathname === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (reqUrl.pathname === '/') {
        if (!requireToken(reqUrl, res)) return;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(dashboardHtml());
        return;
      }

      if (reqUrl.pathname === '/api/dashboard') {
        if (!requireToken(reqUrl, res)) return;
        const shiftId = Number(reqUrl.searchParams.get('shift') || 0);
        sendJson(res, 200, getDashboardData(
          reqUrl.searchParams.get('date') || undefined,
          Number.isFinite(shiftId) && shiftId > 0 ? shiftId : undefined
        ));
        return;
      }

      sendJson(res, 404, { error: 'Endpoint tidak ditemukan.' });
    } catch (error: any) {
      sendJson(res, 500, { error: error.message || 'Monitoring server error.' });
    }
  });

  server.listen(activePort, '0.0.0.0', () => {
    const info = getMonitoringInfo();
    console.log(`Monitoring dashboard aktif: ${info.localUrl}`);
    for (const url of info.urls) {
      console.log(`Monitoring LAN: ${url}`);
    }
  });

  server.on('error', (error) => {
    console.error('Monitoring server gagal berjalan:', error);
  });

  return getMonitoringInfo();
}

ipcMain.handle('monitoring:getInfo', wrapIpcHandler(async () => getMonitoringInfo()));

import React, { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, Info, X, ClipboardPaste } from 'lucide-react';

interface SettingsManagerProps {
  onClose: () => void;
  onRefresh: () => void;
}

export default function SettingsManager({ onClose, onRefresh }: SettingsManagerProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Editable settings states
  const [storeName, setStoreName] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [taxEnabled, setTaxEnabled] = useState('false');
  const [taxPercent, setTaxPercent] = useState('0');
  const [syncEnabled, setSyncEnabled] = useState('true');
  const [terminalId, setTerminalId] = useState('TERM-001');
  const [isLanServer, setIsLanServer] = useState('false');
  const [printerName, setPrinterName] = useState('');
  const [qrisStaticPayload, setQrisStaticPayload] = useState('');
  const [monitoringEnabled, setMonitoringEnabled] = useState('true');
  const [monitoringPort, setMonitoringPort] = useState('3030');
  const [monitoringToken, setMonitoringToken] = useState('');
  const [monitoringInfo, setMonitoringInfo] = useState<any>(null);
  const [cloudSyncUrl, setCloudSyncUrl] = useState('');
  const [cloudSyncToken, setCloudSyncToken] = useState('');
  const [availablePrinters, setAvailablePrinters] = useState<any[]>([]);
  const [useCustomPort, setUseCustomPort] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await (window as any).api.settings.getAll();
      setSettings(data);

      setStoreName(data.store_name || '');
      setStoreAddress(data.store_address || '');
      setStorePhone(data.store_phone || '');
      setReceiptFooter(data.receipt_footer || '');
      setTaxEnabled(data.tax_enabled || 'false');
      setTaxPercent(data.tax_percent || '0');
      setSyncEnabled(data.sync_enabled || 'true');
      setTerminalId(data.terminal_id || 'TERM-001');
      setIsLanServer(data.is_lan_server || 'false');
      setQrisStaticPayload(data.qris_static_payload || '');
      setMonitoringEnabled(data.monitoring_enabled || 'true');
      setMonitoringPort(data.monitoring_port || '3030');
      setMonitoringToken(data.monitoring_token || '');
      setCloudSyncUrl(data.cloud_sync_url || '');
      setCloudSyncToken(data.cloud_sync_token || '');
      const printer = data.printer_name || '';
      setPrinterName(printer);
      if (printer.startsWith('/dev/') || printer.startsWith('COM') || printer.startsWith('LPT') || printer.startsWith('\\\\')) {
        setUseCustomPort(true);
      }

      try {
        const printersList = await (window as any).api.printer.getNames();
        setAvailablePrinters(printersList);
      } catch (e) {
        console.error('Error fetching printers:', e);
      }

      try {
        const info = await (window as any).api.monitoring.getInfo();
        setMonitoringInfo(info);
      } catch (e) {
        console.error('Error fetching monitoring info:', e);
      }
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil data pengaturan.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Record<string, string> = {
        store_name: storeName.trim(),
        store_address: storeAddress.trim(),
        store_phone: storePhone.trim(),
        receipt_footer: receiptFooter.trim(),
        tax_enabled: taxEnabled,
        tax_percent: taxPercent,
        sync_enabled: syncEnabled,
        terminal_id: terminalId.trim(),
        is_lan_server: isLanServer,
        printer_name: printerName,
        qris_static_payload: qrisStaticPayload.replace(/\s/g, ''),
        monitoring_enabled: monitoringEnabled,
        monitoring_port: monitoringPort.trim() || '3030',
        monitoring_token: monitoringToken.trim(),
        cloud_sync_url: cloudSyncUrl.trim(),
        cloud_sync_token: cloudSyncToken.trim()
      };

      const res = await (window as any).api.settings.update(payload);
      if (res.success) {
        alert('Pengaturan toko berhasil disimpan.');
        onRefresh();
        onClose();
      } else {
        alert(res.error || 'Gagal menyimpan pengaturan.');
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan.');
    }
  };

  const handlePasteQrisPayload = async () => {
    try {
      const electronText = await (window as any).api?.clipboard?.readText?.();
      const browserText = electronText || await navigator.clipboard?.readText?.();
      if (!browserText) {
        alert('Clipboard kosong atau tidak berisi teks.');
        return;
      }
      setQrisStaticPayload(browserText.trim());
    } catch (err: any) {
      alert(err.message || 'Gagal membaca clipboard.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px', width: '90%', display: 'flex', flexDirection: 'column', height: '80vh' }}>
        <div className="modal-header">
          <h2 style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings color="#6b7280" /> Pengaturan Sistem POS & Toko
          </h2>
          <button className="btn-soft" style={{ padding: 6, borderRadius: '50%' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Memuat data pengaturan...</div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            
            {/* Store Profiling Section */}
            <div className="soft-raised" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h4 style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--shadow-dark)', paddingBottom: 6 }}>
                PROFIL TOKO / WARUNG
              </h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nama Toko</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Alamat Toko</label>
                <input
                  type="text"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>No. Telepon</label>
                <input
                  type="text"
                  value={storePhone}
                  onChange={(e) => setStorePhone(e.target.value)}
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pesan Kaki Struk (Receipt Footer)</label>
                <textarea
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '0.82rem',
                    background: 'var(--surface-raised)',
                    boxShadow: 'inset 2px 2px 4px var(--shadow-dark), inset -2px -2px 4px var(--shadow-light)',
                    borderRadius: 8,
                    border: 'none',
                    resize: 'none',
                    height: '60px',
                    color: 'var(--text-color)',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Tax & POS configuration */}
            <div className="soft-raised" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h4 style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--shadow-dark)', paddingBottom: 6 }}>
                BIAYA & PERPAJAKAN
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pajak (PPN)</label>
                  <select
                    value={taxEnabled}
                    onChange={(e) => setTaxEnabled(e.target.value)}
                    className="input-soft"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', fontWeight: 700 }}
                  >
                    <option value="false">TIDAK AKTIF</option>
                    <option value="true">AKTIF (Tambahkan Ke Checkout)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Persentase PPN (%)</label>
                  <input
                    type="number"
                    disabled={taxEnabled === 'false'}
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(e.target.value)}
                    className="input-soft"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </div>

            {/* Hardware / Printer Settings */}
            <div className="soft-raised" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h4 style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--shadow-dark)', paddingBottom: 6 }}>
                PERANGKAT KERAS / PRINTER THERMAL
              </h4>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="chk-custom-printer"
                  checked={useCustomPort}
                  onChange={(e) => {
                    setUseCustomPort(e.target.checked);
                    if (!e.target.checked) {
                      setPrinterName('');
                    }
                  }}
                  style={{ accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                />
                <label htmlFor="chk-custom-printer" style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                  Gunakan Port Serial / Device Path Kustom (e.g. /dev/rfcomm0)
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {useCustomPort ? 'Path Device / Port Printer' : 'Pilih Printer Thermal Default'}
                </label>
                {useCustomPort ? (
                  <input
                    type="text"
                    value={printerName}
                    placeholder="/dev/rfcomm0 atau /dev/usb/lp0"
                    onChange={(e) => setPrinterName(e.target.value)}
                    className="input-soft"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                  />
                ) : (
                  <select
                    value={printerName}
                    onChange={(e) => setPrinterName(e.target.value)}
                    className="input-soft"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', fontWeight: 700 }}
                  >
                    <option value="">-- Gunakan Printer Default OS --</option>
                    {availablePrinters.map(p => (
                      <option key={p.name} value={p.name}>
                        {p.name} {p.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Monitoring dashboard settings */}
            <div className="soft-raised" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h4 style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--shadow-dark)', paddingBottom: 6 }}>
                MONITORING ONLINE
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Dashboard Monitoring</label>
                  <select
                    value={monitoringEnabled}
                    onChange={(e) => setMonitoringEnabled(e.target.value)}
                    className="input-soft"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', fontWeight: 700 }}
                  >
                    <option value="true">AKTIF</option>
                    <option value="false">MATI</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Port Dashboard</label>
                  <input
                    type="number"
                    min="1024"
                    max="65535"
                    value={monitoringPort}
                    onChange={(e) => setMonitoringPort(e.target.value)}
                    className="input-soft"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Token Akses</label>
                <input
                  type="text"
                  value={monitoringToken}
                  onChange={(e) => setMonitoringToken(e.target.value)}
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <span style={{ color: monitoringInfo?.isListening ? 'var(--primary-color)' : 'var(--danger-color)', fontWeight: 800 }}>
                  Status jaringan: {monitoringInfo?.isListening ? `Aktif di ${monitoringInfo.bindAddress}:${monitoringInfo.port}` : 'Belum aktif'}
                </span>
                <span>Alamat lokal: {monitoringInfo?.localUrl || '-'}</span>
                {(monitoringInfo?.urls || []).map((url: string) => (
                  <span key={url}>Alamat jaringan: {url}</span>
                ))}
                {monitoringInfo?.urls?.length === 0 && (
                  <span>Tidak ada IP LAN terdeteksi. Pastikan komputer kasir tersambung Wi-Fi/LAN.</span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.45 }}>
                <Info size={16} />
                Setelah mengubah port/token, tutup dan buka ulang aplikasi agar server monitoring memakai pengaturan baru.
              </div>
            </div>

            {/* Cloud sync settings */}
            <div className="soft-raised" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h4 style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--shadow-dark)', paddingBottom: 6 }}>
                CLOUD SYNC / DASHBOARD ONLINE
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cloud Sync URL</label>
                <input
                  type="url"
                  value={cloudSyncUrl}
                  onChange={(e) => setCloudSyncUrl(e.target.value)}
                  placeholder="https://nama-app.up.railway.app"
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cloud Sync Token</label>
                <input
                  type="text"
                  value={cloudSyncToken}
                  onChange={(e) => setCloudSyncToken(e.target.value)}
                  placeholder="Samakan dengan SYNC_TOKEN di Railway"
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.45 }}>
                <Info size={16} />
                Jika URL ini diisi, Sync Queue akan mengirim transaksi dan shift ke server online untuk dashboard dari luar jaringan.
              </div>
            </div>

            {/* QRIS settings */}
            <div className="soft-raised" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h4 style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--shadow-dark)', paddingBottom: 6 }}>
                PEMBAYARAN QRIS
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Payload QRIS Statis Merchant</label>
                  <button
                    type="button"
                    className="btn-soft"
                    onClick={handlePasteQrisPayload}
                    style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <ClipboardPaste size={14} />
                    Paste
                  </button>
                </div>
                <textarea
                  value={qrisStaticPayload}
                  onChange={(e) => setQrisStaticPayload(e.target.value)}
                  onPaste={(e) => {
                    e.stopPropagation();
                  }}
                  placeholder="Paste payload QRIS statis dari bank/PJSP di sini"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '0.78rem',
                    background: 'var(--surface-raised)',
                    boxShadow: 'inset 2px 2px 4px var(--shadow-dark), inset -2px -2px 4px var(--shadow-light)',
                    borderRadius: 8,
                    border: 'none',
                    resize: 'vertical',
                    minHeight: '84px',
                    color: 'var(--text-color)',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.45 }}>
                <Info size={16} />
                QRIS checkout akan membuat QR dinamis sesuai total belanja. Konfirmasi transaksi dilakukan kasir setelah pembayaran terlihat berhasil di aplikasi pembeli.
              </div>
            </div>

            {/* Offline-Sync / LAN settings */}
            <div className="soft-raised" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h4 style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--shadow-dark)', paddingBottom: 6 }}>
                OFFLINE SYNC & MULTI-TERMINAL (LAN)
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID Terminal Kasir</label>
                <input
                  type="text"
                  value={terminalId}
                  onChange={(e) => setTerminalId(e.target.value)}
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto-Sync Cloud</label>
                  <select
                    value={syncEnabled}
                    onChange={(e) => setSyncEnabled(e.target.value)}
                    className="input-soft"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', fontWeight: 700 }}
                  >
                    <option value="true">AKTIF (Kirim Otomatis)</option>
                    <option value="false">MATI (Sync Manual)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bertindak Sebagai Server LAN</label>
                  <select
                    value={isLanServer}
                    onChange={(e) => setIsLanServer(e.target.value)}
                    className="input-soft"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', fontWeight: 700 }}
                  >
                    <option value="false">TIDAK (Client Terminal)</option>
                    <option value="true">YA (Pusat DB Lokal)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.45 }}>
                <Info size={16} />
                Jika Auto-Sync Cloud aktif, transaksi dan shift pending akan dikirim otomatis selama Cloud Sync URL dan token sudah diisi.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button type="button" className="btn-soft" onClick={onClose} style={{ flex: 1, fontWeight: 800 }}>
                BATAL
              </button>
              <button type="submit" className="btn-primary" style={{ flex: 1, fontWeight: 800, gap: 6 }}>
                <Save size={16} /> SIMPAN PENGATURAN
              </button>
            </div>

          </form>
        )}
      </div>
    </div>
  );
}

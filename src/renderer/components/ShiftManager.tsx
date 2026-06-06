import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, Key, Calendar, DollarSign, X } from 'lucide-react';

interface ShiftManagerProps {
  currentShift: any;
  onOpenShift: (startCash: number) => void;
  onCloseShift: (endCashActual: number) => void;
  onAddTransaction: (type: 'cash_in' | 'cash_out', amount: number, reason: string) => void;
  onClose: () => void;
}

export default function ShiftManager({
  currentShift,
  onOpenShift,
  onCloseShift,
  onAddTransaction,
  onClose
}: ShiftManagerProps) {
  const [modalMode, setModalMode] = useState<'view' | 'open' | 'adjust' | 'close'>(
    currentShift ? 'view' : 'open'
  );
  
  // States for forms
  const [startCash, setStartCash] = useState('50000');
  const [adjustType, setAdjustType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [endCashActual, setEndCashActual] = useState('');
  const startCashInputRef = useRef<HTMLInputElement>(null);
  const adjustAmountInputRef = useRef<HTMLInputElement>(null);
  const endCashActualInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input =
      modalMode === 'open'
        ? startCashInputRef.current
        : modalMode === 'adjust'
          ? adjustAmountInputRef.current
          : modalMode === 'close'
            ? endCashActualInputRef.current
            : null;

    if (!input) return;

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }, [modalMode]);

  const handleOpen = () => {
    const val = parseFloat(startCash);
    if (isNaN(val) || val < 0) {
      alert('Masukkan modal awal yang valid.');
      return;
    }
    onOpenShift(val);
  };

  const handleAdjust = () => {
    const val = parseFloat(adjustAmount);
    if (isNaN(val) || val <= 0) {
      alert('Masukkan jumlah uang yang valid.');
      return;
    }
    if (!adjustReason.trim()) {
      alert('Tulis alasan kas masuk/keluar.');
      return;
    }
    onAddTransaction(adjustType, val, adjustReason.trim());
    setAdjustAmount('');
    setAdjustReason('');
    setModalMode('view');
  };

  const handleClose = () => {
    const val = parseFloat(endCashActual);
    if (isNaN(val) || val < 0) {
      alert('Masukkan nominal uang di laci kasir.');
      return;
    }
    onCloseShift(val);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h2 style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-color)' }}>
            {modalMode === 'open' && 'Buka Shift Baru'}
            {modalMode === 'view' && 'Status Shift Kasir'}
            {modalMode === 'adjust' && 'Input Kas Masuk / Keluar'}
            {modalMode === 'close' && 'Tutup Shift Penjualan'}
          </h2>
          <button 
            className="btn-soft" 
            style={{ padding: 6, borderRadius: '50%' }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* 1. Open Shift Form */}
        {modalMode === 'open' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 6 }}>
              Anda belum membuka shift kasir. Buka shift dengan mengisi modal kas awal untuk melacak selisih kas laci.
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Modal Kas Awal (Rp)</label>
              <input
                ref={startCashInputRef}
                className="input-soft"
                type="number"
                value={startCash}
                onChange={(e) => setStartCash(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleOpen();
                  }
                }}
                style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 800 }}
                placeholder="50000"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
              <button className="btn-soft" onClick={onClose} style={{ fontWeight: 800 }}>BATAL</button>
              <button className="btn-primary" onClick={handleOpen} style={{ fontWeight: 800 }}>BUKA SHIFT</button>
            </div>
          </div>
        )}

        {/* 2. View Active Shift Status */}
        {modalMode === 'view' && currentShift && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="soft-pressed" style={{ padding: 16, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Kasir Aktif:</span>
                <span style={{ fontWeight: 800 }}>{currentShift.cashier_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Shift Dibuka:</span>
                <span style={{ fontWeight: 700 }}>{new Date(currentShift.start_time).toLocaleString('id-ID')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Modal Awal:</span>
                <span style={{ fontWeight: 800 }}>Rp {currentShift.start_cash.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <button 
                className="btn-soft"
                onClick={() => setModalMode('adjust')}
                style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 0', borderRadius: 16 }}
              >
                <div style={{ display: 'flex', gap: 4 }}>
                  <ArrowUpRight size={18} color="var(--primary-color)" />
                  <ArrowDownLeft size={18} color="var(--danger-color)" />
                </div>
                <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>Kas Masuk / Keluar</span>
              </button>

              <button 
                className="btn-danger"
                onClick={() => setModalMode('close')}
                style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 0', borderRadius: 16 }}
              >
                <Key size={18} />
                <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>Tutup Shift</span>
              </button>
            </div>
            
            <button className="btn-soft" onClick={onClose} style={{ fontWeight: 800, marginTop: 4 }}>KEMBALI</button>
          </div>
        )}

        {/* 3. Add Cash In/Out Transaction */}
        {modalMode === 'adjust' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Toggle Switch */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                className={`btn-soft ${adjustType === 'cash_in' ? 'active' : ''}`}
                onClick={() => setAdjustType('cash_in')}
                style={{
                  fontWeight: 800,
                  color: adjustType === 'cash_in' ? 'var(--primary-color)' : 'var(--text-color)',
                  border: adjustType === 'cash_in' ? '2px solid var(--primary-color)' : '1px solid transparent'
                }}
              >
                <ArrowUpRight size={16} /> UANG MASUK (CASH IN)
              </button>

              <button
                className={`btn-soft ${adjustType === 'cash_out' ? 'active' : ''}`}
                onClick={() => setAdjustType('cash_out')}
                style={{
                  fontWeight: 800,
                  color: adjustType === 'cash_out' ? 'var(--danger-color)' : 'var(--text-color)',
                  border: adjustType === 'cash_out' ? '2px solid var(--danger-color)' : '1px solid transparent'
                }}
              >
                <ArrowDownLeft size={16} /> UANG KELUAR (CASH OUT)
              </button>
            </div>

            {/* Input Amount */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nominal Uang (Rp)</label>
              <input
                ref={adjustAmountInputRef}
                className="input-soft"
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                style={{ fontSize: '1.25rem', fontWeight: 800 }}
                placeholder="Masukkan jumlah nominal..."
              />
            </div>

            {/* Input Reason */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Alasan / Keterangan</label>
              <input
                className="input-soft"
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Misal: Tukar kembalian, Beli lakban..."
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
              <button className="btn-soft" onClick={() => setModalMode('view')} style={{ fontWeight: 800 }}>BATAL</button>
              <button 
                className="btn-primary" 
                onClick={handleAdjust} 
                style={{ fontWeight: 800, backgroundColor: adjustType === 'cash_in' ? 'var(--primary-color)' : 'var(--danger-color)' }}
              >
                SIMPAN KAS {adjustType === 'cash_in' ? 'MASUK' : 'KELUAR'}
              </button>
            </div>
          </div>
        )}

        {/* 4. Close Shift reconciliation */}
        {modalMode === 'close' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              Hitung total uang fisik di laci kasir saat ini secara manual. Input hasilnya di bawah ini untuk melihat selisih kas.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Uang Fisik di Laci (Rp)</label>
              <input
                ref={endCashActualInputRef}
                className="input-soft"
                type="number"
                value={endCashActual}
                onChange={(e) => setEndCashActual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleClose();
                  }
                }}
                style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 800 }}
                placeholder="0"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
              <button className="btn-soft" onClick={() => setModalMode('view')} style={{ fontWeight: 800 }}>BATAL</button>
              <button className="btn-danger" onClick={handleClose} style={{ fontWeight: 800 }}>TUTUP SHIFT KASIR</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

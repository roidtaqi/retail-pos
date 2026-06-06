import React, { useState, useEffect } from 'react';
import { FolderLock, ArrowLeft, DollarSign, Calendar, FileText, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface DebtManagerProps {
  onClose: () => void;
  onRefresh: () => void;
  userId: number;
}

export default function DebtManager({ onClose, onRefresh, userId }: DebtManagerProps) {
  const [debts, setDebts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDebtId, setSelectedDebtId] = useState<number | null>(null);
  const [debtDetail, setDebtDetail] = useState<any>(null);
  
  // Payment states
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer' | 'qris'>('cash');
  const [payNote, setPayNote] = useState('');

  useEffect(() => {
    loadDebts();
  }, []);

  const loadDebts = async () => {
    setLoading(true);
    try {
      const list = await (window as any).api.debts.getAll();
      setDebts(list);
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil data hutang.');
    } finally {
      setLoading(false);
    }
  };

  const loadDebtDetail = async (id: number) => {
    try {
      const detail = await (window as any).api.debts.getById(id);
      setDebtDetail(detail);
      setPayAmount(detail.remaining.toString());
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil detail hutang.');
    }
  };

  const handleSelectDebt = (id: number) => {
    setSelectedDebtId(id);
    loadDebtDetail(id);
  };

  const handlePayFullOrPartial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtDetail) return;
    const amountVal = parseFloat(payAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      alert('Masukkan nominal pembayaran yang valid.');
      return;
    }

    try {
      const res = await (window as any).api.debts.pay({
        debt_id: debtDetail.id,
        amount: amountVal,
        payment_method: payMethod,
        collected_by: userId,
        note: payNote.trim() || 'Bayar Cicilan/Hutang POS'
      });

      if (res.success) {
        alert('Pembayaran berhasil dicatat.');
        setPayNote('');
        loadDebtDetail(debtDetail.id);
        loadDebts();
        onRefresh();
      } else {
        alert(res.error || 'Gagal memproses pembayaran.');
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan.');
    }
  };

  const handlePayInstallment = async (installmentId: number, amount: number) => {
    if (!confirm(`Konfirmasi pembayaran cicilan sebesar Rp ${amount.toLocaleString('id-ID')}?`)) {
      return;
    }
    try {
      const res = await (window as any).api.debts.payInstallment({
        installment_id: installmentId,
        amount: amount,
        payment_method: 'cash',
        collected_by: userId,
        note: `Bayar cicilan ke`
      });

      if (res.success) {
        alert('Cicilan berhasil dibayar.');
        loadDebtDetail(debtDetail.id);
        loadDebts();
        onRefresh();
      } else {
        alert(res.error || 'Gagal memproses pembayaran cicilan.');
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan.');
    }
  };

  const getStatusBadge = (status: string) => {
    let bg = 'rgba(239, 68, 68, 0.15)';
    let color = 'var(--danger-color)';
    let label = 'BELUM LUNAS';

    if (status === 'paid') {
      bg = 'rgba(16, 185, 129, 0.15)';
      color = 'var(--primary-color)';
      label = 'LUNAS';
    } else if (status === 'partial') {
      bg = 'rgba(245, 158, 11, 0.15)';
      color = 'var(--warning-color)';
      label = 'SEBAGIAN';
    }

    return (
      <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', background: bg, color }}>
        {label}
      </span>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '900px', width: '95%', display: 'flex', flexDirection: 'column', height: '80vh' }}>
        <div className="modal-header">
          <h2 style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderLock color="#f97316" /> Monitoring & Pelunasan Hutang
          </h2>
          <button className="btn-soft" style={{ padding: 6, borderRadius: '50%' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {!selectedDebtId ? (
          /* List View */
          <div className="soft-raised" style={{ padding: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
            <h4 style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              Daftar Piutang Pelanggan ({debts.length})
            </h4>

            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Memuat data...</div>
            ) : debts.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Tidak ada data hutang aktif.</div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table className="table-soft" style={{ fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <th>Nama Pelanggan</th>
                      <th>No. Invoice</th>
                      <th>Jumlah Hutang</th>
                      <th>Sudah Dibayar</th>
                      <th>Sisa Hutang</th>
                      <th>Jatuh Tempo</th>
                      <th>Status</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debts.map((d) => (
                      <tr key={d.id}>
                        <td style={{ fontWeight: 700 }}>
                          {d.customer_name}
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{d.customer_phone}</div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{d.invoice_number || 'Tanpa Invoice'}</td>
                        <td>Rp {d.amount.toLocaleString('id-ID')}</td>
                        <td style={{ color: 'var(--primary-color)' }}>Rp {d.paid_amount.toLocaleString('id-ID')}</td>
                        <td style={{ fontWeight: 800, color: 'var(--danger-color)' }}>Rp {d.remaining.toLocaleString('id-ID')}</td>
                        <td>{d.due_date}</td>
                        <td>{getStatusBadge(d.status)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button className="btn-soft" style={{ fontSize: '0.72rem', padding: '6px 12px' }} onClick={() => handleSelectDebt(d.id)}>
                            RINCIAN
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Detail View */
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ marginBottom: 12 }}>
              <button className="btn-soft" onClick={() => setSelectedDebtId(null)} style={{ padding: '6px 12px', fontSize: '0.8rem', gap: 4 }}>
                <ArrowLeft size={14} /> Kembali ke Daftar
              </button>
            </div>

            {debtDetail ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, flex: 1, overflow: 'hidden' }}>
                
                {/* Left: Schedule & History */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingRight: 4 }}>
                  
                  {/* Debt Summary Block */}
                  <div className="soft-pressed" style={{ padding: 16, borderRadius: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)' }}>TOTAL PIUTANG</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, marginTop: 4 }}>Rp {debtDetail.amount.toLocaleString('id-ID')}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)' }}>SUDAH DIBAYAR</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--primary-color)', marginTop: 4 }}>Rp {debtDetail.paid_amount.toLocaleString('id-ID')}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)' }}>SISA HUTANG</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--danger-color)', marginTop: 4 }}>Rp {debtDetail.remaining.toLocaleString('id-ID')}</div>
                    </div>
                  </div>

                  {/* Installments Table */}
                  {debtDetail.installments && debtDetail.installments.length > 0 && (
                    <div className="soft-raised" style={{ padding: 14 }}>
                      <h4 style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={16} /> Jadwal Cicilan Pembayaran
                      </h4>
                      <table className="table-soft" style={{ fontSize: '0.8rem' }}>
                        <thead>
                          <tr>
                            <th>Cicilan</th>
                            <th>Jatuh Tempo</th>
                            <th>Besaran</th>
                            <th>Status</th>
                            <th style={{ width: '100px', textAlign: 'center' }}>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {debtDetail.installments.map((inst: any) => (
                            <tr key={inst.id}>
                              <td style={{ fontWeight: 700 }}>Ke-{inst.sequence_no}</td>
                              <td>{inst.due_date}</td>
                              <td style={{ fontWeight: 700 }}>Rp {inst.amount.toLocaleString('id-ID')}</td>
                              <td>
                                {inst.status === 'paid' ? (
                                  <span style={{ color: 'var(--primary-color)', fontWeight: 800, fontSize: '0.75rem' }}>LUNAS</span>
                                ) : (
                                  <span style={{ color: 'var(--danger-color)', fontWeight: 800, fontSize: '0.75rem' }}>BELUM DIBAYAR</span>
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {inst.status !== 'paid' && debtDetail.status !== 'paid' && (
                                  <button className="btn-primary" style={{ fontSize: '0.7rem', padding: '4px 10px' }} onClick={() => handlePayInstallment(inst.id, inst.amount)}>
                                    BAYAR
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Payments History */}
                  <div className="soft-raised" style={{ padding: 14 }}>
                    <h4 style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileText size={16} /> Riwayat Pembayaran
                    </h4>
                    {debtDetail.payments && debtDetail.payments.length > 0 ? (
                      <table className="table-soft" style={{ fontSize: '0.78rem' }}>
                        <thead>
                          <tr>
                            <th>Tanggal</th>
                            <th>Nominal</th>
                            <th>Metode</th>
                            <th>Catatan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {debtDetail.payments.map((p: any) => (
                            <tr key={p.id}>
                              <td>{new Date(p.created_at).toLocaleString('id-ID')}</td>
                              <td style={{ fontWeight: 700, color: 'var(--primary-color)' }}>Rp {p.amount.toLocaleString('id-ID')}</td>
                              <td>{p.payment_method.toUpperCase()}</td>
                              <td>{p.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 4px' }}>Belum ada transaksi pembayaran untuk piutang ini.</p>
                    )}
                  </div>
                </div>

                {/* Right: Payment Panel */}
                <div className="soft-raised" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h4 style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--shadow-dark)', paddingBottom: 6 }}>
                    INPUT PEMBAYARAN MANUAL
                  </h4>
                  
                  {debtDetail.status === 'paid' ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--primary-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <CheckCircle2 size={40} />
                      <span style={{ fontWeight: 800, fontSize: '1rem' }}>PIUTANG SUDAH LUNAS</span>
                    </div>
                  ) : (
                    <form onSubmit={handlePayFullOrPartial} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Jumlah Pembayaran (Rp)</label>
                        <input
                          type="number"
                          max={debtDetail.remaining}
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          className="input-soft"
                          style={{ width: '100%', padding: '8px 12px', fontSize: '1rem', fontWeight: 800, color: 'var(--danger-color)' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Metode Bayar</label>
                        <select
                          value={payMethod}
                          onChange={(e) => setPayMethod(e.target.value as any)}
                          className="input-soft"
                          style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', fontWeight: 700 }}
                        >
                          <option value="cash">TUNAI</option>
                          <option value="transfer">TRANSFER BANK</option>
                          <option value="qris">QRIS MANDIRI</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Catatan / Bukti</label>
                        <input
                          placeholder="Keterangan..."
                          value={payNote}
                          onChange={(e) => setPayNote(e.target.value)}
                          className="input-soft"
                          style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                        />
                      </div>

                      <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px 0', fontSize: '0.9rem', marginTop: 8 }}>
                        💰 PROSES BAYAR
                      </button>
                    </form>
                  )}
                  
                  <div className="soft-pressed" style={{ padding: 12, borderRadius: 8, fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.3, marginTop: 'auto' }}>
                    <strong>INFO:</strong> Pembayaran akan otomatis memotong total hutang pelanggan dan dicatat dalam audit log transaksi offline-first.
                  </div>
                </div>

              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Memuat detail...</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn-soft" onClick={onClose} style={{ fontWeight: 800 }}>TUTUP</button>
        </div>
      </div>
    </div>
  );
}

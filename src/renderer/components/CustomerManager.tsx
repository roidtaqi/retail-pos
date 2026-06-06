import React, { useState, useEffect } from 'react';
import { User, Plus, Trash2, Edit, X, ShieldAlert } from 'lucide-react';

interface CustomerManagerProps {
  onClose: () => void;
  onRefresh: () => void;
}

export default function CustomerManager({ onClose, onRefresh }: CustomerManagerProps) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('1000000');
  const [status, setStatus] = useState<'active' | 'blocked'>('active');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const list = await (window as any).api.customers.getAll();
      setCustomers(list);
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil data pelanggan.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Nama pelanggan tidak boleh kosong.');
      return;
    }

    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      credit_limit: parseFloat(creditLimit) || 0,
      status,
      notes: notes.trim()
    };

    try {
      if (editingId) {
        // Update
        const res = await (window as any).api.customers.update(editingId, payload);
        if (res.success) {
          alert('Data pelanggan berhasil diperbarui.');
          resetForm();
          loadCustomers();
          onRefresh();
        } else {
          alert(res.error || 'Gagal memperbarui data pelanggan.');
        }
      } else {
        // Create
        const res = await (window as any).api.customers.create(payload);
        if (res.success) {
          alert('Pelanggan berhasil ditambahkan.');
          resetForm();
          loadCustomers();
          onRefresh();
        } else {
          alert(res.error || 'Gagal menambahkan pelanggan.');
        }
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan.');
    }
  };

  const handleEdit = (cust: any) => {
    setEditingId(cust.id);
    setName(cust.name);
    setPhone(cust.phone || '');
    setAddress(cust.address || '');
    setCreditLimit((cust.credit_limit || 0).toString());
    setStatus(cust.status || 'active');
    setNotes(cust.notes || '');
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setAddress('');
    setCreditLimit('1000000');
    setStatus('active');
    setNotes('');
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '850px', width: '95%', display: 'flex', flexDirection: 'column', height: '80vh' }}>
        <div className="modal-header">
          <h2 style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <User color="#ec4899" /> Kelola Pelanggan (Member & Hutang)
          </h2>
          <button className="btn-soft" style={{ padding: 6, borderRadius: '50%' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, flex: 1, overflow: 'hidden' }}>
          {/* Left: Customers List Table */}
          <div className="soft-raised" style={{ padding: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h4 style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              Daftar Pelanggan Terdaftar ({customers.length})
            </h4>

            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Memuat data...</div>
            ) : customers.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Belum ada pelanggan terdaftar.</div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table className="table-soft" style={{ fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <th>Nama Pelanggan</th>
                      <th>No. Telp</th>
                      <th>Batas Kredit (Limit)</th>
                      <th>Outstanding Hutang</th>
                      <th>Status</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((cust) => (
                      <tr key={cust.id}>
                        <td style={{ fontWeight: 700 }}>
                          {cust.name}
                          {cust.notes && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>{cust.notes}</div>}
                        </td>
                        <td>{cust.phone || '-'}</td>
                        <td>Rp {cust.credit_limit.toLocaleString('id-ID')}</td>
                        <td style={{ fontWeight: 800, color: cust.total_debt > 0 ? 'var(--danger-color)' : 'var(--text-color)' }}>
                          Rp {cust.total_debt.toLocaleString('id-ID')}
                        </td>
                        <td>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: cust.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: cust.status === 'active' ? 'var(--primary-color)' : 'var(--danger-color)'
                          }}>
                            {cust.status === 'active' ? 'AKTIF' : 'BLOCKED'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button className="btn-soft" style={{ padding: 6 }} onClick={() => handleEdit(cust)}>
                              <Edit size={14} color="var(--info-color)" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right: Add/Edit Form */}
          <div className="soft-raised" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
            <h4 style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              {editingId ? 'EDIT PELANGGAN' : 'TAMBAH PELANGGAN'}
            </h4>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nama Pelanggan</label>
                <input
                  type="text"
                  placeholder="Misal: Ahmad Zaelani"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>No. Handphone (WA)</label>
                <input
                  type="text"
                  placeholder="Misal: 0812345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Alamat Lengkap</label>
                <textarea
                  placeholder="Alamat rumah..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '0.85rem',
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Batas Maksimal Hutang (Rp)</label>
                <input
                  type="number"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status Pelanggan</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', fontWeight: 700 }}
                >
                  <option value="active">AKTIF (Boleh Hutang)</option>
                  <option value="blocked">BLOCKED (Kunci Transaksi Hutang)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Catatan Lain</label>
                <input
                  type="text"
                  placeholder="Misal: Suka belanja bulanan"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {editingId && (
                  <button
                    type="button"
                    className="btn-soft"
                    style={{ flex: 1, padding: '10px 0', fontSize: '0.8rem' }}
                    onClick={resetForm}
                  >
                    BATAL
                  </button>
                )}
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ flex: 2, padding: '10px 0', fontSize: '0.85rem' }}
                >
                  {editingId ? 'SIMPAN' : 'TAMBAH'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn-soft" onClick={onClose} style={{ fontWeight: 800 }}>TUTUP</button>
        </div>
      </div>
    </div>
  );
}

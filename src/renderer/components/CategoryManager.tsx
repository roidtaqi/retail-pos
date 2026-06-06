import React, { useState, useEffect } from 'react';
import { Layers, Plus, Trash2, Edit, X } from 'lucide-react';

interface CategoryManagerProps {
  onClose: () => void;
  onRefresh: () => void;
}

export default function CategoryManager({ onClose, onRefresh }: CategoryManagerProps) {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const list = await (window as any).api.categories.getAll();
      setCategories(list);
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil data kategori.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Nama kategori tidak boleh kosong.');
      return;
    }

    try {
      if (editingId) {
        // Update
        const res = await (window as any).api.categories.update(editingId, {
          name: name.trim(),
          sort_order: parseInt(sortOrder) || 0
        });
        if (res.success) {
          alert('Kategori berhasil diperbarui.');
          setEditingId(null);
          setName('');
          setSortOrder('0');
          loadCategories();
          onRefresh();
        } else {
          alert(res.error || 'Gagal memperbarui kategori.');
        }
      } else {
        // Create
        const res = await (window as any).api.categories.create({
          name: name.trim(),
          sort_order: parseInt(sortOrder) || 0
        });
        if (res.success) {
          alert('Kategori berhasil ditambahkan.');
          setName('');
          setSortOrder('0');
          loadCategories();
          onRefresh();
        } else {
          alert(res.error || 'Gagal menambahkan kategori.');
        }
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan.');
    }
  };

  const handleEdit = (cat: any) => {
    setEditingId(cat.id);
    setName(cat.name);
    setSortOrder(cat.sort_order.toString());
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Apakah Anda yakin ingin menghapus kategori ini? Kategori produk yang terikat mungkin akan kehilangan referensi.')) {
      return;
    }
    try {
      const res = await (window as any).api.categories.delete(id);
      if (res.success) {
        alert('Kategori berhasil dihapus.');
        if (editingId === id) {
          setEditingId(null);
          setName('');
          setSortOrder('0');
        }
        loadCategories();
        onRefresh();
      } else {
        alert(res.error || 'Gagal menghapus kategori.');
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '680px', width: '90%', display: 'flex', flexDirection: 'column', height: '70vh' }}>
        <div className="modal-header">
          <h2 style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers color="#a855f7" /> Kelola Kategori Produk
          </h2>
          <button className="btn-soft" style={{ padding: 6, borderRadius: '50%' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 16, flex: 1, overflow: 'hidden' }}>
          {/* List of categories */}
          <div className="soft-raised" style={{ padding: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h4 style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              Kategori Terdaftar ({categories.length})
            </h4>
            
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Memuat data...</div>
            ) : categories.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Belum ada kategori.</div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table className="table-soft" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Nama Kategori</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Urutan</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => (
                      <tr key={cat.id}>
                        <td style={{ fontWeight: 700 }}>{cat.name}</td>
                        <td style={{ textAlign: 'center' }}>{cat.sort_order}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button className="btn-soft" style={{ padding: 6 }} onClick={() => handleEdit(cat)}>
                              <Edit size={14} color="var(--info-color)" />
                            </button>
                            <button className="btn-soft" style={{ padding: 6 }} onClick={() => handleDelete(cat.id)}>
                              <Trash2 size={14} color="var(--danger-color)" />
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

          {/* Form */}
          <div className="soft-raised" style={{ padding: 16 }}>
            <h4 style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              {editingId ? 'EDIT KATEGORI' : 'TAMBAH KATEGORI'}
            </h4>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nama Kategori</label>
                <input
                  type="text"
                  placeholder="Misal: Sembako Pokok"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Urutan Tampil (Sort Order)</label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
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
                    onClick={() => {
                      setEditingId(null);
                      setName('');
                      setSortOrder('0');
                    }}
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

import React from 'react';
import { Plus, Minus, Trash2, Tag } from 'lucide-react';

interface CartItem {
  product_id: number;
  sku: string;
  name: string;
  sell_price: number;
  cost_price: number;
  quantity: number;
  discount: number; // Item discount
  subtotal: number;
}

interface CartProps {
  items: CartItem[];
  selectedItemIndex: number;
  setSelectedItemIndex: (idx: number) => void;
  onUpdateQty: (idx: number, qty: number) => void;
  onUpdateDiscount: (idx: number, discount: number) => void;
  onRemoveItem: (idx: number) => void;
  subtotal: number;
  discount: number; // Transaction discount
  total: number;
}

export default function Cart({
  items,
  selectedItemIndex,
  setSelectedItemIndex,
  onUpdateQty,
  onUpdateDiscount,
  onRemoveItem,
  subtotal,
  discount,
  total
}: CartProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      {/* Cart Items Table Panel */}
      <div 
        className="soft-raised" 
        style={{ 
          flex: 1, 
          overflow: 'hidden', 
          display: 'flex', 
          flexDirection: 'column',
          padding: '16px 8px' 
        }}
      >
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 8px' }}>
          {items.length === 0 ? (
            <div style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              color: 'var(--text-muted)',
              gap: 12
            }}>
              <span style={{ fontSize: '3rem' }}>🛒</span>
              <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>Keranjang Belanja Kosong</p>
              <p style={{ fontSize: '0.85rem' }}>Scan barcode produk untuk mulai memasukkan item</p>
            </div>
          ) : (
            <table className="table-soft">
              <thead>
                <tr>
                  <th style={{ width: '45%' }}>Produk</th>
                  <th style={{ width: '15%', textAlign: 'center' }}>Harga</th>
                  <th style={{ width: '20%', textAlign: 'center' }}>Qty</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Subtotal</th>
                  <th style={{ width: '5%' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isSelected = idx === selectedItemIndex;
                  return (
                    <tr
                      key={item.product_id}
                      onClick={() => setSelectedItemIndex(idx)}
                      className={isSelected ? 'soft-pressed' : ''}
                      style={{
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.04)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{item.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          SKU: {item.sku}
                        </div>
                        {item.discount > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                            <Tag size={12} color="var(--primary-color)" />
                            <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 700 }}>
                              Potongan: Rp {item.discount.toLocaleString('id-ID')}
                            </span>
                          </div>
                        )}
                      </td>
                      
                      <td style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 600 }}>
                        Rp {item.sell_price.toLocaleString('id-ID')}
                      </td>
                      
                      <td style={{ padding: '10px 12px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <button
                            className="btn-soft"
                            style={{ padding: 6, borderRadius: 8, minWidth: 28, height: 28 }}
                            onClick={() => onUpdateQty(idx, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus size={14} />
                          </button>
                          
                          <span style={{ width: 36, textAlign: 'center', fontWeight: 800, fontSize: '1.05rem' }}>
                            {item.quantity}
                          </span>
                          
                          <button
                            className="btn-soft"
                            style={{ padding: 6, borderRadius: 8, minWidth: 28, height: 28 }}
                            onClick={() => onUpdateQty(idx, item.quantity + 1)}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </td>
                      
                      <td style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 800 }}>
                        Rp {item.subtotal.toLocaleString('id-ID')}
                      </td>
                      
                      <td style={{ padding: '10px 12px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn-soft"
                          style={{ padding: 6, borderRadius: 8, minWidth: 28, height: 28, border: '1px solid rgba(239,68,68,0.2)' }}
                          onClick={() => onRemoveItem(idx)}
                        >
                          <Trash2 size={14} color="var(--danger-color)" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        
        {/* Keyboard Helper Footer */}
        {items.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.72rem',
            fontWeight: 800,
            color: 'var(--text-muted)',
            padding: '12px 16px 0 16px',
            borderTop: '2px solid var(--shadow-dark)'
          }}>
            <span>Keyboard Shortcuts:</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <span><kbd style={{ background: '#cbd5e1', padding: '2px 6px', borderRadius: 4 }}>↑↓</kbd> Pilih Item</span>
              <span><kbd style={{ background: '#cbd5e1', padding: '2px 6px', borderRadius: 4 }}>F2</kbd> Edit Qty</span>
              <span><kbd style={{ background: '#cbd5e1', padding: '2px 6px', borderRadius: 4 }}>F3</kbd> Diskon Item</span>
              <span><kbd style={{ background: '#cbd5e1', padding: '2px 6px', borderRadius: 4 }}>Del</kbd> Hapus</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Checkout Calculations Summary Panel */}
      <div className="soft-raised" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--text-muted)' }}>
          <span>Subtotal</span>
          <span>Rp {subtotal.toLocaleString('id-ID')}</span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--primary-color)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag size={16} /> Diskon Transaksi (F4)
          </span>
          <span>-Rp {discount.toLocaleString('id-ID')}</span>
        </div>
        
        <div style={{
          height: 2,
          background: 'var(--shadow-dark)',
          boxShadow: 'inset 0 1px 1px var(--shadow-light)',
          margin: '4px 0'
        }} />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-color)' }}>TOTAL BELANJA</span>
          <span className="total-large" style={{ color: 'var(--primary-color)', lineHeight: 1 }}>
            Rp {total.toLocaleString('id-ID')}
          </span>
        </div>
      </div>
    </div>
  );
}

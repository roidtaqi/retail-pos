import React, { useState, useEffect } from 'react';
import { Search, Barcode, HelpCircle } from 'lucide-react';

interface ProductSearchProps {
  onSelectProduct: (product: any) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  isModalOpen: boolean;
}

export default function ProductSearch({ onSelectProduct, searchInputRef, isModalOpen }: ProductSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Trigger search on query change
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (query.trim() === '') {
        setResults([]);
        return;
      }
      
      try {
        // Direct IPC invoke
        const products = await (window as any).api.products.search(query);
        setResults(products);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Failed to search products:', err);
      }
    }, 150); // Small debounce

    return () => clearTimeout(delayDebounce);
  }, [query]);

  // Handle keyboard navigation in search results
  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) {
      if (e.key === 'Enter' && query.trim() !== '') {
        // Try searching exact barcode if user typed and pressed Enter
        try {
          const product = await (window as any).api.products.getByBarcode(query.trim());
          if (product) {
            onSelectProduct(product);
            setQuery('');
            setResults([]);
            e.preventDefault();
          }
        } catch (err) {
          console.error(err);
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        onSelectProduct(results[selectedIndex]);
        setQuery('');
        setResults([]);
      }
    } else if (e.key === 'Escape') {
      setQuery('');
      setResults([]);
      searchInputRef.current?.blur();
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Search Input Container */}
      <div 
        className="soft-pressed" 
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '2px 16px',
          background: 'var(--surface-raised)',
          borderRadius: '16px'
        }}
      >
        <Search size={22} color="var(--text-muted)" style={{ marginRight: 12 }} />
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scan Barcode atau Cari Nama Produk/SKU... (F1)"
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            padding: '16px 0',
            fontSize: '1.15rem',
            fontWeight: 600,
            outline: 'none',
            color: 'var(--text-color)'
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Barcode size={24} color="var(--primary-color)" />
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', background: 'var(--bg-color)', padding: '4px 8px', borderRadius: 6, boxShadow: 'inset 1px 1px 2px var(--shadow-dark)' }}>ALWAYS FOCUS</span>
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {results.length > 0 && (
        <div 
          className="soft-raised"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            zIndex: 100,
            maxHeight: '380px',
            overflowY: 'auto',
            background: 'var(--surface-raised)',
            padding: 8
          }}
        >
          {results.map((product, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={product.id}
                onClick={() => {
                  onSelectProduct(product);
                  setQuery('');
                  setResults([]);
                }}
                className={isSelected ? 'soft-pressed' : ''}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  marginBottom: idx === results.length - 1 ? 0 : 4,
                  backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                  border: isSelected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                  transition: 'all 0.15s ease'
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: isSelected ? 'var(--primary-color)' : 'var(--text-color)' }}>
                    {product.name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 12 }}>
                    <span>SKU: <strong>{product.sku}</strong></span>
                    <span>Barcode: <strong>{product.barcode}</strong></span>
                    <span>Kategori: <strong>{product.category}</strong></span>
                  </div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-color)' }}>
                    Rp {product.sell_price.toLocaleString('id-ID')}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: product.stock <= 5 ? 'var(--danger-color)' : 'var(--text-muted)' }}>
                    Stok: {product.stock} {product.stock <= 5 ? '(Kritis)' : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

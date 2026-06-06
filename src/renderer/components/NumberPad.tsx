import React, { useState, useEffect } from 'react';
import { Delete, Check, X } from 'lucide-react';

interface NumberPadProps {
  title: string;
  initialValue: string;
  type: 'currency' | 'quantity' | 'percentage';
  onConfirm: (val: number) => void;
  onClose: () => void;
  totalForChange?: number;
}

export default function NumberPad({ title, initialValue, type, onConfirm, onClose, totalForChange }: NumberPadProps) {
  const [value, setValue] = useState(initialValue);

  // Bind physical keyboard events to the pad input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        e.stopPropagation();
        setValue((prev) => {
          if (prev === '0') return e.key;
          return prev + e.key;
        });
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        setValue((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
      } else if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        e.stopPropagation();
        // Decimal check for kilograms/liters if necessary, though mostly integers
        if (!value.includes('.')) {
          setValue((prev) => prev + '.');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [value]);

  const handleKeyPress = (num: string) => {
    setValue((prev) => {
      if (prev === '0') return num;
      return prev + num;
    });
  };

  const handleBackspace = () => {
    setValue((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  };

  const handleClear = () => {
    setValue('0');
  };

  const handleConfirm = () => {
    const parsed = parseFloat(value);
    onConfirm(isNaN(parsed) ? 0 : parsed);
  };

  // Quick cash helper keys (only for currency payment modes)
  const quickCashOptions = [
    5000, 10000, 20000, 50000, 100000, 200000
  ];

  const handleQuickCash = (amount: number) => {
    setValue(amount.toString());
  };

  const getFormattedDisplay = () => {
    if (type === 'currency') {
      const parsed = parseFloat(value);
      return `Rp ${isNaN(parsed) ? '0' : parsed.toLocaleString('id-ID')}`;
    }
    if (type === 'percentage') {
      return `${value} %`;
    }
    return `${value} pcs`;
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <h2 style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-color)' }}>{title}</h2>
          <button 
            className="btn-soft" 
            style={{ padding: 6, borderRadius: '50%' }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Big formatted output indicator */}
        <div 
          className="soft-pressed"
          style={{
            padding: '16px 20px',
            borderRadius: '16px',
            backgroundColor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}
        >
          {totalForChange !== undefined && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              <span>Total Belanja:</span>
              <span>Rp {totalForChange.toLocaleString('id-ID')}</span>
            </div>
          )}
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            borderBottom: totalForChange !== undefined ? '1px dashed #e2e8f0' : 'none', 
            paddingBottom: totalForChange !== undefined ? 6 : 0, 
            marginBottom: totalForChange !== undefined ? 4 : 0 
          }}>
            {totalForChange !== undefined && <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 700 }}>Uang Bayar:</span>}
            <div style={{ 
              fontSize: '2.2rem', 
              fontWeight: 800, 
              color: 'var(--text-color)', 
              wordBreak: 'break-all', 
              textAlign: 'right',
              width: '100%'
            }}>
              {getFormattedDisplay()}
            </div>
          </div>

          {totalForChange !== undefined && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontSize: '1.15rem', 
              fontWeight: 800, 
              color: (parseFloat(value) || 0) - totalForChange >= 0 ? 'var(--primary-color)' : 'var(--danger-color)' 
            }}>
              <span>{(parseFloat(value) || 0) - totalForChange >= 0 ? 'Kembalian:' : 'Kurang:'}</span>
              <span>Rp {Math.abs((parseFloat(value) || 0) - totalForChange).toLocaleString('id-ID')}</span>
            </div>
          )}
        </div>

        {/* Quick cash suggestions */}
        {type === 'currency' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
            marginTop: 6
          }}>
            {quickCashOptions.map((amount) => (
              <button
                key={amount}
                className="btn-soft"
                onClick={() => handleQuickCash(amount)}
                style={{ fontSize: '0.85rem', fontWeight: 800, padding: 8 }}
              >
                Rp {amount.toLocaleString('id-ID')}
              </button>
            ))}
          </div>
        )}

        {/* Keypad grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginTop: 10
        }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleKeyPress(num)}
              className="btn-soft"
              style={{ fontSize: '1.5rem', fontWeight: 700, padding: '16px 0', borderRadius: '16px' }}
            >
              {num}
            </button>
          ))}
          
          <button
            onClick={handleClear}
            className="btn-soft"
            style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--danger-color)' }}
          >
            CLEAR
          </button>
          
          <button
            onClick={() => handleKeyPress('0')}
            className="btn-soft"
            style={{ fontSize: '1.5rem', fontWeight: 700 }}
          >
            0
          </button>
          
          <button
            onClick={handleBackspace}
            className="btn-soft"
            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Action Panel */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginTop: 10
        }}>
          <button 
            className="btn-soft" 
            onClick={onClose}
            style={{ 
              fontWeight: 800, 
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--danger-color)' 
            }}
          >
            <X size={18} style={{ marginRight: 6 }} /> BATAL
          </button>
          
          <button 
            className="btn-primary" 
            onClick={handleConfirm}
            style={{ fontWeight: 800 }}
          >
            <Check size={18} style={{ marginRight: 6 }} /> KONFIRMASI
          </button>
        </div>
      </div>
    </div>
  );
}

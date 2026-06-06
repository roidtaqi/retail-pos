import React from 'react';
import { Printer, X } from 'lucide-react';

interface ReceiptPreviewProps {
  receiptText: string;
  onPrint: () => void;
  onClose: () => void;
}

export default function ReceiptPreview({ receiptText, onPrint, onClose }: ReceiptPreviewProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h2 style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-color)' }}>
            Transaksi Berhasil!
          </h2>
          <button 
            className="btn-soft" 
            style={{ padding: 6, borderRadius: '50%' }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Paper Receipt Simulation */}
        <div
          style={{
            background: '#fafafa',
            border: '1px solid #e2e8f0',
            boxShadow: 'inset 2px 2px 8px rgba(0,0,0,0.06), 4px 4px 10px var(--shadow-dark)',
            padding: '24px 16px',
            borderRadius: '8px',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            lineHeight: '1.4',
            whiteSpace: 'pre-wrap',
            color: '#1a202c',
            maxHeight: '380px',
            overflowY: 'auto',
            position: 'relative'
          }}
        >
          {/* Simulated receipt header design cut */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            backgroundImage: 'linear-gradient(-45deg, #ebedf2 3px, transparent 0), linear-gradient(45deg, #ebedf2 3px, transparent 0)',
            backgroundSize: '8px 6px',
            backgroundPosition: 'left top'
          }} />

          {receiptText}

          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            backgroundImage: 'linear-gradient(-45deg, transparent 3px, #ebedf2 0), linear-gradient(45deg, transparent 3px, #ebedf2 0)',
            backgroundSize: '8px 6px',
            backgroundPosition: 'left bottom'
          }} />
        </div>

        {/* Print & Dismiss Actions */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginTop: 6
        }}>
          <button 
            className="btn-soft" 
            onClick={onClose}
            style={{ fontWeight: 800 }}
          >
            TUTUP (Esc)
          </button>
          
          <button 
            className="btn-primary" 
            onClick={onPrint}
            style={{ fontWeight: 800 }}
          >
            <Printer size={18} style={{ marginRight: 6 }} /> CETAK STRUK
          </button>
        </div>
      </div>
    </div>
  );
}

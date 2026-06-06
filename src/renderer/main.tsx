import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './context/AppContext';
import './index.css';

console.log('DEBUG RENDERER: main.tsx entry point execution started!');

const hasElectronApi = typeof window !== 'undefined' && (window as any).api !== undefined;

if (!hasElectronApi) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        background: '#f3f4f6',
        color: '#1f2937',
        textAlign: 'center',
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '16px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          maxWidth: '500px'
        }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '16px', color: '#dc2626' }}>
            Buka Melalui Aplikasi Desktop!
          </h1>
          <p style={{ fontSize: '1rem', color: '#4b5563', lineHeight: '1.5', marginBottom: '24px' }}>
            Aplikasi POS Sembako ini menggunakan database lokal SQLite dan integrasi hardware printer yang hanya berjalan di dalam container <strong>Electron (Desktop App)</strong>.
          </p>
          <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.9rem', fontFamily: 'monospace', textAlign: 'left' }}>
            <span style={{ color: '#059669', fontWeight: 'bold' }}>Cara menjalankan:</span><br />
            1. Buka terminal di folder project.<br />
            2. Jalankan perintah:<br />
            <strong style={{ color: '#2563eb' }}>npm run dev</strong>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '24px' }}>
            Deteksi: Berjalan di Browser Biasa
          </p>
        </div>
      </div>
    </React.StrictMode>
  );
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </React.StrictMode>
  );
}

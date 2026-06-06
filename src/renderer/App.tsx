import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  Wifi, WifiOff, RefreshCw, LogOut, Shield, 
  FolderLock, ShoppingCart, User, Plus, FileText, 
  Settings, Key, AlertTriangle, ArrowRight, CheckCircle2,
  Trash2, Package, Layers, FileSpreadsheet, X, Maximize2, Minimize2
} from 'lucide-react';
import ProductSearch from './components/ProductSearch';
import Cart from './components/Cart';
import NumberPad from './components/NumberPad';
import ReceiptPreview from './components/ReceiptPreview';
import ShiftManager from './components/ShiftManager';
import CategoryManager from './components/CategoryManager';
import CustomerManager from './components/CustomerManager';
import DebtManager from './components/DebtManager';
import SettingsManager from './components/SettingsManager';
import { buildDynamicQrisPayload } from './utils/qris';

// TS Interfaces
interface CartItem {
  product_id: number;
  sku: string;
  name: string;
  sell_price: number;
  cost_price: number;
  quantity: number;
  discount: number;
  subtotal: number;
}

export default function App() {
  // Authentication & Shift States
  const [user, setUser] = useState<any>(null);
  const [currentShift, setCurrentShift] = useState<any>(null);
  const [cashierPin, setCashierPin] = useState('');
  const [selectedUser, setSelectedUser] = useState('kasir1'); // Default select
  const [allUsers, setAllUsers] = useState<any[]>([
    { id: 1, username: 'admin', name: 'Administrator', role: 'admin' },
    { id: 2, username: 'kasir1', name: 'Hasnawir', role: 'cashier' },
    { id: 3, username: 'kasir2', name: 'Roid Taqi', role: 'cashier' }
  ]);

  // Cart States
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCartItemIndex, setSelectedCartItemIndex] = useState(0);
  const [transactionDiscount, setTransactionDiscount] = useState(0);

  // Sync / Offline states
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [completedSyncCount, setCompletedSyncCount] = useState(0);
  const [failedSyncCount, setFailedSyncCount] = useState(0);

  // Modal Dialog states
  const [activeModal, setActiveModal] = useState<
    'none' | 'login' | 'shift_manager' | 'num_qty' | 'num_item_disc' | 'num_tx_disc' | 'num_pay' | 'receipt_preview' | 'reports' | 'products' | 'customers' | 'debts' | 'settings' | 'categories'
  >('login');

  // Extended DB caching states
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});

  // Checkout process settings
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'qris' | 'debt' | 'installment'>('cash');
  const [installmentCount, setInstallmentCount] = useState(1);
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  });
  const [checkoutNote, setCheckoutNote] = useState('');
  const [qrisDataUrl, setQrisDataUrl] = useState('');
  const [qrisError, setQrisError] = useState('');
  
  // Checkout cache
  const [paidAmount, setPaidAmount] = useState(0);
  const [receiptText, setReceiptText] = useState('');
  const [activeSaleId, setActiveSaleId] = useState<number | null>(null);

  // Reports cache
  const [reportsData, setReportsData] = useState<any>(null);
  const [selectedReportTab, setSelectedReportTab] = useState<'daily' | 'bestsellers' | 'inventory'>('daily');

  // Products CRUD & CSV cache
  const [productsData, setProductsData] = useState<any[]>([]);
  const [newProduct, setNewProduct] = useState({
    sku: '', name: '', barcode: '', category: 'Sembako', sell_price: 0, cost_price: 0, stock: 0
  });
  const [csvText, setCsvText] = useState('');
  const [importSummary, setImportSummary] = useState('');

  // Search Input ref for Autofocus enforcement
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [isFullScreen, setIsFullScreen] = useState(false);

  const toggleFullScreen = async () => {
    if ((window as any).api.windowControls) {
      const fs = await (window as any).api.windowControls.toggleFullScreen();
      setIsFullScreen(fs);
    }
  };

  // Initialize
  useEffect(() => {
    // Listen for background sync queue changes
    const unsubscribe = (window as any).api.sync.onStatusChange((status: any) => {
      setIsOnline(status.isOnline);
      setIsSyncing(status.isSyncing);
      setPendingSyncCount(status.pendingCount);
      setCompletedSyncCount(status.completedCount);
      setFailedSyncCount(status.failedCount);
    });

    // Check if shift is open
    checkShift();
    loadCustomers();
    loadCategories();
    loadSettings();

    // Check initial window fullscreen state
    if ((window as any).api.windowControls) {
      (window as any).api.windowControls.isFullScreen().then((fs: boolean) => {
        setIsFullScreen(fs);
      });
    }

    return () => {
      unsubscribe();
    };
  }, []);

  const loadCustomers = async () => {
    try {
      const list = await (window as any).api.customers.getAll();
      setCustomers(list);
    } catch (err) {
      console.error('Error loading customers:', err);
    }
  };

  const loadCategories = async () => {
    try {
      const list = await (window as any).api.categories.getAll();
      setCategories(list);
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  };

  const loadSettings = async () => {
    try {
      const data = await (window as any).api.settings.getAll();
      setSettings(data);
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  };

  // Sync state lookup helper
  const checkShift = async () => {
    try {
      const shift = await (window as any).api.shifts.getCurrent();
      setCurrentShift(shift);
      // If user is logged in, and shift is open, go to POS screen
      if (user && shift) {
        setActiveModal('none');
      } else if (!user) {
        setActiveModal('login');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Keyboard autofocus listener
  const forceSearchFocus = () => {
    const activeMod = activeModal;
    if (activeMod === 'none' && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  useEffect(() => {
    forceSearchFocus();
    
    const handleGlobalClick = () => {
      forceSearchFocus();
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Direct focus on key downs
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        forceSearchFocus();
      }
    };

    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [activeModal]);

  // Login Page Keyboard Shortcuts (0-9, Backspace, Enter, Escape)
  useEffect(() => {
    if (activeModal !== 'login') return;

    const handleLoginShortcuts = (e: KeyboardEvent) => {
      const numKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      if (numKeys.includes(e.key)) {
        e.preventDefault();
        setCashierPin((prev) => (prev.length < 4 ? prev + e.key : prev));
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setCashierPin((prev) => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handlePinLogin();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setCashierPin('');
      }
    };

    window.addEventListener('keydown', handleLoginShortcuts);
    return () => window.removeEventListener('keydown', handleLoginShortcuts);
  }, [activeModal, cashierPin, selectedUser]);

  // POS Keyboard Shortcuts (F1 - F9, Esc, Cart arrows)
  useEffect(() => {
    const handleShortcuts = (e: KeyboardEvent) => {
      if (activeModal === 'login') return;

      if (e.key === 'F1') {
        e.preventDefault();
        forceSearchFocus();
      } else if (e.key === 'F2') {
        e.preventDefault();
        if (cartItems.length > 0) {
          setActiveModal('num_qty');
        }
      } else if (e.key === 'F3') {
        e.preventDefault();
        if (cartItems.length > 0) {
          setActiveModal('num_item_disc');
        }
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cartItems.length > 0) {
          setActiveModal('num_tx_disc');
        }
      } else if (e.key === 'F5') {
        e.preventDefault();
        handleStartPayment();
      } else if (e.key === 'F6') {
        e.preventDefault();
        setActiveModal('shift_manager');
      } else if (e.key === 'F7') {
        // Toggle Network simulator
        e.preventDefault();
        (window as any).api.sync.getStatus().then((status: any) => {
          (window as any).api.sync.toggleNetwork(!status.isOnline).then((newState: boolean) => {
            setIsOnline(newState);
          });
        });
      } else if (e.key === 'F8') {
        e.preventDefault();
        loadReports();
        setActiveModal('reports');
      } else if (e.key === 'F9') {
        e.preventDefault();
        loadProducts();
        setActiveModal('products');
      } else if (e.key === 'F11') {
        e.preventDefault();
        toggleFullScreen();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (activeModal !== 'none') {
          setActiveModal('none');
        }
      } else if (e.key === 'ArrowUp') {
        // Move highlighted item in cart
        if (activeModal === 'none' && cartItems.length > 1) {
          e.preventDefault();
          setSelectedCartItemIndex((prev) => (prev - 1 + cartItems.length) % cartItems.length);
        }
      } else if (e.key === 'ArrowDown') {
        if (activeModal === 'none' && cartItems.length > 1) {
          e.preventDefault();
          setSelectedCartItemIndex((prev) => (prev + 1) % cartItems.length);
        }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const activeElement = document.activeElement as HTMLElement | null;
        const isSearchInputFocused = activeElement === searchInputRef.current;
        const searchInputIsEmpty = !searchInputRef.current?.value;
        const isEditingFormField = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';

        if (
          activeModal === 'none' &&
          cartItems.length > 0 &&
          (!isEditingFormField || (isSearchInputFocused && searchInputIsEmpty))
        ) {
          e.preventDefault();
          const selectedItem = cartItems[selectedCartItemIndex];
          if (e.key === 'ArrowRight') {
            updateQty(selectedCartItemIndex, selectedItem.quantity + 1);
          } else if (selectedItem.quantity > 1) {
            updateQty(selectedCartItemIndex, selectedItem.quantity - 1);
          }
        }
      } else if (e.key === 'Delete') {
        const activeElement = document.activeElement as HTMLElement | null;
        const isSearchInputFocused = activeElement === searchInputRef.current;
        const isEditingFormField = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';

        if (
          activeModal === 'none' &&
          cartItems.length > 0 &&
          (!isEditingFormField || isSearchInputFocused)
        ) {
          e.preventDefault();
          removeCartItem(selectedCartItemIndex);
        }
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [activeModal, cartItems, selectedCartItemIndex, currentShift]);

  // Loaders
  const loadReports = async () => {
    try {
      const summary = await (window as any).api.reports.getDailySummary();
      const best = await (window as any).api.reports.getBestSellers(5);
      const stock = await (window as any).api.reports.getStockLevels();
      setReportsData({ summary, best, stock });
    } catch (err) {
      console.error(err);
    }
  };

  const loadProducts = async () => {
    try {
      const list = await (window as any).api.products.getAll();
      setProductsData(list);
    } catch (err) {
      console.error(err);
    }
  };

  // Cart operations
  const getSubtotal = () => {
    return cartItems.reduce((acc, it) => acc + (it.sell_price * it.quantity - it.discount), 0);
  };
  
  const getTotal = () => {
    const sub = getSubtotal();
    const final = sub - transactionDiscount;
    return final > 0 ? final : 0;
  };

  useEffect(() => {
    let cancelled = false;

    const generateQris = async () => {
      if (paymentMethod !== 'qris') {
        setQrisDataUrl('');
        setQrisError('');
        return;
      }

      try {
        const payload = buildDynamicQrisPayload(settings.qris_static_payload || '', getTotal());
        const url = await QRCode.toDataURL(payload, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 220
        });

        if (!cancelled) {
          setQrisDataUrl(url);
          setQrisError('');
        }
      } catch (err: any) {
        if (!cancelled) {
          setQrisDataUrl('');
          setQrisError(err.message || 'QRIS gagal dibuat.');
        }
      }
    };

    generateQris();
    return () => {
      cancelled = true;
    };
  }, [paymentMethod, settings.qris_static_payload, cartItems, transactionDiscount]);

  const handleSelectProduct = (product: any) => {
    // Add to cart or increment quantity if already exists
    const idx = cartItems.findIndex(it => it.product_id === product.id);
    if (idx !== -1) {
      updateQty(idx, cartItems[idx].quantity + 1);
      setSelectedCartItemIndex(idx);
    } else {
      const newItem: CartItem = {
        product_id: product.id,
        sku: product.sku,
        name: product.name,
        sell_price: product.sell_price,
        cost_price: product.cost_price,
        quantity: 1,
        discount: 0,
        subtotal: product.sell_price
      };
      setCartItems((prev) => [...prev, newItem]);
      setSelectedCartItemIndex(cartItems.length);
    }
  };

  const updateQty = (idx: number, qty: number) => {
    if (qty < 1) return;
    setCartItems((prev) => {
      const updated = [...prev];
      const it = updated[idx];
      it.quantity = qty;
      it.subtotal = it.sell_price * qty - it.discount;
      return updated;
    });
  };

  const updateItemDiscount = (idx: number, disc: number) => {
    if (disc < 0) return;
    setCartItems((prev) => {
      const updated = [...prev];
      const it = updated[idx];
      it.discount = disc;
      it.subtotal = it.sell_price * it.quantity - disc;
      return updated;
    });
  };

  const removeCartItem = (idx: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== idx));
    setSelectedCartItemIndex(0);
  };

  // Auth Operations
  const handlePinLogin = async () => {
    try {
      const res = await (window as any).api.auth.login(selectedUser, cashierPin);
      if (res.success) {
        setUser(res.user);
        setCashierPin('');
        // Check if shift is open
        const activeShift = await (window as any).api.shifts.getCurrent();
        if (activeShift) {
          setCurrentShift(activeShift);
          setActiveModal('none');
        } else {
          setActiveModal('shift_manager');
        }
      } else {
        alert(res.error);
      }
    } catch (err: any) {
      alert(err.message || 'Gagal login.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentShift(null);
    setCartItems([]);
    setTransactionDiscount(0);
    setActiveModal('login');
  };

  // Shift Operations
  const handleOpenShift = async (startCash: number) => {
    if (!user) return;
    const res = await (window as any).api.shifts.open(user.id, startCash);
    if (res.success) {
      await checkShift();
      setActiveModal('none');
    } else {
      alert(res.error);
    }
  };

  const handleCloseShift = async (endCashActual: number) => {
    if (!currentShift) return;
    const res = await (window as any).api.shifts.close(currentShift.id, endCashActual);
    if (res.success) {
      alert(`Shift berhasil ditutup dan settle selesai!\nUang Laci Fisik: Rp ${endCashActual.toLocaleString('id-ID')}\nUang Laci Terhitung: Rp ${res.endCashExpected.toLocaleString('id-ID')}\nSelisih Kas: Rp ${res.cashDifference.toLocaleString('id-ID')}\n\nFile settle CSV:\n${res.settleCsvPath || '-'}`);
      setCurrentShift(null);
      handleLogout();
    } else {
      alert(res.error);
    }
  };

  const handleAddShiftAdjustment = async (type: 'cash_in' | 'cash_out', amount: number, reason: string) => {
    if (!currentShift) return;
    const res = await (window as any).api.shifts.addTransaction(currentShift.id, type, amount, reason);
    if (res.success) {
      alert(`Kas ${type === 'cash_in' ? 'Masuk' : 'Keluar'} berhasil dicatat.`);
    } else {
      alert(res.error);
    }
  };

  // Sales Checkout Operation
  const handleCheckoutConfirm = async (cashPaid: number) => {
    if (!user || !currentShift) return;
    
    const sub = getSubtotal();
    const finalTotal = getTotal();
    
    const isDebtOrInstallment = paymentMethod === 'debt' || paymentMethod === 'installment';
    const requiresExactPayment = paymentMethod === 'transfer' || paymentMethod === 'qris';
    const normalizedPaid = requiresExactPayment ? finalTotal : cashPaid;
    const change = isDebtOrInstallment || requiresExactPayment ? 0 : normalizedPaid - finalTotal;

    if (!isDebtOrInstallment && change < 0) {
      alert('Nominal uang pembayaran kurang!');
      return;
    }

    if (requiresExactPayment && normalizedPaid !== finalTotal) {
      alert('Transfer dan QRIS harus sesuai total belanja.');
      return;
    }

    if (isDebtOrInstallment && !selectedCustomerId) {
      alert('Pelanggan (Customer) harus dipilih untuk pembayaran Hutang/Cicilan!');
      return;
    }

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
    const customerName = selectedCustomer ? selectedCustomer.name : 'Cash Customer';

    // Generasi Nomor Invoice: INV-YYYYMMDD-XXXX (pad 4 digits / timestamp)
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const randStr = Math.floor(1000 + Math.random() * 9000).toString();
    const invoiceNumber = `INV-${todayStr}-${randStr}`;

    const salePayload = {
      invoice_number: invoiceNumber,
      cashier_id: user.id,
      shift_id: currentShift.id,
      customer_id: selectedCustomerId,
      customer_name: customerName,
      subtotal: sub,
      discount: transactionDiscount,
      total: finalTotal,
      payment_method: paymentMethod,
      payment_amount: normalizedPaid,
      change_amount: change,
      idempotency_key: `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      items: cartItems.map(it => ({
        product_id: it.product_id,
        sku: it.sku,
        name: it.name,
        sell_price: it.sell_price,
        cost_price: it.cost_price,
        quantity: it.quantity,
        discount: it.discount,
        subtotal: it.subtotal
      })),
      due_date: dueDate,
      installment_count: paymentMethod === 'installment' ? installmentCount : 1,
      note: checkoutNote
    };

    const res = await (window as any).api.sales.checkout(salePayload);
    if (res.success) {
      setActiveSaleId(res.saleId);
      // Print simulation
      const printRes = await (window as any).api.sales.printReceipt(res.saleId);
      setReceiptText(printRes.receiptText);
      
      // Clear Cart
      setCartItems([]);
      setTransactionDiscount(0);
      setPaidAmount(0);
      setPaymentMethod('cash');
      setSelectedCustomerId(null);
      setCheckoutNote('');
      setInstallmentCount(1);
      
      // Reload customers to refresh credit status
      loadCustomers();
      
      setActiveModal('receipt_preview');
    } else {
      alert(res.error);
    }
  };

  const handleStartPayment = async () => {
    if (!currentShift) {
      alert('Buka shift kasir terlebih dahulu!');
      return;
    }

    if (cartItems.length === 0) return;

    if (paymentMethod === 'debt' || paymentMethod === 'installment') {
      if (!selectedCustomerId) {
        alert('Harap pilih Pelanggan terlebih dahulu untuk metode Hutang/Cicilan!');
        return;
      }
      setPaidAmount(0);
      setActiveModal('num_pay');
      return;
    }

    if (paymentMethod === 'transfer') {
      await handleCheckoutConfirm(getTotal());
      return;
    }

    if (paymentMethod === 'qris') {
      if (qrisError || !qrisDataUrl) {
        alert(qrisError || 'QRIS belum siap. Isi payload QRIS merchant di Pengaturan terlebih dahulu.');
        return;
      }

      const ok = window.confirm('Pastikan pembayaran QRIS sudah berhasil di aplikasi pembeli sebelum menyelesaikan transaksi.');
      if (ok) {
        await handleCheckoutConfirm(getTotal());
      }
      return;
    }

    setPaidAmount(getTotal());
    setActiveModal('num_pay');
  };

  // Bulk Product CSV import
  const handleImportCsv = async () => {
    if (!csvText.trim()) {
      alert('Pilihlah data CSV terlebih dahulu.');
      return;
    }

    try {
      // Basic CSV Parser (semicolon or comma split)
      const lines = csvText.split('\n');
      const headers = lines[0].toLowerCase().replace('\r', '').split(',');
      
      const parsedProducts: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = lines[i].replace('\r', '').split(',');
        
        // Match headers to product keys
        const p: any = {};
        headers.forEach((header, index) => {
          const val = cols[index]?.trim();
          if (header === 'sku' || header === 'name' || header === 'barcode' || header === 'category') {
            p[header] = val;
          } else if (header === 'sell_price' || header === 'cost_price' || header === 'stock') {
            p[header] = parseFloat(val) || 0;
          }
        });

        if (p.sku && p.name && p.barcode) {
          parsedProducts.push(p);
        }
      }

      if (parsedProducts.length === 0) {
        alert('Data CSV tidak valid. Gunakan kolom format: sku,name,barcode,category,sell_price,cost_price,stock');
        return;
      }

      const res = await (window as any).api.products.importCsv(parsedProducts);
      if (res.success) {
        setImportSummary(`Berhasil mengimpor: ${res.inserted} produk baru dimasukkan, ${res.updated} produk diupdate.`);
        setCsvText('');
        loadProducts();
      } else {
        alert(`Gagal impor: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Terjadi kesalahan parser: ${err.message}`);
    }
  };

  // Add Product manual
  const handleCreateProduct = async () => {
    if (!newProduct.sku || !newProduct.name || !newProduct.barcode) {
      alert('Semua bidang wajib diisi.');
      return;
    }
    const res = await (window as any).api.products.create(newProduct);
    if (res.success) {
      alert('Produk berhasil ditambahkan.');
      setNewProduct({ sku: '', name: '', barcode: '', category: 'Sembako', sell_price: 0, cost_price: 0, stock: 0 });
      loadProducts();
    } else {
      alert(res.error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      
      {/* 2. MAIN POS AREA */}
      <main className="pos-container" style={{ flex: 1, padding: '16px' }}>
        
        {/* 1. TOP HEADER STATUS BAR */}
        <header className="pos-header soft-raised" style={{ borderRadius: '0 0 16px 16px', background: 'var(--surface-raised)', borderBottom: '1px solid rgba(255,255,255,0.4)', margin: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h1 style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.5px', color: 'var(--primary-color)' }}>
              🛒 Toko Hasnawir
            </h1>
            {user && (
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                KASIR AKTIF: <strong>{user.name}</strong>
              </span>
            )}
          </div>

          {/* Indikator Online/Offline & Sync status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Sync Stats badge */}
            <div style={{ display: 'flex', gap: 6, fontSize: '0.78rem', fontWeight: 800 }}>
              <span style={{ color: 'var(--text-muted)', background: 'var(--bg-color)', padding: '4px 8px', borderRadius: 8, boxShadow: 'inset 1px 1px 2px var(--shadow-dark)' }}>
                PENDING SYNC: <strong style={{ color: pendingSyncCount > 0 ? 'var(--warning-color)' : 'var(--text-color)' }}>{pendingSyncCount}</strong>
              </span>
              <span style={{ color: 'var(--text-muted)', background: 'var(--bg-color)', padding: '4px 8px', borderRadius: 8, boxShadow: 'inset 1px 1px 2px var(--shadow-dark)' }}>
                SYNCED: <strong style={{ color: 'var(--primary-color)' }}>{completedSyncCount}</strong>
              </span>
            </div>

            <button 
              onClick={async () => {
                const res = await (window as any).api.sync.syncNow();
                if (!res.success) alert(res.error);
              }}
              className="btn-soft" 
              style={{ padding: '6px 12px', fontSize: '0.78rem', gap: 4 }}
              disabled={!isOnline || isSyncing}
            >
              <RefreshCw size={14} className={isSyncing ? 'spin-anim' : ''} />
              SYNC NOW
            </button>

            <button 
              onClick={toggleFullScreen}
              className="btn-soft" 
              style={{ padding: '6px 12px', fontSize: '0.78rem', gap: 4, border: '1px solid rgba(16, 185, 129, 0.2)' }}
            >
              {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              {isFullScreen ? 'LAYAR BIASA (F11)' : 'FULL SCREEN (F11)'}
            </button>

            {isOnline ? (
              <span className="badge badge-online">
                <Wifi size={14} /> ONLINE (F7)
              </span>
            ) : (
              <span className="badge badge-offline">
                <WifiOff size={14} /> OFFLINE (F7)
              </span>
            )}

            {user && (
              <button 
                onClick={handleLogout} 
                className="btn-soft" 
                style={{ padding: '6px 12px', fontSize: '0.78rem', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <LogOut size={14} color="var(--danger-color)" /> KELUAR
              </button>
            )}
          </div>
        </header>

        {/* Left Column: Product Search, Autocomplete & Shopping Cart */}
        <section className="pos-main-panel">
          <ProductSearch 
            onSelectProduct={handleSelectProduct}
            searchInputRef={searchInputRef}
            isModalOpen={activeModal !== 'none'}
          />

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Cart 
              items={cartItems}
              selectedItemIndex={selectedCartItemIndex}
              setSelectedItemIndex={setSelectedCartItemIndex}
              onUpdateQty={updateQty}
              onUpdateDiscount={updateItemDiscount}
              onRemoveItem={removeCartItem}
              subtotal={getSubtotal()}
              discount={transactionDiscount}
              total={getTotal()}
            />
          </div>
        </section>

        {/* Right Column: Checkout Functions & Keypad actions */}
        <section className="pos-cart-panel">
          {/* Main Action Tally Panel */}
          <div className="soft-raised" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', maxHeight: '55vh' }}>
            <h3 style={{ fontWeight: 800, fontSize: '1.1rem', borderBottom: '2px solid var(--shadow-dark)', paddingBottom: 8 }}>
              KASIR CHECKOUT
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>METODE PEMBAYARAN</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <button 
                  className={`btn-soft ${paymentMethod === 'cash' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('cash')}
                  style={paymentMethod === 'cash' ? { border: '2px solid var(--primary-color)', color: 'var(--primary-color)' } : {}}
                >
                  TUNAI
                </button>
                <button 
                  className={`btn-soft ${paymentMethod === 'transfer' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('transfer')}
                  style={paymentMethod === 'transfer' ? { border: '2px solid var(--primary-color)', color: 'var(--primary-color)' } : {}}
                >
                  TRANSFER
                </button>
                <button 
                  className={`btn-soft ${paymentMethod === 'qris' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('qris')}
                  style={paymentMethod === 'qris' ? { border: '2px solid var(--primary-color)', color: 'var(--primary-color)' } : {}}
                >
                  QRIS
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                <button 
                  className={`btn-soft ${paymentMethod === 'debt' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('debt')}
                  style={paymentMethod === 'debt' ? { border: '2px solid var(--primary-color)', color: 'var(--primary-color)' } : {}}
                >
                  HUTANG
                </button>
                <button 
                  className={`btn-soft ${paymentMethod === 'installment' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('installment')}
                  style={paymentMethod === 'installment' ? { border: '2px solid var(--primary-color)', color: 'var(--primary-color)' } : {}}
                >
                  CICILAN
                </button>
              </div>
            </div>

            {paymentMethod === 'qris' && (
              <div className="soft-pressed" style={{ padding: 14, borderRadius: 12, background: '#fff', textAlign: 'center' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8 }}>
                  QRIS DINAMIS - Rp {getTotal().toLocaleString('id-ID')}
                </div>
                {qrisDataUrl ? (
                  <img
                    src={qrisDataUrl}
                    alt="QRIS pembayaran"
                    style={{ width: 180, height: 180, objectFit: 'contain', display: 'block', margin: '0 auto' }}
                  />
                ) : (
                  <div style={{ color: 'var(--danger-color)', fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.45 }}>
                    {qrisError || 'QRIS belum siap.'}
                  </div>
                )}
              </div>
            )}

            {paymentMethod === 'transfer' && (
              <div className="soft-pressed" style={{ padding: 12, borderRadius: 12, background: '#fff', fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                TRANSFER harus sesuai total: Rp {getTotal().toLocaleString('id-ID')}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>PELANGGAN</span>
              <select
                value={selectedCustomerId || ''}
                onChange={(e) => setSelectedCustomerId(e.target.value ? parseInt(e.target.value) : null)}
                className="input-soft"
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.9rem', fontWeight: 700 }}
              >
                <option value="">-- Pelanggan Umum --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.total_debt > 0 ? `(Hutang: Rp ${c.total_debt.toLocaleString('id-ID')})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {paymentMethod === 'installment' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>JUMLAH CICILAN (BULAN)</span>
                <input
                  type="number"
                  min="2"
                  max="36"
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(parseInt(e.target.value) || 2)}
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.9rem' }}
                />
              </div>
            )}

            {(paymentMethod === 'debt' || paymentMethod === 'installment') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>TENGGAT WAKTU (DUE DATE)</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="input-soft"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.9rem' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>CATATAN TRANSAKSI</span>
              <input
                placeholder="Catatan (opsional)"
                value={checkoutNote}
                onChange={(e) => setCheckoutNote(e.target.value)}
                className="input-soft"
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.9rem' }}
              />
            </div>

            <button 
              className="btn-primary" 
              onClick={handleStartPayment}
              style={{ padding: '16px 0', fontSize: '1.25rem', width: '100%', borderRadius: 16, marginTop: 8 }}
              disabled={cartItems.length === 0}
            >
              {paymentMethod === 'qris' ? '✅ KONFIRMASI QRIS (F5)' : paymentMethod === 'transfer' ? '✅ KONFIRMASI TRANSFER (F5)' : '💵 BAYAR / CHECKOUT (F5)'}
            </button>
          </div>

          {/* Quick Shortcuts Panel */}
          <div className="soft-raised operational-menu-panel" style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', minHeight: 0 }}>
            <h4 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--shadow-dark)', paddingBottom: 6 }}>
              AKSES MENU OPERASIONAL
            </h4>
            
            <div
              className="operational-menu-grid"
              onWheel={(event) => {
                const target = event.currentTarget;
                const direction = Math.sign(event.deltaY);

                if (direction !== 0) {
                  event.preventDefault();
                  target.scrollTop += direction * 28;
                }
              }}
            >
              <button className="btn-soft operational-menu-button" onClick={() => { loadProducts(); loadCategories(); setActiveModal('products'); }}>
                <Package size={18} color="var(--info-color)" />
                <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>Stok & CSV (F9)</span>
              </button>
              
              <button className="btn-soft operational-menu-button" onClick={() => { loadReports(); setActiveModal('reports'); }}>
                <FileText size={18} color="var(--primary-color)" />
                <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>Laporan (F8)</span>
              </button>
              
              <button className="btn-soft operational-menu-button" onClick={() => setActiveModal('shift_manager')}>
                <Key size={18} color="var(--warning-color)" />
                <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>Shift (F6)</span>
              </button>

              <button className="btn-soft operational-menu-button" onClick={() => { loadCategories(); setActiveModal('categories'); }}>
                <Layers size={18} color="#a855f7" />
                <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>Kategori</span>
              </button>

              <button className="btn-soft operational-menu-button" onClick={() => { loadCustomers(); setActiveModal('customers'); }}>
                <User size={18} color="#ec4899" />
                <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>Pelanggan</span>
              </button>

              <button className="btn-soft operational-menu-button" onClick={() => { setActiveModal('debts'); }}>
                <FolderLock size={18} color="#f97316" />
                <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>Hutang</span>
              </button>

              <button className="btn-soft operational-menu-button" onClick={() => { loadSettings(); setActiveModal('settings'); }}>
                <Settings size={18} color="#6b7280" />
                <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>Pengaturan</span>
              </button>
              
              <button 
                className="btn-soft operational-menu-button" 
                onClick={async () => {
                  const res = await (window as any).api.sync.syncNow();
                  if (!res.success) alert(res.error);
                }}
              >
                <RefreshCw size={18} color="var(--text-color)" />
                <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>Sync Queue</span>
              </button>
            </div>
            
          </div>
        </section>
      </main>

      {/* 3. PIN AUTH LOCK OVERLAY */}
      {activeModal === 'login' && (
        <div className="modal-overlay" style={{ background: 'var(--bg-color)', zIndex: 2000 }}>
          <div className="modal-content" style={{ maxWidth: '380px', padding: 32 }}>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: 'var(--surface-raised)',
                boxShadow: '4px 4px 8px var(--shadow-dark), -4px -4px 8px var(--shadow-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}>
                <FolderLock size={28} color="var(--primary-color)" />
              </div>
              <h2 style={{ fontWeight: 800, fontSize: '1.4rem' }}>LOGIN KASIR</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Pilih pengguna dan masukkan PIN untuk masuk
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Select User Dropdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pilih Kasir</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="input-soft"
                  style={{ width: '100%', fontSize: '0.98rem', fontWeight: 700 }}
                >
                  <option value="admin">Administrator (PIN: 9999)</option>
                  <option value="kasir1">Hasnawir (PIN: 1234)</option>
                  <option value="kasir2">Roid Taqi (PIN: 5678)</option>
                </select>
              </div>

              {/* Input PIN Display */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Input PIN (4 Digit)</label>
                <input
                  className="input-soft"
                  type="password"
                  value={cashierPin}
                  readOnly
                  style={{ textAlign: 'center', fontSize: '1.6rem', letterSpacing: 8, fontWeight: 800 }}
                  placeholder="••••"
                />
              </div>

              {/* Grid 3x4 PIN Pad */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                marginTop: 6
              }}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                  <button
                    key={num}
                    onClick={() => setCashierPin(prev => prev.length < 4 ? prev + num : prev)}
                    className="btn-soft"
                    style={{ fontSize: '1.25rem', fontWeight: 700, padding: 10 }}
                  >
                    {num}
                  </button>
                ))}
                <button 
                  onClick={() => setCashierPin('')} 
                  className="btn-soft"
                  style={{ fontSize: '0.8rem', color: 'var(--danger-color)', fontWeight: 800 }}
                >
                  CLEAR
                </button>
                <button
                  onClick={() => setCashierPin(prev => prev.length < 4 ? prev + '0' : prev)}
                  className="btn-soft"
                  style={{ fontSize: '1.25rem', fontWeight: 700, padding: 10 }}
                >
                  0
                </button>
                <button
                  onClick={() => setCashierPin(prev => prev.slice(0, -1))}
                  className="btn-soft"
                  style={{ fontSize: '0.8rem', fontWeight: 800 }}
                >
                  DEL
                </button>
              </div>

              <button 
                className="btn-primary" 
                onClick={handlePinLogin}
                style={{ width: '100%', padding: 14, fontWeight: 800, marginTop: 10 }}
              >
                MASUK SEKARANG <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL: SHIFT MANAGER (BUKA / TUTUP SHIFT) */}
      {activeModal === 'shift_manager' && (
        <ShiftManager 
          currentShift={currentShift}
          onOpenShift={handleOpenShift}
          onCloseShift={handleCloseShift}
          onAddTransaction={handleAddShiftAdjustment}
          onClose={() => setActiveModal('none')}
        />
      )}

      {/* 5. MODALS: NUMBER PAD ADJUSTMENTS */}
      {activeModal === 'num_qty' && cartItems[selectedCartItemIndex] && (
        <NumberPad 
          title="Ubah Quantity Item"
          initialValue={cartItems[selectedCartItemIndex].quantity.toString()}
          type="quantity"
          onConfirm={(val) => {
            updateQty(selectedCartItemIndex, val);
            setActiveModal('none');
          }}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'num_item_disc' && cartItems[selectedCartItemIndex] && (
        <NumberPad 
          title="Diskon Produk (Nominal Rp)"
          initialValue={cartItems[selectedCartItemIndex].discount.toString()}
          type="currency"
          onConfirm={(val) => {
            updateItemDiscount(selectedCartItemIndex, val);
            setActiveModal('none');
          }}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'num_tx_disc' && (
        <NumberPad 
          title="Diskon Transaksi / Belanja (Nominal Rp)"
          initialValue={transactionDiscount.toString()}
          type="currency"
          onConfirm={(val) => {
            setTransactionDiscount(val);
            setActiveModal('none');
          }}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'num_pay' && (
        <NumberPad 
          title={paymentMethod === 'debt' ? "Input Uang Muka Hutang (Rp) - Opsional (Bisa 0)" : paymentMethod === 'installment' ? "Input Uang Muka Cicilan (Rp) - Opsional (Bisa 0)" : "Input Pembayaran Tunai (Kembalian)"}
          initialValue={(paymentMethod === 'debt' || paymentMethod === 'installment') ? "0" : getTotal().toString()}
          type="currency"
          onConfirm={handleCheckoutConfirm}
          onClose={() => setActiveModal('none')}
          totalForChange={paymentMethod === 'cash' ? getTotal() : undefined}
        />
      )}

      {/* 6. MODAL: RECEIPT PREVIEW */}
      {activeModal === 'receipt_preview' && (
        <ReceiptPreview 
          receiptText={receiptText}
          onPrint={async () => {
            if (activeSaleId) {
              const res = await (window as any).api.sales.printReceipt(activeSaleId);
              if (res.success) {
                alert(`Struk berhasil dikirim ke printer. File simulasi dibuat di: ${res.filepath}`);
              } else {
                alert(`Gagal cetak: ${res.error}`);
              }
            }
          }}
          onClose={() => setActiveModal('none')}
        />
      )}

      {/* 7. MODAL: REPORTS SYSTEM */}
      {activeModal === 'reports' && reportsData && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px', width: '90%', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h2 style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText color="var(--primary-color)" /> Laporan Penjualan & Dashboard
              </h2>
              <button className="btn-soft" style={{ padding: 6, borderRadius: '50%' }} onClick={() => setActiveModal('none')}>
                <X size={18} />
              </button>
            </div>

            {/* Tabs selector */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <button 
                className={`btn-soft ${selectedReportTab === 'daily' ? 'active' : ''}`}
                onClick={() => setSelectedReportTab('daily')}
                style={{ fontWeight: 800 }}
              >
                Ringkasan Harian
              </button>
              <button 
                className={`btn-soft ${selectedReportTab === 'bestsellers' ? 'active' : ''}`}
                onClick={() => setSelectedReportTab('bestsellers')}
                style={{ fontWeight: 800 }}
              >
                Produk Terlaris
              </button>
              <button 
                className={`btn-soft ${selectedReportTab === 'inventory' ? 'active' : ''}`}
                onClick={() => setSelectedReportTab('inventory')}
                style={{ fontWeight: 800 }}
              >
                Audit Stok Kritis
              </button>
            </div>

            {/* Tab content scrollbox */}
            <div style={{ flex: 1, overflowY: 'auto', marginTop: 12, paddingRight: 4 }}>
              {selectedReportTab === 'daily' && reportsData.summary && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="soft-pressed" style={{ padding: 20, borderRadius: 16, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>TOTAL OMSET HARI INI</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-color)', marginTop: 6 }}>
                        Rp {reportsData.summary.total_sales.toLocaleString('id-ID')}
                      </div>
                    </div>
                    <div className="soft-pressed" style={{ padding: 20, borderRadius: 16, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>JUMLAH TRANSAKSI</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-color)', marginTop: 6 }}>
                        {reportsData.summary.transaction_count} Transaksi
                      </div>
                    </div>
                  </div>

                  <div className="soft-raised" style={{ padding: 18 }}>
                    <h4 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                      RINCIAN METODE PEMBAYARAN
                    </h4>
                    {reportsData.summary.payment_breakdown.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Belum ada data pembayaran hari ini.</p>
                    ) : (
                      <table className="table-soft">
                        <thead>
                          <tr>
                            <th>Metode</th>
                            <th style={{ textAlign: 'right' }}>Total Pembayaran</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportsData.summary.payment_breakdown.map((pm: any) => (
                            <tr key={pm.payment_method}>
                              <td style={{ fontWeight: 800 }}>{pm.payment_method.toUpperCase()}</td>
                              <td style={{ textAlign: 'right', fontWeight: 800 }}>Rp {pm.total.toLocaleString('id-ID')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {selectedReportTab === 'bestsellers' && (
                <div className="soft-raised" style={{ padding: 18 }}>
                  <h4 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                    5 PRODUK TERLARIS (TERBANYAK DIJUAL)
                  </h4>
                  {reportsData.best.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Belum ada produk yang terjual.</p>
                  ) : (
                    <table className="table-soft">
                      <thead>
                        <tr>
                          <th>Nama Produk</th>
                          <th>SKU</th>
                          <th style={{ textAlign: 'center' }}>Qty Terjual</th>
                          <th style={{ textAlign: 'right' }}>Total Penjualan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportsData.best.map((item: any, i: number) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 700 }}>{item.product_name}</td>
                            <td>{item.product_sku}</td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--primary-color)' }}>
                              {item.total_qty} pcs
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 800 }}>
                              Rp {item.total_sales.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {selectedReportTab === 'inventory' && reportsData.stock && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Valuation summary */}
                  <div className="soft-pressed" style={{ padding: 16, borderRadius: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)' }}>TOTAL SKU AKTIF</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 4 }}>{reportsData.stock.summary.total_skus}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)' }}>VALUASI MODAL STOK</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-color)', marginTop: 4 }}>
                        Rp {reportsData.stock.summary.total_valuation_cost.toLocaleString('id-ID')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)' }}>VALUASI POTENSI JUAL</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary-color)', marginTop: 4 }}>
                        Rp {reportsData.stock.summary.total_valuation_sell.toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>

                  <div className="soft-raised" style={{ padding: 18 }}>
                    <h4 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--danger-color)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={18} /> STOK HABIS / DI BAWAH BATAS KRITIS (&lt; 10 Pcs)
                    </h4>
                    {reportsData.stock.low_stock.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--primary-color)', fontWeight: 700 }}>
                        ✓ Semua stok aman. Tidak ada produk di bawah batas minimum.
                      </p>
                    ) : (
                      <table className="table-soft">
                        <thead>
                          <tr>
                            <th>Nama Produk</th>
                            <th>SKU</th>
                            <th>Kategori</th>
                            <th style={{ textAlign: 'center' }}>Stok Tersisa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportsData.stock.low_stock.map((item: any, i: number) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 700 }}>{item.name}</td>
                              <td>{item.sku}</td>
                              <td>{item.category}</td>
                              <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--danger-color)' }}>
                                {item.stock} pcs
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn-soft" onClick={() => setActiveModal('none')} style={{ fontWeight: 800 }}>TUTUP LAPORAN</button>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: PRODUCTS DATABASE & CSV IMPORTER */}
      {activeModal === 'products' && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '900px', width: '95%', height: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h2 style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package color="var(--info-color)" /> Master Database Produk
              </h2>
              <button className="btn-soft" style={{ padding: 6, borderRadius: '50%' }} onClick={() => setActiveModal('none')}>
                <X size={18} />
              </button>
            </div>

            {/* Split layout: left is list, right is manual add / CSV input */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, flex: 1, overflow: 'hidden' }}>
              
              {/* Left Side: Product List Table */}
              <div className="soft-raised" style={{ padding: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <h4 style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                  Daftar SKU Terdaftar ({productsData.length})
                </h4>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  <table className="table-soft" style={{ fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Nama Produk</th>
                        <th>Barcode</th>
                        <th style={{ textAlign: 'right' }}>Harga Modal</th>
                        <th style={{ textAlign: 'right' }}>Harga Jual</th>
                        <th style={{ textAlign: 'center' }}>Stok</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productsData.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 700 }}>{p.sku}</td>
                          <td style={{ fontWeight: 700 }}>{p.name}</td>
                          <td>{p.barcode}</td>
                          <td style={{ textAlign: 'right' }}>Rp {p.cost_price.toLocaleString('id-ID')}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>Rp {p.sell_price.toLocaleString('id-ID')}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: p.stock <= 5 ? 'var(--danger-color)' : 'var(--text-color)' }}>
                            {p.stock}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Side: Tab Forms (Manual Create vs CSV importer) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingRight: 4 }}>
                
                {/* Form 1: CSV Importer */}
                <div className="soft-raised" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <h4 style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileSpreadsheet size={16} /> IMPOR CSV/EXCEL (2000+ SKU)
                  </h4>

                  <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="Tempel / Paste data CSV di sini... Format header: sku,name,barcode,category,sell_price,cost_price,stock"
                    style={{
                      height: '80px',
                      background: 'var(--surface-raised)',
                      border: 'none',
                      boxShadow: 'inset 2px 2px 4px var(--shadow-dark), inset -2px -2px 4px var(--shadow-light)',
                      borderRadius: 8,
                      padding: 8,
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      resize: 'none',
                      outline: 'none',
                      color: 'var(--text-color)'
                    }}
                  />
                  
                  {importSummary && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 700, lineHeight: 1.2 }}>
                      {importSummary}
                    </div>
                  )}

                  <button className="btn-primary" onClick={handleImportCsv} style={{ fontSize: '0.8rem', padding: '10px 0' }}>
                    EKSEKUSI IMPOR DATA
                  </button>
                </div>

                {/* Form 2: Add Manual */}
                <div className="soft-raised" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <h4 style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    TAMBAH PRODUK BARU
                  </h4>
                  
                  <input
                    placeholder="Kode SKU (misal: BRS006)"
                    value={newProduct.sku}
                    onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                    style={{ padding: '8px 12px', fontSize: '0.82rem', borderRadius: 8 }}
                    className="input-soft"
                  />
                  <input
                    placeholder="Nama Produk (misal: Beras Premium)"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    style={{ padding: '8px 12px', fontSize: '0.82rem', borderRadius: 8 }}
                    className="input-soft"
                  />
                  <input
                    placeholder="Barcode (misal: 8990001)"
                    value={newProduct.barcode}
                    onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })}
                    style={{ padding: '8px 12px', fontSize: '0.82rem', borderRadius: 8 }}
                    className="input-soft"
                  />
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input
                      placeholder="Harga Modal"
                      type="number"
                      value={newProduct.cost_price || ''}
                      onChange={(e) => setNewProduct({ ...newProduct, cost_price: parseFloat(e.target.value) || 0 })}
                      style={{ padding: '8px 12px', fontSize: '0.82rem', borderRadius: 8 }}
                      className="input-soft"
                    />
                    <input
                      placeholder="Harga Jual"
                      type="number"
                      value={newProduct.sell_price || ''}
                      onChange={(e) => setNewProduct({ ...newProduct, sell_price: parseFloat(e.target.value) || 0 })}
                      style={{ padding: '8px 12px', fontSize: '0.82rem', borderRadius: 8 }}
                      className="input-soft"
                    />
                  </div>
                  
                  <input
                    placeholder="Stok Awal"
                    type="number"
                    value={newProduct.stock || ''}
                    onChange={(e) => setNewProduct({ ...newProduct, stock: parseFloat(e.target.value) || 0 })}
                    style={{ padding: '8px 12px', fontSize: '0.82rem', borderRadius: 8 }}
                    className="input-soft"
                  />

                  <button className="btn-soft" onClick={handleCreateProduct} style={{ width: '100%', padding: '10px 0', fontSize: '0.85rem' }}>
                    + SIMPAN PRODUK
                  </button>
                </div>

              </div>

            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-soft" onClick={() => setActiveModal('none')} style={{ fontWeight: 800 }}>TUTUP DATABASE</button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'categories' && (
        <CategoryManager
          onClose={() => setActiveModal('none')}
          onRefresh={loadCategories}
        />
      )}

      {activeModal === 'customers' && (
        <CustomerManager
          onClose={() => setActiveModal('none')}
          onRefresh={loadCustomers}
        />
      )}

      {activeModal === 'debts' && (
        <DebtManager
          onClose={() => setActiveModal('none')}
          onRefresh={loadCustomers}
          userId={user?.id || 1}
        />
      )}

      {activeModal === 'settings' && (
        <SettingsManager
          onClose={() => setActiveModal('none')}
          onRefresh={loadSettings}
        />
      )}

    </div>
  );
}

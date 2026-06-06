/**
 * App Context — Centralized state management using Context API
 * Replaces scattered useState hooks in App.tsx
 */

import React, { createContext, useContext, useReducer, ReactNode } from 'react';

export interface CartItem {
  product_id: number;
  sku: string;
  name: string;
  sell_price: number;
  cost_price: number;
  quantity: number;
  discount: number;
  subtotal: number;
}

export interface User {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'cashier';
  active: boolean;
}

export interface Shift {
  id: number;
  cashier_id: number;
  start_time: string;
  end_time?: string;
  start_cash: number;
  end_cash_expected?: number;
  end_cash_actual?: number;
  cash_difference?: number;
  status: 'open' | 'closed';
}

export interface SyncQueueItem {
  id: number;
  event_type: string;
  payload: string;
  idempotency_key: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  attempts: number;
  created_at: string;
}

export interface AppState {
  // Authentication & Shift
  user: User | null;
  currentShift: Shift | null;
  allUsers: User[];
  
  // Cart & Transaction
  cartItems: CartItem[];
  selectedCartItemIndex: number;
  transactionDiscount: number;
  
  // Offline / Sync Status
  isOnline: boolean;
  isSyncing: boolean;
  syncQueue: SyncQueueItem[];
  pendingSyncCount: number;
  completedSyncCount: number;
  failedSyncCount: number;
  
  // Modal / UI State
  activeModal: 'none' | 'login' | 'shift_manager' | 'num_qty' | 'num_item_disc' | 'num_tx_disc' | 'num_pay' | 'receipt_preview' | 'reports' | 'products' | 'customers' | 'debts' | 'settings' | 'categories';
  
  // Data Cache
  customers: any[];
  products: any[];
  categories: any[];
}

type AppAction = 
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_SHIFT'; payload: Shift | null }
  | { type: 'SET_USERS'; payload: User[] }
  | { type: 'ADD_CART_ITEM'; payload: CartItem }
  | { type: 'REMOVE_CART_ITEM'; payload: number }
  | { type: 'UPDATE_CART_ITEM'; payload: { index: number; item: CartItem } }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_SELECTED_CART_INDEX'; payload: number }
  | { type: 'SET_TRANSACTION_DISCOUNT'; payload: number }
  | { type: 'SET_ONLINE_STATUS'; payload: boolean }
  | { type: 'SET_SYNCING'; payload: boolean }
  | { type: 'SET_SYNC_QUEUE'; payload: SyncQueueItem[] }
  | { type: 'UPDATE_SYNC_COUNTS'; payload: { pending: number; completed: number; failed: number } }
  | { type: 'SET_ACTIVE_MODAL'; payload: AppState['activeModal'] }
  | { type: 'SET_CUSTOMERS'; payload: any[] }
  | { type: 'SET_PRODUCTS'; payload: any[] }
  | { type: 'SET_CATEGORIES'; payload: any[] };

const initialState: AppState = {
  user: null,
  currentShift: null,
  allUsers: [],
  
  cartItems: [],
  selectedCartItemIndex: 0,
  transactionDiscount: 0,
  
  isOnline: true,
  isSyncing: false,
  syncQueue: [],
  pendingSyncCount: 0,
  completedSyncCount: 0,
  failedSyncCount: 0,
  
  activeModal: 'login',
  
  customers: [],
  products: [],
  categories: []
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_SHIFT':
      return { ...state, currentShift: action.payload };
    case 'SET_USERS':
      return { ...state, allUsers: action.payload };
    case 'ADD_CART_ITEM':
      return { ...state, cartItems: [...state.cartItems, action.payload] };
    case 'REMOVE_CART_ITEM':
      return {
        ...state,
        cartItems: state.cartItems.filter((_, i) => i !== action.payload)
      };
    case 'UPDATE_CART_ITEM':
      return {
        ...state,
        cartItems: state.cartItems.map((item, i) =>
          i === action.payload.index ? action.payload.item : item
        )
      };
    case 'CLEAR_CART':
      return { ...state, cartItems: [], selectedCartItemIndex: 0 };
    case 'SET_SELECTED_CART_INDEX':
      return { ...state, selectedCartItemIndex: action.payload };
    case 'SET_TRANSACTION_DISCOUNT':
      return { ...state, transactionDiscount: action.payload };
    case 'SET_ONLINE_STATUS':
      return { ...state, isOnline: action.payload };
    case 'SET_SYNCING':
      return { ...state, isSyncing: action.payload };
    case 'SET_SYNC_QUEUE':
      return { ...state, syncQueue: action.payload };
    case 'UPDATE_SYNC_COUNTS':
      return {
        ...state,
        pendingSyncCount: action.payload.pending,
        completedSyncCount: action.payload.completed,
        failedSyncCount: action.payload.failed
      };
    case 'SET_ACTIVE_MODAL':
      return { ...state, activeModal: action.payload };
    case 'SET_CUSTOMERS':
      return { ...state, customers: action.payload };
    case 'SET_PRODUCTS':
      return { ...state, products: action.payload };
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload };
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}

// Convenience hooks for specific slices
export function useAuth() {
  const { state, dispatch } = useApp();
  return {
    user: state.user,
    allUsers: state.allUsers,
    setUser: (user: User | null) => dispatch({ type: 'SET_USER', payload: user }),
    setAllUsers: (users: User[]) => dispatch({ type: 'SET_USERS', payload: users })
  };
}

export function useShift() {
  const { state, dispatch } = useApp();
  return {
    currentShift: state.currentShift,
    setShift: (shift: Shift | null) => dispatch({ type: 'SET_SHIFT', payload: shift })
  };
}

export function useCart() {
  const { state, dispatch } = useApp();
  return {
    items: state.cartItems,
    selectedIndex: state.selectedCartItemIndex,
    discount: state.transactionDiscount,
    addItem: (item: CartItem) => dispatch({ type: 'ADD_CART_ITEM', payload: item }),
    removeItem: (index: number) => dispatch({ type: 'REMOVE_CART_ITEM', payload: index }),
    updateItem: (index: number, item: CartItem) =>
      dispatch({ type: 'UPDATE_CART_ITEM', payload: { index, item } }),
    clearCart: () => dispatch({ type: 'CLEAR_CART' }),
    setSelectedIndex: (index: number) => dispatch({ type: 'SET_SELECTED_CART_INDEX', payload: index }),
    setDiscount: (discount: number) => dispatch({ type: 'SET_TRANSACTION_DISCOUNT', payload: discount })
  };
}

export function useSyncStatus() {
  const { state, dispatch } = useApp();
  return {
    isOnline: state.isOnline,
    isSyncing: state.isSyncing,
    syncQueue: state.syncQueue,
    pendingCount: state.pendingSyncCount,
    completedCount: state.completedSyncCount,
    failedCount: state.failedSyncCount,
    setOnlineStatus: (isOnline: boolean) => dispatch({ type: 'SET_ONLINE_STATUS', payload: isOnline }),
    setSyncing: (isSyncing: boolean) => dispatch({ type: 'SET_SYNCING', payload: isSyncing }),
    setSyncQueue: (queue: SyncQueueItem[]) => dispatch({ type: 'SET_SYNC_QUEUE', payload: queue }),
    updateSyncCounts: (pending: number, completed: number, failed: number) =>
      dispatch({ type: 'UPDATE_SYNC_COUNTS', payload: { pending, completed, failed } })
  };
}

export function useModal() {
  const { state, dispatch } = useApp();
  return {
    activeModal: state.activeModal,
    setActiveModal: (modal: AppState['activeModal']) =>
      dispatch({ type: 'SET_ACTIVE_MODAL', payload: modal })
  };
}

export function useDataCache() {
  const { state, dispatch } = useApp();
  return {
    customers: state.customers,
    products: state.products,
    categories: state.categories,
    setCustomers: (customers: any[]) => dispatch({ type: 'SET_CUSTOMERS', payload: customers }),
    setProducts: (products: any[]) => dispatch({ type: 'SET_PRODUCTS', payload: products }),
    setCategories: (categories: any[]) => dispatch({ type: 'SET_CATEGORIES', payload: categories })
  };
}

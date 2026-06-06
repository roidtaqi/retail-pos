/**
 * Custom Hooks for POS Application
 * useBarcode - Debounced barcode input handler
 * useSyncQueue - Manage offline sync queue
 * useOnlineStatus - Monitor and manage online/offline status
 */

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    electron?: {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>;
      };
    };
  }
}

/**
 * useBarcode - Handles debounced barcode scanner input
 * Delays processing by 50ms to avoid duplicate scans from USB barcode readers
 */
export function useBarcode(onBarcode: (barcode: string) => void) {
  const [barcode, setBarcode] = useState('');
  const debounceTimer = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only capture printable characters + Enter
      if (e.key === 'Enter') {
        if (barcode.trim()) {
          onBarcode(barcode.trim());
          setBarcode('');
        }
        e.preventDefault();
      } else if (e.key.length === 1) {
        setBarcode(prev => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [barcode, onBarcode]);

  // Debounce the barcode processing
  useEffect(() => {
    if (barcode.length === 0) return;

    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (barcode.trim()) {
        onBarcode(barcode.trim());
        setBarcode('');
      }
    }, 50);

    return () => clearTimeout(debounceTimer.current);
  }, [barcode, onBarcode]);

  return { barcode, setBarcode };
}

/**
 * useSyncQueue - Manage offline sync queue
 * Polls backend for pending sync events and retry failed ones
 */
export function useSyncQueue() {
  const [syncQueue, setSyncQueue] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const pollTimer = useRef<NodeJS.Timeout>();

  // Load sync queue from backend
  const loadSyncQueue = async () => {
    try {
      const response = await window.electron?.ipcRenderer.invoke('sync:getQueue');
      if (response?.success) {
        setSyncQueue(response.data);
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error);
    }
  };

  // Process pending syncs
  const processPending = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      const response = await window.electron?.ipcRenderer.invoke('sync:processPending');
      if (response?.success) {
        setSyncQueue(response.data);
      }
    } catch (error) {
      console.error('Failed to process sync queue:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Setup polling when component mounts
  useEffect(() => {
    loadSyncQueue();
    const timer = setInterval(loadSyncQueue, 10000); // Poll every 10s
    pollTimer.current = timer;

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  return { syncQueue, isProcessing, processPending, loadSyncQueue };
}

/**
 * useOnlineStatus - Monitor online/offline status
 * Implements both navigator.onLine and local ping check
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkConnection = async () => {
    setIsChecking(true);
    try {
      // Try to ping localhost API as secondary check
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('http://localhost:8765/api/health', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      setIsOnline(response.ok);
    } catch (error) {
      setIsOnline(false);
    } finally {
      setIsChecking(false);
    }
  };

  return { isOnline, isChecking, checkConnection };
}

/**
 * useDebounce - General purpose debounce hook
 * Useful for search, input validation, etc.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * useLocalStorage - Persist state to localStorage
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}

/**
 * usePrevious - Get previous value of a dependency
 * Useful for detecting value changes
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

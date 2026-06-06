import { clipboard, contextBridge, ipcRenderer } from 'electron';

async function invokeData(channel: string, ...args: any[]) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (response && typeof response === 'object' && 'success' in response && 'data' in response) {
    if (!response.success) {
      throw new Error(response.message || response.error || 'IPC request failed');
    }
    return response.data;
  }
  return response;
}

async function invokeLegacy(channel: string, ...args: any[]) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (response && typeof response === 'object' && 'success' in response && 'data' in response) {
    if (!response.success) {
      return {
        success: false,
        error: response.message || response.error || 'IPC request failed',
        code: response.code,
        errors: response.errors
      };
    }

    const data = response.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return { success: true, ...data };
    }
    return { success: true, data };
  }
  return response;
}

contextBridge.exposeInMainWorld('api', {
  auth: {
    login: async (username: string, pin: string) => {
      const result = await invokeLegacy('auth:login', username, pin);
      return result.success ? { success: true, user: result } : result;
    },
    verifyPin: (pin: string) => invokeLegacy('auth:verifyPin', pin),
  },
  products: {
    search: (query: string) => invokeData('products:search', query),
    getByBarcode: (barcode: string) => invokeData('products:getByBarcode', barcode),
    getAll: () => invokeData('products:getAll'),
    create: (product: any) => invokeLegacy('products:create', product),
    update: (id: number, product: any) => invokeLegacy('products:update', id, product),
    importCsv: (products: any[]) => ipcRenderer.invoke('products:importCsv', products),
  },
  shifts: {
    getCurrent: () => invokeData('shifts:getCurrent'),
    open: (cashierId: number, startCash: number) => invokeLegacy('shifts:open', cashierId, startCash),
    close: (shiftId: number, endCashActual: number) => invokeLegacy('shifts:close', shiftId, endCashActual),
    addTransaction: (shiftId: number, type: 'cash_in' | 'cash_out', amount: number, reason: string) => 
      invokeLegacy('shifts:addTransaction', shiftId, type, amount, reason),
    getTransactions: (shiftId: number) => invokeData('shifts:getTransactions', shiftId),
  },
  sales: {
    checkout: (sale: any) => ipcRenderer.invoke('sales:checkout', sale),
    printReceipt: (saleId: number) => ipcRenderer.invoke('sales:printReceipt', saleId),
  },
  reports: {
    getDailySummary: (date: string) => invokeData('reports:getDailySummary', date),
    getBestSellers: (limit: number) => invokeData('reports:getBestSellers', limit),
    getShiftPerformance: (shiftId: number) => invokeData('reports:getShiftPerformance', shiftId),
    getStockLevels: () => invokeData('reports:getStockLevels'),
    getStockCard: (productId: number) => invokeData('reports:getStockCard', productId),
  },
  sync: {
    getStatus: () => invokeData('sync:getStatus'),
    syncNow: () => invokeLegacy('sync:syncNow'),
    toggleNetwork: (forceState?: boolean) => invokeData('sync:toggleNetwork', forceState),
    onStatusChange: (callback: (data: any) => void) => {
      const subscription = (_event: any, data: any) => callback(data);
      ipcRenderer.on('sync:status-changed', subscription);
      return () => {
        ipcRenderer.removeListener('sync:status-changed', subscription);
      };
    }
  },
  categories: {
    getAll: () => invokeData('categories:getAll'),
    create: (category: any) => invokeLegacy('categories:create', category),
    update: (id: number, category: any) => invokeLegacy('categories:update', id, category),
    delete: (id: number) => invokeLegacy('categories:delete', id)
  },
  customers: {
    getAll: () => invokeData('customers:getAll'),
    getById: (id: number) => invokeData('customers:getById', id),
    create: (customer: any) => invokeLegacy('customers:create', customer),
    update: (id: number, customer: any) => invokeLegacy('customers:update', id, customer),
    getDebts: (id: number) => invokeData('customers:getDebts', id)
  },
  debts: {
    getAll: () => invokeData('debts:getAll'),
    getById: (id: number) => invokeData('debts:getById', id),
    pay: (payData: any) => invokeLegacy('debts:pay', payData),
    payInstallment: (payData: any) => invokeLegacy('debts:payInstallment', payData)
  },
  settings: {
    getAll: () => invokeData('settings:getAll'),
    update: (settingsData: Record<string, string>) => invokeLegacy('settings:update', settingsData)
  },
  printer: {
    getNames: () => invokeData('printer:getNames')
  },
  clipboard: {
    readText: () => clipboard.readText()
  },
  monitoring: {
    getInfo: () => invokeData('monitoring:getInfo')
  },
  windowControls: {
    toggleFullScreen: () => ipcRenderer.invoke('window:toggleFullScreen'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    isFullScreen: () => ipcRenderer.invoke('window:isFullScreen'),
  }
});

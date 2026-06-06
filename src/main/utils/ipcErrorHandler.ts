/**
 * IPC Error Handler Middleware
 * Standardizes error responses across all IPC handlers
 */

export interface IpcResponse<T = any> {
  success: boolean;
  message: string;
  code?: string;
  data?: T;
  errors?: Record<string, any>;
  timestamp?: string;
}

/**
 * Wrap IPC handler to provide consistent error handling
 */
export function wrapIpcHandler<T = any>(
  handler: (event: any, ...args: any[]) => Promise<T> | T
): (event: any, ...args: any[]) => Promise<IpcResponse<T>> {
  return async (event, ...args) => {
    try {
      const result = await Promise.resolve(handler(event, ...args));
      return {
        success: true,
        message: 'OK',
        data: result,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('IPC Handler Error:', error);
      
      return {
        success: false,
        message: error.message || 'Internal server error',
        code: error.code || 'INTERNAL_ERROR',
        ...(error.errors && { errors: error.errors }),
        timestamp: new Date().toISOString()
      };
    }
  };
}

/**
 * Custom error class for IPC errors
 */
export class IpcError extends Error {
  constructor(
    message: string,
    public code: string = 'INTERNAL_ERROR',
    public errors?: Record<string, any>,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'IpcError';
  }
}

// Common error codes
export const ERROR_CODES = {
  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  
  // Authentication errors (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  
  // Authorization errors (403)
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  
  // Conflict errors (409)
  CONFLICT: 'CONFLICT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  
  // Database errors (500)
  DATABASE_ERROR: 'DATABASE_ERROR',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  
  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
};

// Validation helper
export function validateRequired(obj: Record<string, any>, fields: string[]): Record<string, string> {
  const errors: Record<string, string> = {};
  fields.forEach(field => {
    if (!obj[field]) {
      errors[field] = `${field} is required`;
    }
  });
  return errors;
}

export function validateNumber(obj: Record<string, any>, fields: string[]): Record<string, string> {
  const errors: Record<string, string> = {};
  fields.forEach(field => {
    if (obj[field] !== undefined && isNaN(Number(obj[field]))) {
      errors[field] = `${field} must be a number`;
    }
  });
  return errors;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

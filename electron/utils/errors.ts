import type { ErrorResponse } from '../../shared/ipc';

type ErrorLike = {
  message?: string;
  response?: {
    data?: unknown;
    status?: number;
  };
};

export function getErrorMessage(error: unknown, fallback = '发生未知错误'): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error) {
    return error;
  }

  return fallback;
}

export function getNestedErrorMessage(
  error: unknown,
  extractor: (value: ErrorLike) => string | undefined,
  fallback = '发生未知错误',
): string {
  if (typeof error !== 'object' || error === null) {
    return getErrorMessage(error, fallback);
  }

  const extracted = extractor(error as ErrorLike);
  return extracted || getErrorMessage(error, fallback);
}

export function toErrorResponse(error: unknown, fallback = '发生未知错误'): ErrorResponse {
  return {
    success: false,
    error: getErrorMessage(error, fallback),
  };
}

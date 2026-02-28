export const MAX_FILES = 3;
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_TOTAL_FILES_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MIN_MESSAGE_LENGTH = 3;
export const MAX_MESSAGE_LENGTH = 2000;

export const ALLOWED_SENDERS = ['Od Spottera', 'Od Spotterki'] as const;
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/jpg',
] as const;

export const RATE_LIMIT_MAX = 8;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 min
export const API_RATE_LIMIT_MAX = 120;
export const API_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 min

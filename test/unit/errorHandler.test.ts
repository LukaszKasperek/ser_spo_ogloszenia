import multer from 'multer';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../../src/middleware/errorHandler';

function createResponseMock(): Response {
  const response = {} as Response;
  response.status = vi.fn().mockReturnValue(response);
  response.json = vi.fn().mockReturnValue(response);
  return response;
}

describe('errorHandler', () => {
  it('zwraca 400 dla LIMIT_FILE_SIZE', () => {
    const error = new multer.MulterError('LIMIT_FILE_SIZE');
    const response = createResponseMock();

    errorHandler(error, {} as never, response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Pojedynczy plik nie może być większy niż 15 MB.',
    });
  });

  it('zwraca 400 dla błędu typu pliku', () => {
    const error = new Error('Nieprawidłowy typ pliku');
    const response = createResponseMock();

    errorHandler(error, {} as never, response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Nieprawidłowy typ pliku. Akceptowane typy to: .jpeg, .png, .jpg',
    });
  });

  it('zwraca 500 dla nieobsłużonego błędu', () => {
    const response = createResponseMock();

    errorHandler(new Error('unexpected'), {} as never, response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Wystąpił błąd serwera.',
    });
  });
});

import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_TOTAL_FILES_SIZE_BYTES } from '../../src/constants';

const validationResultMock = vi.fn();
const sendEmailMock = vi.fn();
const validateFileSignaturesMock = vi.fn();
const cleanupUploadedFilesMock = vi.fn();

vi.mock('express-validator', () => ({
  validationResult: (...args: unknown[]) => validationResultMock(...args),
}));

vi.mock('../../src/utils/sendMail', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock('../../src/utils/fileHelpers', () => ({
  validateFileSignatures: (...args: unknown[]) =>
    validateFileSignaturesMock(...args),
  cleanupUploadedFiles: (...args: unknown[]) => cleanupUploadedFilesMock(...args),
}));

import { uploadController } from '../../src/controllers/uploadController';

function createResponseMock(): Response {
  const response = {} as Response;
  response.status = vi.fn().mockReturnValue(response);
  response.json = vi.fn().mockReturnValue(response);
  return response;
}

function mockValidationOk(): void {
  validationResultMock.mockReturnValue({
    isEmpty: () => true,
    array: () => [],
  });
}

describe('uploadController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanupUploadedFilesMock.mockResolvedValue(undefined);
    validateFileSignaturesMock.mockResolvedValue(true);
    sendEmailMock.mockResolvedValue(undefined);
  });

  it('zwraca 400 gdy walidacja pól nie przechodzi', async () => {
    validationResultMock.mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: 'Błąd walidacji' }],
    });
    const req = { body: {}, files: [] } as Request;
    const res = createResponseMock();

    await uploadController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Błąd walidacji' });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('zwraca 400 gdy łączny rozmiar plików przekracza limit', async () => {
    mockValidationOk();
    const req = {
      body: { sender: 'Od Spottera', message: 'Wiadomość testowa' },
      files: [{ size: MAX_TOTAL_FILES_SIZE_BYTES + 1, path: '/tmp/a.jpg' }],
    } as unknown as Request;
    const res = createResponseMock();

    await uploadController(req, res);

    expect(cleanupUploadedFilesMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('zwraca 400 gdy sygnatury plików są nieprawidłowe', async () => {
    mockValidationOk();
    validateFileSignaturesMock.mockResolvedValue(false);
    const req = {
      body: { sender: 'Od Spotterki', message: 'Wiadomość testowa' },
      files: [{ size: 1024, path: '/tmp/a.jpg' }],
    } as unknown as Request;
    const res = createResponseMock();

    await uploadController(req, res);

    expect(validateFileSignaturesMock).toHaveBeenCalledTimes(1);
    expect(cleanupUploadedFilesMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('zwraca 200 dla poprawnego żądania', async () => {
    mockValidationOk();
    const req = {
      body: { sender: 'Od Spottera', message: 'Wiadomość testowa' },
      files: [{ size: 1024, path: '/tmp/a.jpg', originalname: 'a.jpg' }],
    } as unknown as Request;
    const res = createResponseMock();

    await uploadController(req, res);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'ok' });
    expect(cleanupUploadedFilesMock).toHaveBeenCalledTimes(1);
  });

  it('zwraca 500 gdy wysyłka maila kończy się błędem', async () => {
    mockValidationOk();
    sendEmailMock.mockRejectedValue(new Error('smtp down'));
    const req = {
      body: { sender: 'Od Spottera', message: 'Wiadomość testowa' },
      files: [{ size: 1024, path: '/tmp/a.jpg', originalname: 'a.jpg' }],
    } as unknown as Request;
    const res = createResponseMock();

    await uploadController(req, res);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Wystąpił błąd serwera.' });
    expect(cleanupUploadedFilesMock).toHaveBeenCalledTimes(1);
  });
});

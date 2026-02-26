import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RATE_LIMIT_MAX } from '../../src/constants';

let sendEmailMock = vi.fn();

async function createApp() {
  vi.resetModules();
  sendEmailMock = vi.fn().mockResolvedValue(undefined);
  vi.doMock('../../src/utils/sendMail', () => ({
    sendEmail: sendEmailMock,
  }));
  const module = await import('../../src/app');
  return module.default;
}

describe('POST /upload', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('zwraca 200 dla poprawnego payloadu', async () => {
    const app = await createApp();

    const response = await request(app).post('/upload').send({
      sender: 'Od Spottera',
      message: 'Wiadomość testowa',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'ok' });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('zwraca 400 dla niepoprawnego sender', async () => {
    const app = await createApp();

    const response = await request(app).post('/upload').send({
      sender: 'Niepoprawny',
      message: 'Wiadomość testowa',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Nieprawidłowa wartość pola nadawcy');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('zwraca 429 po przekroczeniu limitu żądań', async () => {
    const app = await createApp();
    const payload = { sender: 'Od Spottera', message: 'Wiadomość testowa' };

    for (let attempt = 0; attempt < RATE_LIMIT_MAX; attempt += 1) {
      const okResponse = await request(app).post('/upload').send(payload);
      expect(okResponse.status).toBe(200);
    }

    const limitedResponse = await request(app).post('/upload').send(payload);
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body).toEqual({
      error: 'Zbyt wiele żądań, spróbuj ponownie później.',
    });
  });
});

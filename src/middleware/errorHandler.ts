import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';

export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res
        .status(400)
        .json({ error: 'Pojedynczy plik nie może być większy niż 15 MB.' });
      return;
    }
    res.status(400).json({ error: 'Nieprawidłowe dane pliku.' });
    return;
  }

  if (error instanceof Error && error.message === 'Nieprawidłowy typ pliku') {
    res.status(400).json({
      error: 'Nieprawidłowy typ pliku. Akceptowane typy to: .jpeg, .png, .jpg',
    });
    return;
  }

  res.status(500).json({ error: 'Wystąpił błąd serwera.' });
}

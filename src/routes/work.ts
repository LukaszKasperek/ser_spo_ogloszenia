import { Router } from 'express';
import {
  getWorkById,
  getWorkContact,
  getWorkList,
  postWorkFavorites,
} from '../controllers/workController';

const router = Router();

router.get('/api/praca', getWorkList);
router.get('/api/praca/:id', getWorkById);
router.get('/api/praca/:id/contact', getWorkContact);
router.post('/api/praca/favorites', postWorkFavorites);

export default router;

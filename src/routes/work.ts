import { Router } from 'express';
import {
  getWorkBySlug,
  getWorkContact,
  getWorkList,
  postWorkFavorites,
} from '../controllers/workController';

const router = Router();

router.get('/api/praca', getWorkList);
router.get('/api/praca/:slug', getWorkBySlug);
router.get('/api/praca/:slug/contact', getWorkContact);
router.post('/api/praca/favorites', postWorkFavorites);

export default router;

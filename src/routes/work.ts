import { Router } from 'express';

const router = Router();

router.post('/work', (req, res) => {
  res.send('work');
});

export default router;

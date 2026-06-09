import { Router } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { getTesters, getTesterActions, getTesterSimAccount, getAdminStats } from '../controllers/admin';

const router = Router();

router.use(authMiddleware, adminOnly);

router.get('/stats', getAdminStats);
router.get('/testers', getTesters);
router.get('/testers/:accountId/actions', getTesterActions);
router.get('/testers/:accountId/sim-account', getTesterSimAccount);

export default router;

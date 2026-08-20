import { Router } from 'express';
import * as authController from '../controllers/auth/authController.js';
import { requireAuth } from '../middleware/auth.js';

const authRouter = Router();

// Public routes
authRouter.post('/api/auth/phantom', authController.phantomLogin);
authRouter.post('/api/auth/google', authController.googleLogin);
authRouter.post('/api/auth/telegram', authController.telegramLogin);
authRouter.get('/api/auth/nonce', authController.getNonce);

// Protected routes
authRouter.get('/api/auth/me', requireAuth, authController.getMe);
authRouter.post('/api/auth/wallet', requireAuth, authController.generateWallet);
authRouter.get('/api/auth/wallet', requireAuth, authController.getWallet);

export default authRouter;

import { Router, Request, Response } from 'express';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { authMiddleware } from '../middleware/auth';
import { getUserWebAuthnCredentials, addWebAuthnCredential, deleteWebAuthnCredential, updateWebAuthnCredentialCounter } from '../service/webauthn';
import { UserOperations } from '../db/business-adapter';
import crypto from 'crypto';

const router = Router();

// Store challenges temporarily
const userChallengeStore = new Map<number, string>();
const loginChallengeStore = new Map<number, string>(); // user_id -> challenge
(global as any).loginChallengeStore = loginChallengeStore;

// Ensure RP name and ID match your deployment
const rpName = 'DNSMgr';
const rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
const origin = process.env.WEBAUTHN_ORIGIN || `http://${rpID}:3000`; // Modify accordingly in prod

router.get('/registration-options', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const user = await UserOperations.getById(userId) as { username: string } | undefined;
  if (!user) return res.status(404).json({ code: -1, msg: 'User not found' });

  const userCredentials = await getUserWebAuthnCredentials(userId);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new Uint8Array(Buffer.from(userId.toString())),
    userName: String(user.username),
    excludeCredentials: userCredentials.map(cred => ({
      id: cred.id,
      transports: cred.transports as any[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform',
    },
  });

  userChallengeStore.set(userId, options.challenge);
  res.json({ code: 0, data: options, msg: 'success' });
});

router.post('/registration-verify', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const body = req.body;
  const expectedChallenge = userChallengeStore.get(userId);

  if (!expectedChallenge) return res.status(400).json({ code: -1, msg: 'Challenge not found' });

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      
      await addWebAuthnCredential({
        id: credential.id,
        user_id: userId,
        public_key: Buffer.from(credential.publicKey).toString('base64'),
        counter: credential.counter,
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        transports: credential.transports || [],
        name: body.name || 'Passkey',
      });

      userChallengeStore.delete(userId);
      res.json({ code: 0, msg: 'success' });
    } else {
      res.status(400).json({ code: -1, msg: 'Verification failed' });
    }
  } catch (error: any) {
    res.status(400).json({ code: -1, msg: error.message });
  }
});

router.get('/credentials', authMiddleware, async (req: Request, res: Response) => {
  const creds = await getUserWebAuthnCredentials(req.user!.userId);
  res.json({ code: 0, data: creds.map(c => ({ id: c.id, name: c.name, created_at: c.created_at, last_used_at: c.last_used_at })), msg: 'success' });
});

router.delete('/credentials/:id', authMiddleware, async (req: Request, res: Response) => {
  await deleteWebAuthnCredential(req.user!.userId, req.params.id);
  res.json({ code: 0, msg: 'success' });
});

router.get('/login-options', async (req: Request, res: Response) => {
  const username = req.query.username as string;
  if (!username) return res.status(400).json({ code: -1, msg: 'Username required' });
  
  const isEmail = username.includes('@');
  const user = isEmail 
    ? await UserOperations.getByEmail(username) as { id: number } | undefined
    : await UserOperations.getByUsername(username) as { id: number } | undefined;
  
  if (!user) return res.status(404).json({ code: -1, msg: 'User not found' });
  
  const userCredentials = await getUserWebAuthnCredentials(user.id);
  if (userCredentials.length === 0) return res.status(400).json({ code: -1, msg: 'No passkeys found' });
  
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: userCredentials.map(cred => ({
      id: cred.id,
      transports: cred.transports as any[],
    })),
    userVerification: 'preferred',
  });
  
  loginChallengeStore.set(user.id, options.challenge);
  res.json({ code: 0, data: options, msg: 'success' });
});

export default router;

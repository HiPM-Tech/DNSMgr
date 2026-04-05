const fs = require('fs');
const p = './server/src/routes/auth.ts';
let code = fs.readFileSync(p, 'utf-8');

code = code.replace(
  "const { username, password, totpCode, backupCode } = req.body as { username: string; password: string; totpCode?: string; backupCode?: string };",
  "const { username, password, totpCode, backupCode, webauthnResponse } = req.body as { username: string; password: string; totpCode?: string; backupCode?: string; webauthnResponse?: any };"
);

const old2fa = `    // Check 2FA
    const totpStatus = await getTOTPStatus(user.id);
    if (totpStatus.enabled) {
      if (backupCode) {
        const isValid = await verifyBackupCode(user.id, backupCode);
        if (!isValid) {
          res.json({ code: -1, msg: 'Invalid backup code' });
          return;
        }
      } else if (totpCode) {
        const secretRow = await db.get('SELECT secret FROM user_2fa WHERE user_id = ? AND type = ?', [user.id, 'totp']) as { secret: string } | undefined;
        if (!secretRow || !verifyTOTPToken(secretRow.secret, totpCode)) {
          res.json({ code: -1, msg: 'Invalid 2FA code' });
          return;
        }
      } else {
        // 2FA required
        res.json({ code: -2, msg: '2FA required', data: { require2FA: true, type: 'totp' } });
        return;
      }
    }`;

const new2fa = `    // Check 2FA
    const totpStatus = await getTOTPStatus(user.id);
    const hasWebauthn = await db.get('SELECT enabled FROM user_2fa WHERE user_id = ? AND type = ?', [user.id, 'webauthn']) as { enabled: number } | undefined;
    const isTotpEnabled = totpStatus.enabled;
    const isWebauthnEnabled = Boolean(hasWebauthn?.enabled);

    if (isTotpEnabled || isWebauthnEnabled) {
      if (backupCode) {
        const isValid = await verifyBackupCode(user.id, backupCode);
        if (!isValid) {
          res.json({ code: -1, msg: 'Invalid backup code' });
          return;
        }
      } else if (totpCode && isTotpEnabled) {
        const secretRow = await db.get('SELECT secret FROM user_2fa WHERE user_id = ? AND type = ?', [user.id, 'totp']) as { secret: string } | undefined;
        if (!secretRow || !verifyTOTPToken(secretRow.secret, totpCode)) {
          res.json({ code: -1, msg: 'Invalid 2FA code' });
          return;
        }
      } else if (webauthnResponse && isWebauthnEnabled) {
        // webauthnResponse verification is handled by another endpoint or we verify it here
        const expectedChallenge = (global as any).loginChallengeStore?.get(user.username);
        if (!expectedChallenge) {
          res.json({ code: -1, msg: 'WebAuthn challenge expired or missing' });
          return;
        }
        
        const { verifyAuthenticationResponse } = require('@simplewebauthn/server');
        const { getUserWebAuthnCredentials, updateWebAuthnCredentialCounter } = require('../service/webauthn');
        const userCreds = await getUserWebAuthnCredentials(user.id);
        const cred = userCreds.find((c: any) => c.id === webauthnResponse.id);
        if (!cred) {
          res.json({ code: -1, msg: 'Credential not found' });
          return;
        }
        
        try {
          const verification = await verifyAuthenticationResponse({
            response: webauthnResponse,
            expectedChallenge,
            expectedOrigin: process.env.WEBAUTHN_ORIGIN || \`http://\${process.env.WEBAUTHN_RP_ID || 'localhost'}:3000\`,
            expectedRPID: process.env.WEBAUTHN_RP_ID || 'localhost',
            authenticator: {
              credentialID: cred.id,
              credentialPublicKey: Buffer.from(cred.public_key, 'base64'),
              counter: cred.counter,
              transports: cred.transports,
            },
          });
          
          if (!verification.verified) {
            res.json({ code: -1, msg: 'WebAuthn verification failed' });
            return;
          }
          await updateWebAuthnCredentialCounter(cred.id, verification.authenticationInfo.newCounter);
          (global as any).loginChallengeStore.delete(user.username);
        } catch (e: any) {
          res.json({ code: -1, msg: e.message });
          return;
        }
      } else {
        // 2FA required
        const types = [];
        if (isTotpEnabled) types.push('totp');
        if (isWebauthnEnabled) types.push('webauthn');
        res.json({ code: -2, msg: '2FA required', data: { require2FA: true, types } });
        return;
      }
    }`;

code = code.replace(old2fa, new2fa);

fs.writeFileSync(p, code);

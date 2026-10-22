// functions/src/index.ts
//
// Cloud Functions (2nd gen) entry point for the ManagerTalk hackathon demo.
// Intended for a separate demo Firebase project, served same-origin at
// /api/s02/turn through a Hosting rewrite (configured in a later phase).
//
// MOCK MODE ONLY. No model provider is called, no API key is read, and no
// secret is declared. A live model client is a separate, later change.
//
// No CORS: the client calls this same-origin, so browsers refuse
// cross-origin callers by default.

import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';

import { adminVerifier } from './auth';
import { handleTurn } from './handler';
import { mockModel } from './mockModel';

export const FUNCTION_REGION = 'europe-west2';

function adminAuth() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getAuth();
}

export const s02Turn = onRequest(
  {
    region: FUNCTION_REGION,
    // Small ceilings: a demo, and a bound on runaway cost.
    maxInstances: 2,
    concurrency: 20,
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: false
  },
  async (req, res) => {
    const header = (name: string): string | undefined => {
      const value = req.headers[name];
      return Array.isArray(value) ? undefined : value;
    };

    const response = await handleTurn(
      {
        method: req.method,
        contentType: header('content-type'),
        authorization: header('authorization'),
        rawBody: req.rawBody
      },
      {
        verifyIdToken: adminVerifier({ verifyIdToken: (token) => adminAuth().verifyIdToken(token) }),
        model: mockModel,
        log: (entry) => logger.info('s02Turn', entry)
      }
    );

    res.status(response.status).set(response.headers).send(JSON.stringify(response.body));
  }
);

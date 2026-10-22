// functions/src/index.ts
//
// Cloud Functions (2nd gen) entry point for the ManagerTalk hackathon demo.
// Intended for a separate demo Firebase project, served same-origin at
// /api/s02/turn through a Hosting rewrite (configured in a later phase).
//
// MOCK BY DEFAULT. The live Nebius client is built only when S02_ENGINE_MODE
// is "live" and the NEBIUS_API_KEY secret is present (see liveConfig.ts).
// Deploying this function requires the secret to exist in Secret Manager:
// set it with `firebase functions:secrets:set NEBIUS_API_KEY` first. The key
// is read only here, at request time, and is passed to nothing but the live
// client.
//
// No CORS: the client calls this same-origin, so browsers refuse
// cross-origin callers by default.

import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineInt, defineSecret, defineString } from 'firebase-functions/params';

import { adminVerifier } from './auth';
import { handleTurn } from './handler';
import { selectEngine } from './liveConfig';
import { NEMOTRON_NANO_MODEL_ID } from './nebiusModel';
import { FirestoreLike, firestoreCounterStore } from './rateLimit';

export const FUNCTION_REGION = 'europe-west2';

// Live-mode configuration. Mode defaults to "mock"; the secret is bound to
// this one function and never read anywhere else.
const NEBIUS_API_KEY = defineSecret('NEBIUS_API_KEY');
const ENGINE_MODE = defineString('S02_ENGINE_MODE', { default: 'mock' });
const NEBIUS_MODEL = defineString('NEBIUS_MODEL', { default: NEMOTRON_NANO_MODEL_ID });
const USER_DAILY_CAP = defineInt('S02_USER_DAILY_CAP', { default: 40 });
const GLOBAL_DAILY_CAP = defineInt('S02_GLOBAL_DAILY_CAP', { default: 300 });

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
    cors: false,
    secrets: [NEBIUS_API_KEY]
  },
  async (req, res) => {
    const header = (name: string): string | undefined => {
      const value = req.headers[name];
      return Array.isArray(value) ? undefined : value;
    };

    const engine = selectEngine(
      {
        mode: ENGINE_MODE.value(),
        apiKey: NEBIUS_API_KEY.value(),
        model: NEBIUS_MODEL.value(),
        userDailyCap: USER_DAILY_CAP.value(),
        globalDailyCap: GLOBAL_DAILY_CAP.value()
      },
      {
        fetchImpl: fetch,
        counterStore: () => {
          adminAuth();
          return firestoreCounterStore(getFirestore() as unknown as FirestoreLike);
        }
      }
    );

    const response = await handleTurn(
      {
        method: req.method,
        contentType: header('content-type'),
        authorization: header('authorization'),
        rawBody: req.rawBody
      },
      {
        verifyIdToken: adminVerifier({ verifyIdToken: (token) => adminAuth().verifyIdToken(token) }),
        model: engine.model,
        mode: engine.mode,
        limiter: engine.limiter,
        log: (entry) => logger.info('s02Turn', entry)
      }
    );

    res.status(response.status).set(response.headers).send(JSON.stringify(response.body));
  }
);

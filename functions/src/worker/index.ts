// functions/src/worker/index.ts
//
// The Worker's entry point (`main` in wrangler.toml). Cloudflare treats every
// export of this module as a handler or a Durable Object class, so it exports
// exactly two things and nothing else: the default handler and the
// DailyLimiter class that the LIMITER binding names. Anything testable but not
// a handler (createWorker, parseCap, TURN_PATH) is in app.ts.

import { createWorker } from './app';
import { DailyLimiter } from './dailyLimiter';

export { DailyLimiter };

export default createWorker();

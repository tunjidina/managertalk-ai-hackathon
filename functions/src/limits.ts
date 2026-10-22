// functions/src/limits.ts
//
// Limits shared by more than one backend module. The wire limits for
// request fields live in validate.ts; these are the reply-side ones.

/** Longest model id the handler accepts in a reply (also enforced in handler.ts). */
export const MAX_MODEL_ID_CHARS_FOR_REPLY = 120;

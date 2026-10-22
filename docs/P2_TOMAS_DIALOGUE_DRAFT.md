# P2 proposed dialogue: scripted Tomás (v3, direction approved, final line approval pending)

Status: direction approved with two changes (COM-M2 made collaborative; restrained-first Considering order kept and tested). The lines exist as data in `src/engine/s02/scriptedDialogue.ts` with tests, but are NOT wired into the engine or UI; that waits for your final approval of this text. Reply "approve all", or list changes by ID (for example "EXP-C1: replace with ...").

## What changed since v1
| Request | How v2 answers it |
|---|---|
| Slightly warmer, without agreeing too easily | A short acknowledgement was added to 11 replies (thanks for raising it directly, appreciating being asked, wanting to get it right). None concedes anything: every disagreement, guardedness and "I'm not convinced" is kept. |
| Gradual, limited openness when the manager owns their part; technical question stays open | The Considering replies now step up slowly: SBI-O1 (minimal) to EXP-O1 (restrained) to EXP-O2 (restrained) to HYP (a little more) to COM and CLO. From Hypotheses onward every Considering reply states that the technical question is still unresolved for him. |
| EXP-O1's restraint over EXP-O2's fuller disclosure | EXP-O1 is unchanged. EXP-O2 is rewritten: the line where Tomás says he took the earlier feedback "as a conclusion" is gone, and he now says he does not know that it connects to the review. |
| Fewer requests for things in writing | SBI-C2, EXP-C1 and HYP-C2 no longer ask for writing. Written confirmation remains only in the closing, where it belongs: CLO-M1 (a light "short note" request). COM-M2 is now collaborative ("I'd like us both to have it with the date"). Only CLO-M1 now asks for anything in writing (down from 5); COM-M2 asks for a shared record instead. |

## How these lines will be used
- Every line is authored text chosen by rules, never model output. The UI labels every one "Scripted", and the portrait pose is picked by the same rule (Pose column), not by any reading of the manager.
- Selection: stage plus style. Style comes from the existing keyword rules (`chooseStyle`, now in the shared `styleSelection.ts`): outage or named-source language gives Guarded; causality or formal-process language gives Composed; in Commitments and Closing the default is Measured; otherwise Explaining. A Considering reply is used instead when the manager's text names their own contribution (existing `MANAGER_CONTRIBUTION_MARKERS`), trips no stage prohibition, and does not bring in the outage, a named source or a causal claim (those select Guarded or Composed; he does not open up in response to them). Within a combination the two variants alternate by turn count, so runs are repeatable in tests.
- Proposed edit (new): Considering variants are picked by order, not alternation. The first Considering reply in a session uses the more restrained line (O1), and a later one in the same session may use the fuller line (O2), so openness grows with the manager's own acknowledgements rather than appearing all at once.
- Limits: each reply is 1 to 3 lines; each line is under 600 characters; British English.
- Known limitation: scripted replies do not quote the manager's words. That is why they are labelled, and why live inference matters.

## Authoring rules (checked mechanically before integration)
Tomás never: mentions the outage, Nadia or a staff engineer; says whether he noticed the silence; says a cause is established; concedes technical correctness or causality; says "I agree", "you're right" or "my mistake"; promises anything about role, rating, promotion or pay; apologises or discloses emotion on demand; adds facts beyond the blueprint. He stays composed, precise and willing to continue. Every Considering reply keeps something unresolved. The only request for writing is in the closing (CLO-M1).

## Stage 1: SBI (sprint review)
| ID | Pose | Lines |
|---|---|---|
| SBI-E1 | Explaining | Thanks for raising it with me directly. I answered the question as it was put to me in the review, and I tried to be accurate. / If the way I answered is what you want to talk about, tell me which part and I'll look at it properly. |
| SBI-E2 | Explaining | Let me make sure I have the moment right before I react to it. You're describing something I said in the review, and what followed. / Can you say which of my answers you mean? I'd rather respond to the specific thing than to a general impression. |
| SBI-G1 | Guarded | I do want to get this right, so I'd like to stay with what happened in the review itself. / If other things are being brought in, I'd want to look at each one separately and see what actually supports it. |
| SBI-G2 | Guarded | That's more than I expected to be raised. I'm not saying it's nothing, but I'd rather deal with one thing at a time, and with what can be checked. |
| SBI-C1 | Composed | I hear what you're describing. I don't agree that I can be tied to the effect you've named, and I'd want to see that shown rather than assumed. / I'm still willing to talk it through, and I appreciate you telling me directly. |
| SBI-C2 | Composed | I see this differently, and I'd rather say so plainly than nod along. / If you can point me to the specific moment you mean, I'll look at it carefully and give you a considered reply. |
| SBI-M1 (safety) | Measured | Understood. Can you tell me what you'd like to happen next? |
| SBI-O1 | Considering | I appreciate you saying that about the earlier feedback. I'd still like to talk about the review itself. |

## Stage 2: Exploration
| ID | Pose | Lines |
|---|---|---|
| EXP-E1 | Explaining | Thanks for asking me directly. As I remember it, I was responding to the substance of what was raised, and I wanted the answer to be correct more than I wanted it to be brief. / I can tell you what I intended; the rest I'd only be guessing at. |
| EXP-E2 | Explaining | That's a fair thing to ask. I'll tell you what I remember, though I'd rather not guess at what other people were thinking. / On my own part, I'm not certain why I answer the way I do in those moments. I'd be inventing a reason if I gave you one. |
| EXP-G1 | Guarded | I'll answer, but I'm not comfortable with how some of this is framed. I haven't seen what it rests on, and I'd want to before I treat it as established. |
| EXP-G2 | Guarded | I do want to answer this properly, and there's more in that than I can respond to fairly in one go. / I'd rather take things one at a time. |
| EXP-C1 | Composed | Thank you for asking me first. I'll tell you how I remember it. / I think you may already have a view, and I'd ask that you keep an open mind about mine. |
| EXP-C2 | Composed | I'm happy to answer, and I appreciate you asking. I should say that I don't share the premise in some of those questions, and I'd rather say that than answer around it. / None of that means I'm unwilling to keep talking. |
| EXP-M1 (safety) | Measured | Understood. Where would you like to take it from here? |
| EXP-O1 | Considering | I didn't expect you to say that about the earlier feedback. It did come quickly, and I don't think we ever went back to it. / I'm not saying it explains the review. But it's part of how I've read examples since. |
| EXP-O2 | Considering | Thank you for saying that about the earlier feedback. I had noticed it came quickly and that we never went back to it. / I don't know that it connects to the review. I'd like to understand that first. |

## Stage 3: Hypotheses
| ID | Pose | Lines |
|---|---|---|
| HYP-E1 | Explaining | Some of those are testable and some aren't, and I'd say that out loud. I'm glad none of them is being presented as the answer. / If you want my view on which are more likely, I can give it, but I'd be guessing too. |
| HYP-E2 | Explaining | Thanks for laying them out as possibilities. For what it's worth, I'd want any of them checked against what actually happened, not just what sounds plausible. |
| HYP-G1 | Guarded | I don't think I can engage with that list as it stands. At least one point leans on something I haven't seen, and I'd have to see it before I weighed it. |
| HYP-G2 | Guarded | I'd rather not treat that as a hypothesis until I know what's behind it. Hypotheses should be things we can both look at. |
| HYP-C1 | Composed | I can see how you got to that list, and I appreciate that it's offered in good faith. I don't think one of them is fair to me, and I'm not going to agree to it just to keep things moving. / I'm still happy to go through the rest. |
| HYP-C2 | Composed | I'd put it differently, though I can see the thinking behind the list. / I'm not ruling anything in or out yet. |
| HYP-M1 (safety) | Measured | Understood. I'd like to see how we turn that into something we can act on. |
| HYP-O1 | Considering | I hadn't thought of it that way. If part of this is about how the earlier feedback was given, that's something we can look at without anyone being at fault. / My view on the technical question hasn't changed, and I'm still not convinced about the rest, but I'd keep that one on the list. |
| HYP-O2 | Considering | It's useful to see your own part on that list, and I won't pretend I expected it. I'd still want the others held open as well, not just that one. / The technical question isn't settled for me, and I don't think we know yet. |

## Stage 4: Commitments
| ID | Pose | Lines |
|---|---|---|
| COM-M1 | Measured | Thanks, that's something I can work with. Can we confirm what I'd be doing, in which meeting, and by when, so there's no ambiguity about whether I've done it? |
| COM-M2 | Measured | That's clear enough for me to act on. I'd like us both to have it with the date, and I'd like the same precision on your side of it. |
| COM-G1 | Guarded | I'm not able to commit to something that depends on that. Let's keep the commitments to what each of us can do and show. |
| COM-G2 | Guarded | I'd rather not tie what we agree to anything that isn't settled. Can we limit it to actions we can both see? |
| COM-C1 | Composed | I can commit to something I can actually do, and I'll do it properly. That isn't the same as agreeing with the account behind it. |
| COM-C2 | Composed | I'm willing to try it as an experiment. I'd want it understood that I haven't conceded the technical point by agreeing to it. |
| COM-E1 (safety) | Explaining | Before we settle this, I'd want the wording to be exact, because small differences in wording change what counts as done. |
| COM-O1 | Considering | Thank you for including something on your side. That makes it easier to say yes. / I'll keep to mine, and I'd like us both to check it at the date. It doesn't change where I am on the technical question. |

## Stage 5: Closing
| ID | Pose | Lines |
|---|---|---|
| CLO-M1 | Measured | Understood. I have the date, who starts the follow-up, and the two commitments. / Could you send a short note with those, so we're both working from the same words? |
| CLO-M2 | Measured | Thanks for talking it through. I'll do my part and I'll be there at the date. / I'd like to hear from you if anything changes before then. |
| CLO-G1 | Guarded | I'd ask that we don't close on anything that isn't established. I'll keep to what we've agreed and nothing beyond it. |
| CLO-G2 | Guarded | I'm not comfortable with that being part of how this ends. I'm happy to leave it open, and to stay with the commitments. |
| CLO-C1 | Composed | I don't think we agree on all of it, and I'd rather leave that visible than paper over it. / I'll keep my commitment, and I'll come back to the rest at the date. |
| CLO-C2 | Composed | I'm leaving this unconvinced on some points and willing on others. That seems an honest place to stop for now, and I appreciate you leaving it open. |
| CLO-E1 (safety) | Explaining | Before we finish, I'd like the wording of what we agreed to be exact, so neither of us has to reconstruct it later. |
| CLO-O1 | Considering | This went somewhere I didn't expect, and I appreciate that. I still don't agree on everything, and the technical question is still open for me. / I think we can look at it again at the date. |

## Inventory
42 replies, unchanged in structure: 30 reachable Explaining, Guarded, Composed and Measured pairs, 5 safety replies for combinations the current rules cannot select, and 7 Considering replies.

## Decisions recorded
1. **Considering by order (approved).** The first Considering reply in a session uses the restrained line (O1); any later one uses the fuller line (O2) where the stage has one. Order is derived from the turns already in the session, so it is deterministic and a replay starts restrained again. Covered by tests.
2. **EXP-G1, HYP-G1, HYP-G2 stay firm and unchanged (approved by omission; say if you want them warmer).**
3. **COM-M2 (approved change):** now "I'd like us both to have it with the date", a shared record rather than a request for writing.
4. **Two rewordings** (COM-E1 "Before we settle this", COM-C1 "That isn't the same as agreeing with the account behind it") keep the concession lint free of special cases; meaning unchanged.

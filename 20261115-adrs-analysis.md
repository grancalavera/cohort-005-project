# Refund approval and Enrollments: what happened, and why it differed from the course

Date: 2026-11-15. Session: "aihero adrs" (`/grill-with-docs`, Claude Code).

## The two prompts

### My prompt (verbatim)

> /grill-with-docs I need to work on the refund approval screen. There is a fair amount of data related to the user that we need to decide what to do with as we approve the refund. The main decisions is what to do with the enrollment data: hard delete, soft delete, or retain for period.

### Matt's prompt (verbatim, from the course)

> /grill-with-docs In our application, there's no way to actually approve an open refund request. We need a way for admins to log into a screen that's they can see all of the refund requests that are available, the amount of progress that's been made on those courses, and then decide whether or not to approve them. I'm going to consider what happens to the refund afterwards as out of scope. Let's just focus on approving the refund for now. However, the moment that the open refund request gets approved, we need to decide what to do about the user's access to the course. Or even at what point they lose access to the course as well, and whether we remove their progress in the course.

## What happened in my session

1. **Context gathering.** Claude read `GLOSSARY.md`, ADRs 0001–0004, the schema and `approveRefundRequest`. Most of the question was already settled on `main`:
   - **ADR 0001:** approving a refund keeps progress, watch history, quiz attempts, comments and the rating.
   - **ADR 0002:** the learner loses the course when the request is approved, not when the money is sent.
   - **The code already hard-deleted** the enrollment row on approval, unless the learner also held a Claimed Seat (ADR 0004).
2. **Grilling, three rounds.** These were the decisions:
   - **Terms:** "Enrollment" and "Ended Enrollment" become the canonical terms in the glossary.
   - **Soft delete, not hard delete:** the row holds nothing more personal than the progress we already keep.
   - **No retention period:** "keep for a period" was first framed as n = ∞, then dropped. No purge job is built.
   - **Who sees refunded learners:** they leave instructor and admin counts and the student list, and the course disappears from their own dashboard.
   - **Ratings:** a refunded learner's rating is kept, but it doesn't count.
   - **Buying again:** it creates a new Enrollment instead of reviving the ended one.
   - **One module owns Enrollments:** Enrollment is a domain object that never includes Ended Enrollments. One module owns the table, with a ready-made query for SQL joins and a test that guards the imports.
   - **One current Enrollment per course:** a partial unique index enforces it.
3. **Implementation.** See "Changes on this branch" below.
4. **Afterwards.** I compared with a screenshot of the course session. It had found five problems this session never raised: enrollment access blocking a re-purchase, progress not stored on the enrollment, the "Admin" ambiguity, the glossary's "team approves" wording, and the 50% check mismatch. That prompted the analysis below.

## Analysis: why the two sessions differed

### 1. Different starting code

Matt's prompt starts from "there's no way to actually approve an open refund request". My `main` already contained the course's solution to that exercise: commit `5bbfdee admin-refund-approval-adr: Let admins approve and decline Refunds`. It had the screen, `approveRefundRequest`, ADRs 0001–0004 and the glossary fixes. Every problem in the course screenshot had already been fixed:

| Course session finding | State on my `main` |
| --- | --- |
| Access comes from an enrollment; the purchase flow refuses to sell to an enrolled learner | Still true. It became important under soft delete: an Ended Enrollment would have blocked buying again. Handled in code (`isEnrolled` sees only current Enrollments) but never said out loud during the grilling. |
| Progress isn't stored on the enrollment | Settled by ADR 0001 |
| "Admin" means two things | Glossary defines Platform Admin and Team Admin |
| Glossary says "the team approves or declines" | Glossary says only a Platform Admin decides |
| 50% check differs between the course page and the refund action | Both use `checkRefundRequest`; over 50% is now a warning for the admin, not a block |

### 2. A problem question versus a choice between solutions

| | Matt's prompt | My prompt |
| --- | --- | --- |
| Scope | A whole feature: screen, list, progress, approving | One decision: what happens to the enrollment row |
| Kind of question | Open: *when* does access end, *should* progress go? | Pick one: hard delete, soft delete, or keep for a period |
| Out of scope | What happens to the money afterwards | Nothing named |
| What it led the agent to do | Look through everything that touches access, refunds and roles | Weigh three storage options |

An open question about outcomes leads the agent to look through the code for anything relevant, and that's where the course session's findings came from. A question offering three options gets those three options weighed. The real question, "what should a refunded learner lose, and when?", was already answered by ADRs 0001 and 0002, so only the row's storage was left.

### 3. Where Claude fell short

Claude went straight to the enrollment question and never did a broad sweep for mismatches between the glossary, the ADRs and the code. On this repo it would have found nothing new, but that was luck. Claude also should have raised "an Ended Enrollment blocks buying again" as a reason to be careful with soft delete. Instead it only fixed it quietly in the code.

### 4. This branch now differs from the course's answer

The course solution hard-deletes the enrollment. This branch soft-deletes it, adds an Enrollment module, and records the choice in ADR 0005. If later lessons assume `main` as it was in the course, expect conflicts.

To redo the exercise as the course intends, branch from the commit before the solution and use Matt's prompt:

```bash
git switch -c refund-exercise 13465da
```

## Changes on this branch

- **ADR 0005:** `docs/adr/0005-approving-a-refund-ends-an-enrollment-rather-than-deleting-it.md`.
- **Glossary:** `GLOSSARY.md` gets a new Enrollments section, and existing entries now say "Enrollment".
- **Database:** `ended_at` on enrollments and a partial unique index allowing one current Enrollment per learner per course (`drizzle/0012_workable_true_believers.sql`).
- **Enrollment module:** `app/lib/enrollments.server.ts` provides `currentEnrollments`, `findEnrollment`, `isEnrolled`, `grantEnrollment` and `endEnrollment`. It is the only code allowed to touch the table.
- **Callers moved over:** access checks, the dashboard, the course list, instructor pages and analytics, admin courses, buying a course, claiming a Seat and refund approval.
- **Ratings:** averages and counts include only ratings from learners with a current Enrollment.
- **Seed fix:** the new index caught learners enrolled twice in TypeScript, once by purchase and once by Team Licence Seat. Those learners no longer buy the course themselves in the seed.
- **Tests:** new `app/lib/enrollments.server.test.ts`, including a guard that fails if anything else imports the table. `refunds.server.test.ts` now checks the Ended Enrollment is kept.

Checks: `npm run typecheck` is clean, `npm run test` passes 409 tests, and `npm run build` succeeds. They were run in a Linux copy of the repo, because the shared `node_modules` holds macOS binaries. After pulling, run `npm run db:seed` to apply the migration locally.

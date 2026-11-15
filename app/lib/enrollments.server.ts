import { and, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { QueryBuilder } from "drizzle-orm/sqlite-core";
import * as schema from "~/db/schema";
import { enrollments as enrollmentsTable } from "~/db/schema";

// ─── Enrollments ───
// A learner's right to watch a course (GLOSSARY.md). This module is the only
// code that reads or writes the enrollments table, and an Enrollment here is
// always a current one: Ended Enrollments are kept in the table (docs/adr/0005)
// but never leave this module. A test fails if anything else imports the table.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

/**
 * Current Enrollments, for queries that join or count them in SQL. Use it
 * wherever you would have used the table: `.from(currentEnrollments)`,
 * `eq(currentEnrollments.userId, ...)`.
 */
export const currentEnrollments = new QueryBuilder()
  .select({
    id: enrollmentsTable.id,
    userId: enrollmentsTable.userId,
    courseId: enrollmentsTable.courseId,
    enrolledAt: enrollmentsTable.enrolledAt,
    completedAt: enrollmentsTable.completedAt,
  })
  .from(enrollmentsTable)
  .where(isNull(enrollmentsTable.endedAt))
  .as("current_enrollments");

export type Enrollment = {
  id: number;
  userId: number;
  courseId: number;
  enrolledAt: string;
  completedAt: string | null;
};

export function findEnrollment(
  db: Queryable,
  userId: number,
  courseId: number
): Enrollment | undefined {
  return db
    .select()
    .from(currentEnrollments)
    .where(
      and(
        eq(currentEnrollments.userId, userId),
        eq(currentEnrollments.courseId, courseId)
      )
    )
    .get();
}

export function isEnrolled(db: Queryable, userId: number, courseId: number) {
  return !!findEnrollment(db, userId, courseId);
}

/**
 * Gives the learner an Enrollment in the course. Returns the current one
 * unchanged if they already have it. A learner whose only Enrollment has ended
 * gets a new one.
 */
export function grantEnrollment(
  db: Queryable,
  userId: number,
  courseId: number,
  now: Date
): Enrollment {
  const existing = findEnrollment(db, userId, courseId);
  if (existing) return existing;

  const { endedAt: _, ...enrollment } = db
    .insert(enrollmentsTable)
    .values({ userId, courseId, enrolledAt: now.toISOString() })
    .returning()
    .get();
  return enrollment;
}

/**
 * Ends the learner's current Enrollment in the course, if they have one. The
 * row is kept as an Ended Enrollment (docs/adr/0005).
 */
export function endEnrollment(
  db: Queryable,
  userId: number,
  courseId: number,
  now: Date
) {
  db.update(enrollmentsTable)
    .set({ endedAt: now.toISOString() })
    .where(
      and(
        eq(enrollmentsTable.userId, userId),
        eq(enrollmentsTable.courseId, courseId),
        isNull(enrollmentsTable.endedAt)
      )
    )
    .run();
}

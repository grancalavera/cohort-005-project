import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { count, eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  currentEnrollments,
  endEnrollment,
  findEnrollment,
  grantEnrollment,
  isEnrolled,
} from "./enrollments.server";

type TestDb = ReturnType<typeof createTestDb>;

const MARCH = new Date(2026, 2, 1);
const APRIL = new Date(2026, 3, 1);
const JUNE = new Date(2026, 5, 1);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

function rowsFor(userId: number) {
  return db
    .select()
    .from(schema.enrollments)
    .where(eq(schema.enrollments.userId, userId))
    .orderBy(schema.enrollments.id)
    .all();
}

function currentCount() {
  return db
    .select({ n: count() })
    .from(currentEnrollments)
    .where(eq(currentEnrollments.courseId, base.course.id))
    .get()?.n;
}

describe("granting an Enrollment", () => {
  it("gives the learner the course", () => {
    const enrollment = grantEnrollment(db, base.user.id, base.course.id, MARCH);

    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
    expect(enrollment).toMatchObject({
      userId: base.user.id,
      courseId: base.course.id,
      enrolledAt: MARCH.toISOString(),
    });
  });

  it("returns the current Enrollment rather than adding a second one", () => {
    const first = grantEnrollment(db, base.user.id, base.course.id, MARCH);
    const second = grantEnrollment(db, base.user.id, base.course.id, JUNE);

    expect(second).toEqual(first);
    expect(rowsFor(base.user.id)).toHaveLength(1);
  });
});

describe("ending an Enrollment", () => {
  it("takes the course away but keeps the Enrollment as an Ended Enrollment", () => {
    grantEnrollment(db, base.user.id, base.course.id, MARCH);

    endEnrollment(db, base.user.id, base.course.id, APRIL);

    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);
    expect(findEnrollment(db, base.user.id, base.course.id)).toBeUndefined();
    expect(rowsFor(base.user.id)).toMatchObject([
      { enrolledAt: MARCH.toISOString(), endedAt: APRIL.toISOString() },
    ]);
  });

  it("leaves Ended Enrollments out of current Enrollments", () => {
    grantEnrollment(db, base.user.id, base.course.id, MARCH);
    expect(currentCount()).toBe(1);

    endEnrollment(db, base.user.id, base.course.id, APRIL);

    expect(currentCount()).toBe(0);
  });

  it("gives a learner who buys again a new Enrollment", () => {
    grantEnrollment(db, base.user.id, base.course.id, MARCH);
    endEnrollment(db, base.user.id, base.course.id, APRIL);

    grantEnrollment(db, base.user.id, base.course.id, JUNE);

    expect(findEnrollment(db, base.user.id, base.course.id)?.enrolledAt).toBe(
      JUNE.toISOString()
    );
    expect(rowsFor(base.user.id)).toMatchObject([
      { enrolledAt: MARCH.toISOString(), endedAt: APRIL.toISOString() },
      { enrolledAt: JUNE.toISOString(), endedAt: null },
    ]);
  });

  it("doesn't touch an Enrollment that has already ended", () => {
    grantEnrollment(db, base.user.id, base.course.id, MARCH);
    endEnrollment(db, base.user.id, base.course.id, APRIL);

    endEnrollment(db, base.user.id, base.course.id, JUNE);

    expect(rowsFor(base.user.id)[0].endedAt).toBe(APRIL.toISOString());
  });
});

describe("the database", () => {
  it("refuses a second current Enrollment in the same course", () => {
    grantEnrollment(db, base.user.id, base.course.id, MARCH);

    expect(() =>
      db
        .insert(schema.enrollments)
        .values({ userId: base.user.id, courseId: base.course.id })
        .run()
    ).toThrow(/UNIQUE/);
  });
});

// ─── The Enrollment module owns the table ───
// Ended Enrollments live in the enrollments table, so any code that reads it
// directly could hand a refunded learner the course (docs/adr/0005). Only this
// module, the schema, and tests may touch it.

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ALLOWED = new Set([
  path.join(appDir, "db", "schema.ts"),
  path.join(appDir, "lib", "enrollments.server.ts"),
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

function touchesEnrollmentsTable(source: string) {
  const namedFromSchema = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*db\/schema["']/g;
  for (const match of source.matchAll(namedFromSchema)) {
    if (/\benrollments\b/.test(match[1])) return true;
  }
  return /\bschema\.enrollments\b/.test(source);
}

describe("the enrollments table", () => {
  it("is only used by the Enrollment module", () => {
    const offenders = sourceFiles(appDir)
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => touchesEnrollmentsTable(readFileSync(file, "utf8")))
      .map((file) => path.relative(appDir, file));

    expect(offenders).toEqual([]);
  });
});

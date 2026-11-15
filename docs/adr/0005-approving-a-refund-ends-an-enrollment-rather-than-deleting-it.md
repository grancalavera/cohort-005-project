# Approving a refund ends an Enrollment rather than deleting it

When a Refund Request on an Individual Purchase is approved, the learner's Enrollment becomes an Ended Enrollment and is kept, with no expiry. Enrollment is modelled as a domain object that never includes Ended Enrollments, and the Enrollment module is the only code that reads or writes the table, so no reader can forget to leave them out and hand a refunded learner the course.

## Considered Options

- **Hard delete**: rejected, because it throws away when the learner was enrolled and leaves no record that an Enrollment ever existed.
- **Keep for a period, then purge**: rejected for now, because there is no known legal requirement to set the period. If one appears, a purge can be added on top of Ended Enrollments.

## Consequences

A learner can have many Ended Enrollments for a course but at most one current one; buying again creates a new Enrollment rather than reviving the old one. A refunded learner's rating is kept (docs/adr/0001) but isn't counted while they have no current Enrollment.

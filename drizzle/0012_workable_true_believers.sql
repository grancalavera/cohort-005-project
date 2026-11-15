ALTER TABLE `enrollments` ADD `ended_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `enrollments_current_unique` ON `enrollments` (`user_id`,`course_id`) WHERE ended_at is null;
CREATE TABLE `script_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`input` text NOT NULL,
	`kind` text DEFAULT 'new' NOT NULL,
	`parent_id` integer,
	`reuse_plan_of` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`script_id` integer,
	`created_at` integer NOT NULL
);

CREATE TABLE `media` (
	`key` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`data` blob NOT NULL,
	`bytes` integer NOT NULL,
	`hash` text NOT NULL,
	`created_at` integer NOT NULL
);

CREATE TABLE `account_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`followers` integer,
	`captured_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`handle` text NOT NULL,
	`group` text DEFAULT 'competitor' NOT NULL,
	`ig_user_id` text,
	`full_name` text,
	`biography` text,
	`followers` integer,
	`posts_count` integer,
	`verified` integer,
	`avatar_path` text,
	`active` integer DEFAULT true NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`last_scraped_at` integer,
	`last_scrape_status` text,
	`last_error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_handle_uq` ON `accounts` (`handle`);--> statement-breakpoint
CREATE TABLE `analyses` (
	`video_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`hook_type` text NOT NULL,
	`hook_type_manual` text,
	`theme` text NOT NULL,
	`format` text NOT NULL,
	`cta_type` text NOT NULL,
	`offer_type` text NOT NULL,
	`confidence` text NOT NULL,
	`input_mode` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analyses_hook_idx` ON `analyses` (`hook_type`);--> statement-breakpoint
CREATE TABLE `change_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `digests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start` integer NOT NULL,
	`data` text NOT NULL,
	`generator` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `frames` (
	`video_id` text PRIMARY KEY NOT NULL,
	`items` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`key` text NOT NULL,
	`payload` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 4 NOT NULL,
	`run_after` integer NOT NULL,
	`error` text,
	`batch_id` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE INDEX `jobs_key_idx` ON `jobs` (`key`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`video_id` text,
	`read` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `processing` (
	`video_id` text PRIMARY KEY NOT NULL,
	`media` text DEFAULT 'pending' NOT NULL,
	`transcript` text DEFAULT 'pending' NOT NULL,
	`frames` text DEFAULT 'pending' NOT NULL,
	`analysis` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`error_stage` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scripts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`mode` text NOT NULL,
	`input` text NOT NULL,
	`plan` text,
	`output` text NOT NULL,
	`evidence` text,
	`title` text NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`generator` text NOT NULL,
	`model` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transcripts` (
	`video_id` text PRIMARY KEY NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`words` text,
	`audio_events` text,
	`language_code` text,
	`has_speech` integer NOT NULL,
	`speech_kind` text DEFAULT 'none' NOT NULL,
	`speech_seconds` real,
	`model` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `video_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`video_id` text NOT NULL,
	`views` integer,
	`likes` integer,
	`comments` integer,
	`captured_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `snap_video_idx` ON `video_snapshots` (`video_id`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`short_code` text,
	`account_id` integer NOT NULL,
	`url` text,
	`caption` text,
	`hashtags` text,
	`mentions` text,
	`published_at` integer NOT NULL,
	`duration_sec` real,
	`views` integer,
	`likes` integer,
	`comments` integer,
	`shares` integer,
	`followers_at_capture` integer,
	`is_pinned` integer DEFAULT false NOT NULL,
	`is_sponsored` integer DEFAULT false NOT NULL,
	`music` text,
	`location_name` text,
	`product_type` text,
	`thumbnail_path` text,
	`remote_thumbnail_url` text,
	`remote_video_url` text,
	`video_path` text,
	`video_deleted_at` integer,
	`is_demo` integer DEFAULT false NOT NULL,
	`first_seen_at` integer NOT NULL,
	`metrics_updated_at` integer NOT NULL,
	`raw` text
);
--> statement-breakpoint
CREATE INDEX `videos_account_idx` ON `videos` (`account_id`);--> statement-breakpoint
CREATE INDEX `videos_published_idx` ON `videos` (`published_at`);
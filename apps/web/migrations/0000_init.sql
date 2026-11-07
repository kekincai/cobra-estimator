CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE TABLE `estimates` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`name` text NOT NULL,
	`budget` real,
	`report_generation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `factors` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`no` integer NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`kind` text NOT NULL,
	`target_factor_id` text,
	`definition` text DEFAULT '' NOT NULL,
	`levels` text NOT NULL,
	`origin` text DEFAULT 'custom' NOT NULL,
	`triangles` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `factors_model` ON `factors` (`model_id`);--> statement-breakpoint
CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`estimate_id` text NOT NULL,
	`label` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`size_fp` real NOT NULL,
	`levels` text NOT NULL,
	`notes` text NOT NULL,
	`runs` integer NOT NULL,
	`seed` integer NOT NULL,
	`model_version_id` text,
	`results` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`estimate_id`) REFERENCES `estimates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generations_estimate` ON `generations` (`estimate_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `model_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`version` integer NOT NULL,
	`built_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`built_by` text NOT NULL,
	`expert_mode` text NOT NULL,
	`group_id` text,
	`runs` integer NOT NULL,
	`seed` integer NOT NULL,
	`alpha` real NOT NULL,
	`ci_lo` real,
	`ci_hi` real,
	`mmre` real,
	`pred25` real,
	`n` integer NOT NULL,
	`loo` text NOT NULL,
	`inconsistencies` text NOT NULL,
	`factors_snapshot` text,
	`active` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `versions_model` ON `model_versions` (`model_id`);--> statement-breakpoint
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`k` real DEFAULT 0.225 NOT NULL,
	`units` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`size_fp` real NOT NULL,
	`effort_mm` real NOT NULL,
	`levels` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`adopted` integer DEFAULT true NOT NULL,
	`excluded_reason` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `projects_model` ON `projects` (`model_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`model_version_id` text NOT NULL,
	`payload` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`submitted_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL
);

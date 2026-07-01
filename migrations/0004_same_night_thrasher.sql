CREATE TABLE `cooking_session_recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cooking_session_id` integer NOT NULL,
	`recipe_version_id` integer NOT NULL,
	`notion_page_id` text,
	FOREIGN KEY (`cooking_session_id`) REFERENCES `cooking_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cooking_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`duration_minutes` integer,
	`location` text,
	`mood` text,
	`chef` text,
	`participants` text,
	`overall_rating` real,
	`learnings` text,
	`errors` text,
	`successes` text,
	`never_again` text,
	`why_worked` text,
	`next_attempt_suggestions` text,
	`general_notes` text,
	`notion_page_id` text
);
--> statement-breakpoint
CREATE TABLE `price_histories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredient_id` integer NOT NULL,
	`price_per_unit` real NOT NULL,
	`price_unit` text DEFAULT 'R$' NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cooking_session_id` integer NOT NULL,
	`recipe_version_id` integer NOT NULL,
	`reviewer_name` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text,
	`would_eat_again` integer DEFAULT true NOT NULL,
	`suggested_changes` text,
	`notion_page_id` text,
	FOREIGN KEY (`cooking_session_id`) REFERENCES `cooking_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `photos` ADD `cooking_session_id` integer REFERENCES cooking_sessions(id);--> statement-breakpoint
ALTER TABLE `photos` ADD `caption` text;--> statement-breakpoint
ALTER TABLE `photos` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `history` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `objective` text;--> statement-breakpoint
ALTER TABLE `techniques` ADD `mastery_level` integer DEFAULT 1 NOT NULL;
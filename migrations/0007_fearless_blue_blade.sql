CREATE TABLE `health_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_type` text DEFAULT 'Maintenance' NOT NULL,
	`target_weight_kg` real,
	`target_calories` integer,
	`target_protein` integer,
	`target_carbs` integer,
	`target_fat` integer,
	`target_water_ml` integer DEFAULT 2000 NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`notion_page_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nutrition_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`calories` integer DEFAULT 0 NOT NULL,
	`protein` integer DEFAULT 0 NOT NULL,
	`carbs` integer DEFAULT 0 NOT NULL,
	`fat` integer DEFAULT 0 NOT NULL,
	`water_intake_ml` integer DEFAULT 0 NOT NULL,
	`weight_kg` real,
	`notion_page_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

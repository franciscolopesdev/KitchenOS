CREATE TABLE `recipe_adaptations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cooking_session_id` integer,
	`recipe_version_id` integer NOT NULL,
	`source_equipment` text NOT NULL,
	`target_equipment` text NOT NULL,
	`adaptations_applied` text NOT NULL,
	`confidence` real NOT NULL,
	`feedback_rating` text,
	`notion_page_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`cooking_session_id`) REFERENCES `cooking_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_equipments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_available` integer DEFAULT true NOT NULL,
	`notion_page_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_equipments_name_unique` ON `user_equipments` (`name`);
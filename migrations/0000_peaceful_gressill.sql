CREATE TABLE `cuisines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`notion_page_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cuisines_name_unique` ON `cuisines` (`name`);--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_version_id` integer NOT NULL,
	`cooked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`servings_cooked` integer DEFAULT 2 NOT NULL,
	`protein_weight_grams` real DEFAULT 300 NOT NULL,
	`rating` integer NOT NULL,
	`outcome_notes` text NOT NULL,
	`delta_notes` text,
	`next_version_suggestions` text,
	`notion_page_id` text,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`default_unit` text DEFAULT 'g' NOT NULL,
	`shelf_life_days` integer,
	`is_freezer_friendly` integer DEFAULT true NOT NULL,
	`avoids_ginger` integer DEFAULT false NOT NULL,
	`flavor_profile` text,
	`notion_page_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredients_name_unique` ON `ingredients` (`name`);--> statement-breakpoint
CREATE TABLE `inventories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredient_id` integer NOT NULL,
	`amount` real NOT NULL,
	`unit` text NOT NULL,
	`location` text NOT NULL,
	`expiration_date` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`notion_page_id` text,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventories_ingredient_id_unique` ON `inventories` (`ingredient_id`);--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`meal_type` text NOT NULL,
	`recipe_version_id` integer NOT NULL,
	`servings` integer DEFAULT 2 NOT NULL,
	`is_cooked` integer DEFAULT false NOT NULL,
	`notion_page_id` text,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_version_id` integer,
	`experiment_id` integer,
	`local_path` text,
	`notion_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_version_id` integer NOT NULL,
	`ingredient_id` integer NOT NULL,
	`amount` real NOT NULL,
	`unit` text NOT NULL,
	`notes` text,
	`is_optional` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipe_tags` (
	`recipe_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipe_techniques` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_version_id` integer NOT NULL,
	`technique_id` integer NOT NULL,
	`step_order` integer NOT NULL,
	`notes` text,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`technique_id`) REFERENCES `techniques`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipe_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`version_number` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`yield_portions` integer DEFAULT 2 NOT NULL,
	`is_freezer_friendly` integer DEFAULT true NOT NULL,
	`estimated_time_minutes` integer,
	`difficulty` text DEFAULT 'Easy' NOT NULL,
	`notion_page_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cuisine_id` integer,
	`current_version_id` integer,
	`is_favorite` integer DEFAULT false NOT NULL,
	`notion_page_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`cuisine_id`) REFERENCES `cuisines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_name_unique` ON `recipes` (`name`);--> statement-breakpoint
CREATE TABLE `shopping_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredient_id` integer NOT NULL,
	`amount_needed` real NOT NULL,
	`unit` text NOT NULL,
	`is_purchased` integer DEFAULT false NOT NULL,
	`added_by_meal_plan_id` integer,
	`notion_page_id` text,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `techniques` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`difficulty` text DEFAULT 'Easy' NOT NULL,
	`flavor_impact` text,
	`notion_page_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `techniques_name_unique` ON `techniques` (`name`);
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_recipe_tags` (
	`recipe_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`recipe_id`, `tag_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_recipe_tags`("recipe_id", "tag_id") SELECT "recipe_id", "tag_id" FROM `recipe_tags`;--> statement-breakpoint
DROP TABLE `recipe_tags`;--> statement-breakpoint
ALTER TABLE `__new_recipe_tags` RENAME TO `recipe_tags`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `recipe_versions` ADD `calories` integer;--> statement-breakpoint
ALTER TABLE `recipe_versions` ADD `protein_grams` real;--> statement-breakpoint
ALTER TABLE `recipe_versions` ADD `carbs_grams` real;--> statement-breakpoint
ALTER TABLE `recipe_versions` ADD `fat_grams` real;
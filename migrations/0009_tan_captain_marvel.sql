ALTER TABLE `cooking_sessions` ADD `equipment_used` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `preferred_equipment` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `preferred_version_id` integer;--> statement-breakpoint
ALTER TABLE `recipes` ADD `preference_reason` text;
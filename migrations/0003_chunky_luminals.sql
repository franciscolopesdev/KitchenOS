ALTER TABLE `ingredients` ADD `price_per_unit` real;--> statement-breakpoint
ALTER TABLE `ingredients` ADD `price_unit` text DEFAULT 'R$' NOT NULL;
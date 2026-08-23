CREATE TABLE `tally` (
	`day` text NOT NULL,
	`card` text NOT NULL,
	`n` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `card`)
);
--> statement-breakpoint
CREATE TABLE `vote` (
	`day` text NOT NULL,
	`player_id` text NOT NULL,
	`card` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`day`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `vote_player_day_idx` ON `vote` (`player_id`,`day`);
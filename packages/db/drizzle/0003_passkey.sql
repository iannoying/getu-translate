-- Phase 6: passkey credentials (WebAuthn) for the better-auth passkey plugin.
CREATE TABLE `passkey` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text,
  `publicKey` text NOT NULL,
  `userId` text NOT NULL,
  `credentialID` text NOT NULL,
  `counter` integer NOT NULL,
  `deviceType` text NOT NULL,
  `backedUp` integer NOT NULL,
  `transports` text,
  `aaguid` text,
  `createdAt` integer DEFAULT (CAST(unixepoch('now','subsec') * 1000 AS INTEGER)),
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkey_userId_idx` ON `passkey` (`userId`);

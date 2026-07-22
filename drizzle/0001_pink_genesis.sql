CREATE TABLE `alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleId` int,
	`type` enum('maintenance_due','warranty_expiring','high_cost','repeat_repair','excessive_downtime','insurance_expiring','registration_expiring','overpriced_repair') NOT NULL,
	`title` varchar(200) NOT NULL,
	`message` text,
	`severity` enum('info','warning','critical') NOT NULL DEFAULT 'info',
	`isRead` enum('yes','no') NOT NULL DEFAULT 'no',
	`isDismissed` enum('yes','no') NOT NULL DEFAULT 'no',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleId` int NOT NULL,
	`serviceId` int NOT NULL,
	`completedAt` bigint NOT NULL,
	`mileageAtService` int,
	`nextDueMileage` int,
	`nextDueDate` bigint,
	`shopId` int,
	`cost` decimal(10,2),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenance_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`category` varchar(50),
	`intervalMiles` int,
	`intervalMonths` int,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenance_services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repair_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`repairId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(255) NOT NULL,
	`fileType` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `repair_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repairs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleId` int NOT NULL,
	`shopId` int,
	`date` bigint NOT NULL,
	`mileage` int,
	`mechanic` varchar(100),
	`complaint` text,
	`diagnosis` text,
	`partsReplaced` json,
	`partsCost` decimal(10,2) DEFAULT '0',
	`laborCost` decimal(10,2) DEFAULT '0',
	`tax` decimal(10,2) DEFAULT '0',
	`totalCost` decimal(10,2) DEFAULT '0',
	`warrantyMonths` int,
	`warrantyExpiry` bigint,
	`oldPartReturned` enum('yes','no'),
	`repairSuccessful` enum('yes','no'),
	`category` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repairs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shops` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`phone` varchar(30),
	`address` text,
	`contactPerson` varchar(100),
	`specialties` json,
	`averageLaborRate` decimal(10,2),
	`reliabilityScore` decimal(3,1),
	`recommendation` enum('yes','no','maybe'),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shops_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vanNumber` varchar(20) NOT NULL,
	`vin` varchar(17) NOT NULL,
	`licensePlate` varchar(20),
	`year` int NOT NULL,
	`make` varchar(50) NOT NULL DEFAULT 'Ford',
	`model` varchar(50) NOT NULL DEFAULT 'Transit Ambulette',
	`mileage` int NOT NULL DEFAULT 0,
	`engine` varchar(100),
	`transmission` varchar(100),
	`assignedDriver` varchar(100),
	`status` enum('active','down','awaiting_parts','at_shop','retired') NOT NULL DEFAULT 'active',
	`healthScore` enum('green','yellow','red') NOT NULL DEFAULT 'green',
	`photoUrl` text,
	`photoKey` varchar(255),
	`insuranceExpiry` bigint,
	`registrationExpiry` bigint,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicles_id` PRIMARY KEY(`id`)
);

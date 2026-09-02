-- Driver dispatch
ALTER TABLE `order` ADD COLUMN `driverNumber` INTEGER NULL;
CREATE INDEX `Order_driverNumber_idx` ON `order`(`driverNumber`);

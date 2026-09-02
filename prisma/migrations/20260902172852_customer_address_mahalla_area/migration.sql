-- AlterTable
ALTER TABLE `customeraddress` ADD COLUMN `area` VARCHAR(191) NULL,
    ADD COLUMN `mahalla` VARCHAR(191) NULL,
    MODIFY `postalCode` VARCHAR(191) NULL;

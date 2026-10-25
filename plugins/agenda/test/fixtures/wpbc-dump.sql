-- Synthetic dump in the format of Booking Calendar 11 (made for tests: no real data).
CREATE TABLE `wp_booking` (
  `booking_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `trash` bigint(10) NOT NULL DEFAULT 0,
  `sync_gid` varchar(200) NOT NULL DEFAULT '',
  `is_new` bigint(10) NOT NULL DEFAULT 1,
  `status` varchar(200) NOT NULL DEFAULT '',
  `sort_date` datetime DEFAULT NULL,
  `modification_date` datetime DEFAULT NULL,
  `creation_date` datetime DEFAULT NULL,
  `form` text NOT NULL,
  `hash` text DEFAULT NULL,
  `booking_type` bigint(10) NOT NULL DEFAULT 1,
  PRIMARY KEY (`booking_id`)
) ENGINE=InnoDB;
INSERT INTO `wp_booking` VALUES (1,0,'',0,'','2030-05-10 10:00:01','2030-05-01 09:00:00','2030-05-01 09:00:00','text^name1^Giulia~text^secondname1^Neri~email^email1^giulia@example.test~text^phone1^333 111~textarea^details1^Prima visita; grazie','abc',1),(2,1,'',0,'','2030-06-01 00:00:00','2030-05-02 09:00:00','2030-05-02 09:00:00','text^name2^Paolo~email^email2^paolo@example.test~selectbox-one^rangetime2^14:00 - 16:00','def',2);
INSERT INTO `wp_booking` (`booking_id`,`trash`,`form`,`booking_type`) VALUES (3,0,'text^name1^O\'Brien~email^email1^ob@example.test~text^visitors1^2',1);
CREATE TABLE `wp_bookingdates` (
  `booking_dates_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `booking_id` bigint(20) unsigned NOT NULL,
  `booking_date` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  `approved` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`booking_dates_id`)
) ENGINE=InnoDB;
INSERT INTO `wp_bookingdates` VALUES (1,1,'2030-05-10 10:00:01',1),(2,1,'2030-05-10 12:00:02',1),(3,2,'2030-06-01 00:00:00',0),(4,3,'2030-07-01 00:00:00',1),(5,3,'2030-07-02 00:00:00',1);
CREATE TABLE `wp_bookingtypes` (
  `booking_type_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL DEFAULT '',
  PRIMARY KEY (`booking_type_id`)
) ENGINE=InnoDB;
INSERT INTO `wp_bookingtypes` VALUES (1,'Camera doppia'),(2,'Sala riunioni');

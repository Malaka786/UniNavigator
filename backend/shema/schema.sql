-- UniNavigator schema (MySQL)
CREATE DATABASE IF NOT EXISTS uniNavigator;
USE uniNavigator;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'student',
  index_number VARCHAR(100) DEFAULT NULL,
  profile_pic TEXT DEFAULT NULL,
  target_gpa DECIMAL(3,2) DEFAULT NULL,
  target_attendance INT DEFAULT 80,
  notify_deadlines TINYINT(1) DEFAULT 1,
  deadline_reminder_days INT DEFAULT 3,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS universities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  general_email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lecture_halls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  university_id INT NOT NULL,
  hall_name VARCHAR(255) NOT NULL,
  building_name VARCHAR(255) DEFAULT NULL,
  floor_number INT DEFAULT NULL,
  center_lat DECIMAL(10,7) NOT NULL,
  center_lng DECIMAL(10,7) NOT NULL,
  radius_m INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS timetable_pdfs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  university_id INT NOT NULL,
  semester VARCHAR(50) NOT NULL,
  academic_year INT DEFAULT NULL,
  semester_number INT DEFAULT NULL,
  year_number INT DEFAULT NULL,
  file_path TEXT NOT NULL,
  uploaded_by_admin_id INT DEFAULT NULL,
  uploaded_by_user_id INT DEFAULT NULL,
  admin_review_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  admin_review_note VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_admin_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS concerns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  university_id INT NOT NULL,
  category VARCHAR(50) DEFAULT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  forwarded_at TIMESTAMP DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usage_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  event_type VARCHAR(50) NOT NULL,
  page VARCHAR(100) DEFAULT NULL,
  meta JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  university_id INT DEFAULT NULL,
  academic_year INT DEFAULT NULL,
  semester_in_year INT DEFAULT NULL,
  source_type VARCHAR(30) NOT NULL DEFAULT 'normal',
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) DEFAULT NULL,
  credits INT NOT NULL DEFAULT 3,
  grade_letter VARCHAR(5) DEFAULT NULL,
  grade_point DECIMAL(3,2) DEFAULT NULL,
  ca_percentage INT DEFAULT NULL,
  semester INT DEFAULT 1,
  is_repeat TINYINT(1) DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  module_name VARCHAR(255) NOT NULL,
  attended INT NOT NULL DEFAULT 0,
  total_sessions INT NOT NULL DEFAULT 0,
  semester INT DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  module_name VARCHAR(255) NOT NULL,
  semester INT DEFAULT NULL,
  attended INT NOT NULL DEFAULT 0,
  total_sessions INT NOT NULL DEFAULT 0,
  lecture_date DATE DEFAULT NULL,
  delivery_mode VARCHAR(20) NOT NULL DEFAULT 'offline',
  university_id INT DEFAULT NULL,
  hall_id INT DEFAULT NULL,
  proof_path TEXT DEFAULT NULL,
  verification_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE SET NULL,
  FOREIGN KEY (hall_id) REFERENCES lecture_halls(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS schedule_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  university_id INT NOT NULL,
  semester INT DEFAULT NULL,
  academic_year INT DEFAULT NULL,
  year_number INT DEFAULT NULL,
  day_of_week VARCHAR(15) NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  module_name VARCHAR(255) NOT NULL,
  delivery_mode VARCHAR(20) NOT NULL DEFAULT 'physical',
  location_text VARCHAR(255) DEFAULT NULL,
  hall_id INT DEFAULT NULL,
  verification_status VARCHAR(30) NOT NULL DEFAULT 'timetable_missing',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE,
  FOREIGN KEY (hall_id) REFERENCES lecture_halls(id) ON DELETE SET NULL,
  INDEX (user_id, university_id, semester, year_number, day_of_week)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  module_code VARCHAR(50) DEFAULT NULL,
  title VARCHAR(500) NOT NULL,
  due_date DATE DEFAULT NULL,
  priority_score INT DEFAULT 5,
  completed TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- If you already have users table, run these to add new columns (ignore errors if column exists):
-- ALTER TABLE users ADD COLUMN index_number VARCHAR(100) DEFAULT NULL;
-- ALTER TABLE users ADD COLUMN profile_pic TEXT DEFAULT NULL;
-- ALTER TABLE users ADD COLUMN target_gpa DECIMAL(3,2) DEFAULT NULL;
-- ALTER TABLE users ADD COLUMN target_attendance INT DEFAULT 80;
-- ALTER TABLE users ADD COLUMN notify_deadlines TINYINT(1) DEFAULT 1;
-- ALTER TABLE users ADD COLUMN deadline_reminder_days INT DEFAULT 3;
-- CREATE TABLE IF NOT EXISTS tasks (...);  -- use the tasks table definition above

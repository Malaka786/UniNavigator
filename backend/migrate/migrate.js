// Database migration script (idempotent): add missing columns
const mysql = require("mysql2/promise");

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "200412",
    database: process.env.DB_NAME || "uniNavigator",
  });

  try {
    const schema = process.env.DB_NAME || "uniNavigator";

    async function columnExists(table, column) {
      const [rows] = await connection.query(
        `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
      `,
        [schema, table, column]
      );
      return rows.length > 0;
    }

    async function addColumnIfMissing({ table, column, ddl }) {
      const exists = await columnExists(table, column);
      if (exists) {
        console.log(`${table}.${column} already exists.`);
        return;
      }
      console.log(`Adding ${table}.${column}...`);
      await connection.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
      console.log(`Added ${table}.${column}.`);
    }

    // modules
    await addColumnIfMissing({
      table: "modules",
      column: "ca_percentage",
      ddl: "ca_percentage INT DEFAULT NULL AFTER grade_point",
    });
    await addColumnIfMissing({
      table: "modules",
      column: "university_id",
      ddl: "university_id INT DEFAULT NULL AFTER user_id",
    });
    await addColumnIfMissing({
      table: "modules",
      column: "academic_year",
      ddl: "academic_year INT DEFAULT NULL AFTER university_id",
    });
    await addColumnIfMissing({
      table: "modules",
      column: "semester_in_year",
      ddl: "semester_in_year INT DEFAULT NULL AFTER academic_year",
    });
    await addColumnIfMissing({
      table: "modules",
      column: "source_type",
      ddl: "source_type VARCHAR(30) NOT NULL DEFAULT 'normal' AFTER semester_in_year",
    });

    // tasks
    await addColumnIfMissing({
      table: "tasks",
      column: "module_code",
      ddl: "module_code VARCHAR(50) DEFAULT NULL AFTER user_id",
    });

    // timetable_pdfs (academic year semantics, keep year_number too)
    await addColumnIfMissing({
      table: "timetable_pdfs",
      column: "academic_year",
      ddl: "academic_year INT DEFAULT NULL AFTER semester",
    });
    await addColumnIfMissing({
      table: "timetable_pdfs",
      column: "semester_number",
      ddl: "semester_number INT DEFAULT NULL AFTER academic_year",
    });

    // schedule_slots (academic year semantics, keep year_number name)
    await addColumnIfMissing({
      table: "schedule_slots",
      column: "academic_year",
      ddl: "academic_year INT DEFAULT NULL AFTER semester",
    });

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await connection.end();
  }
}

migrate();
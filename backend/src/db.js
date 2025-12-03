import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { DB_FILE, ADMIN_EMAIL } from "./config.js";
import { coursesSeed, exercisesSeed } from "./data/seedData.js";
import bcrypt from "bcryptjs";

let db;

export async function getDb() {
  if (db) return db;
  db = await open({
    filename: DB_FILE,
    driver: sqlite3.Database,
  });
  await migrate(db);
  await seed(db);
  return db;
}

async function migrate(dbInstance) {
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL DEFAULT 0,
      is_free INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      statement TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      initial_code TEXT,
      [order] INTEGER NOT NULL,
      FOREIGN KEY(course_id) REFERENCES courses(id)
    );

    CREATE TABLE IF NOT EXISTS exercise_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      UNIQUE(user_id, exercise_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attachment_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(course_id) REFERENCES courses(id)
    );

    CREATE TABLE IF NOT EXISTS user_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      unlocked_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, course_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(course_id) REFERENCES courses(id)
    );
  `);
}

async function seed(dbInstance) {
  const { count: userCount } = await dbInstance.get("SELECT COUNT(*) as count FROM users");
  if (userCount === 0) {
    const hash = await bcrypt.hash("admin123", 10);
    await dbInstance.run(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      ["Admin", ADMIN_EMAIL, hash, "admin"]
    );
  }

  const { count: courseCount } = await dbInstance.get("SELECT COUNT(*) as count FROM courses");
  if (courseCount === 0) {
    for (const course of coursesSeed) {
      const result = await dbInstance.run(
        "INSERT INTO courses (name, description, price, is_free) VALUES (?, ?, ?, ?)",
        [course.name, course.description, course.price, course.is_free ? 1 : 0]
      );
      const courseId = result.lastID;
      const exercises = exercisesSeed[course.name] || [];
      for (const ex of exercises) {
        await dbInstance.run(
          "INSERT INTO exercises (course_id, title, statement, difficulty, initial_code, [order]) VALUES (?, ?, ?, ?, ?, ?)",
          [courseId, ex.title, ex.statement, ex.difficulty, ex.initial_code || "", ex.order]
        );
      }
    }
  }
}

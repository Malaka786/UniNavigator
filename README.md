# UniNavigator (ITP_105)

Academic performance management for Sri Lankan university students – GPA/CGPA, attendance (80% rule), task planner, repeat & improvement, and PDF report.

## Run the project

### 1) Requirements

- **Node.js:** `v24.14.0` (or newer)
- **MySQL:** 8.x (or compatible)

### 2) Create database + tables (MySQL)

1. Create a database (example):
   ```sql
   CREATE DATABASE uninavigator CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   ```

2. Import the schema:
   - Open MySQL Workbench and run `schema.sql`, **or**
   - Use CLI:
     ```bash
     mysql -u root -p uninavigator < schema.sql
     ```

### 3) Configure environment variables

Copy `.env.example` to `.env` and edit values.

### 4) Install dependencies
   ```bash
   cd uninavigator
   npm install
   ```

### 5) Start the server
   ```bash
   npm start
   ```

### 6) Open in browser

**http://localhost:3000**

## Features (from ITP_105 PDF)

- **User management** – Register, login, profile
- **GPA Tracker & Goal Calculator** – Weighted credit method; add modules, view CGPA and semester GPAs
- **Repeat & Improvement** – View academic history, edit/delete modules; CGPA recalculates
- **Attendance Tracker** – 80% rule; total sessions, attended, justified absences; safe absences left
- **Smart Task Planner** – Add tasks by type (assignment, quiz, presentation), due date, priority
- **Profile & Report** – Download academic report as PDF

## Tech stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express
- **Database:** MySQL

## Project structure

```
uninavigator/
├── server.js          # API + DB + PDF
├── package.json
├── package-lock.json
├── schema.sql          # MySQL tables
├── .env.example        # MySQL connection settings
├── public/
│   ├── index.html     # All pages (SPA-style)
│   ├── css/style.css
│   └── js/app.js
└── README.md
```

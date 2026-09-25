const sql = require("mssql");
require("dotenv").config();

const dbConfig = {
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD || "YourPassword123",
  server: process.env.DB_SERVER || "localhost",
  database: process.env.DB_NAME || "RealtorSystem",
  port: Number(process.env.DB_PORT || 1433),
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function connectDB() {
  try {
    await sql.connect(dbConfig);
    console.log("Database connected successfully.");
  } catch (error) {
    console.error("Database connection failed:", error);
  }
}

module.exports = { sql, dbConfig, connectDB };

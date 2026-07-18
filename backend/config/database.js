const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

db.connect((err) => {
  if (err) {
    console.log("Database gagal terkoneksi");
    console.log(err);
  } else {
    console.log("Database berhasil terkoneksi");
  }
});

module.exports = db;

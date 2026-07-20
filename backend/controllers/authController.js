const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/database");
const { getJwtSecret } = require("../config/security");

function normalizeUsername(value) {
  return typeof value === "string" ? value.trim() : "";
}


exports.login = async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!username || !password) {
    return res.status(400).json({
      message: "Username dan password wajib diisi",
    });
  }

  try {
    const result = await db.query(
      `
        SELECT id, nama, username, password_hash, role, is_active
        FROM pengguna
        WHERE LOWER(BTRIM(username)) = LOWER(BTRIM($1))
        LIMIT 1
      `,
      [username],
    );

    if (result.rows.length === 0) {
      req.loginRateLimit?.recordFailure();
      return res.status(401).json({
        message: "Username atau password salah",
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      req.loginRateLimit?.recordFailure();
      return res.status(403).json({
        message: "Akun tidak aktif. Hubungi administrator.",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      req.loginRateLimit?.recordFailure();
      return res.status(401).json({
        message: "Username atau password salah",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      getJwtSecret(),
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
        issuer: "sacika-backend",
        audience: "sacika-frontend",
      },
    );

    req.loginRateLimit?.reset();

    return res.json({
      message: "Login berhasil",
      user: {
        id: user.id,
        nama: user.nama,
        username: user.username,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error("Login gagal:", error.message);
    return res.status(500).json({
      message: "Terjadi kesalahan pada server",
    });
  }
};

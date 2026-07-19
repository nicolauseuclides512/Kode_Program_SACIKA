const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../config/database");

function buildLoginUser(user) {
  return {
    id: user.id,
    nama: user.nama,
    username: user.username,
  };
}

exports.login = async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      message: "Username dan password wajib diisi",
    });
  }

  try {
    const result = await db.query(
      `
        SELECT id, nama, username, password_hash, is_active
        FROM pengguna
        WHERE LOWER(BTRIM(username)) = LOWER(BTRIM($1))
        LIMIT 1
      `,
      [username],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "User tidak ditemukan",
      });
    }

    const user = result.rows[0];

    if (user.is_active === false) {
      return res.status(403).json({
        message: "Pengguna tidak aktif",
      });
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash || "");

    if (!passwordValid) {
      return res.status(401).json({
        message: "Password salah",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    return res.json({
      message: "Login berhasil",
      user: buildLoginUser(user),
      token,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Database error",
      error: err.message,
    });
  }
};

exports.buildLoginUser = buildLoginUser;

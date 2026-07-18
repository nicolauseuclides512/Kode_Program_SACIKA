const db = require("../config/database");
const jwt = require("jsonwebtoken");

exports.login = (req, res) => {
  const { username, password } = req.body;

  const query = "SELECT * FROM pengguna WHERE username=$1";

  db.query(query, [username], (err, result) => {
    if (err) return res.status(500).json(err);

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "User tidak ditemukan",
      });
    }

    const user = result.rows[0];

    if (password !== user.password) {
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

    res.json({
      message: "Login berhasil",
      user: {
        id: user.id,
        nama: user.nama,
        username: user.username,
      },
      token: token,
    });
  });
};

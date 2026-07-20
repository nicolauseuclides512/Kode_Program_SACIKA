const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../config/security");


function extractBearerToken(authHeader) {
  if (typeof authHeader !== "string") {
    return null;
  }

  const [scheme, token, ...extraParts] = authHeader.trim().split(/\s+/);

  if (
    extraParts.length > 0 ||
    scheme?.toLowerCase() !== "bearer" ||
    !token
  ) {
    return null;
  }

  return token;
}

function verifyToken(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({
      message: "Token autentikasi tidak tersedia",
    });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret(), {
      issuer: "sacika-backend",
      audience: "sacika-frontend",
    });

    req.user = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
    };

    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Sesi telah berakhir. Silakan login kembali.",
      });
    }

    return res.status(401).json({
      message: "Token tidak valid",
    });
  }
}

function allowRoles(...allowedRoles) {
  const allowed = new Set(allowedRoles);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Autentikasi diperlukan",
      });
    }

    if (!allowed.has(req.user.role)) {
      return res.status(403).json({
        message: "Anda tidak memiliki hak akses untuk tindakan ini",
      });
    }

    return next();
  };
}

module.exports = {
  allowRoles,
  extractBearerToken,
  verifyToken,
};

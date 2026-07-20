const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const { createLoginRateLimiter } = require("../middleware/loginRateLimiter");

const loginRateLimiter = createLoginRateLimiter();

router.post("/login", loginRateLimiter, authController.login);

module.exports = router;

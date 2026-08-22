const express = require("express");
const teamAuth = require("../auth/team-auth");

const router = express.Router();

router.get("/api/auth/session", teamAuth.getSession);
router.post("/api/auth/login", teamAuth.login);
router.post(
    "/api/auth/logout",
    teamAuth.requireAuth,
    teamAuth.requireCsrf,
    teamAuth.logout
);

module.exports = router;

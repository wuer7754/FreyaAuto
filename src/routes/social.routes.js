const express = require("express");
const socialController = require("../controllers/social.controller");
const teamAuth = require("../auth/team-auth");

const router = express.Router();

router.get("/social/status", socialController.getStatus);
router.get("/social/history", socialController.getHistory);
router.get("/social/pinterest/boards", socialController.getPinterestBoards);
router.post(
    "/social/copy",
    teamAuth.requireRole("editor"),
    socialController.generateCopy
);
router.post(
    "/social/copy/queue",
    teamAuth.requireRole("editor"),
    socialController.generateQueueCopy
);
router.post(
    "/social/image/generate",
    teamAuth.requireRole("editor"),
    socialController.generateImage
);
router.post(
    "/social/media",
    teamAuth.requireRole("editor"),
    express.raw({ type: "application/octet-stream", limit: "10mb" }),
    socialController.uploadImage
);
router.post(
    "/social/publish",
    teamAuth.requireRole("editor"),
    socialController.publish
);
router.post(
    "/social/schedule",
    teamAuth.requireRole("editor"),
    socialController.schedule
);

module.exports = router;

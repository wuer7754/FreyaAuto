const express = require("express"); // 调用express的router功能

const etsyController = require("../controllers/etsy.controller");

const router = express.Router();

router.get("/auth/etsy", etsyController.redirectToEtsy);

router.get("/oauth/etsy/callback", etsyController.handleCallback);

router.get("/etsy/me", etsyController.getCurrentUser);

router.get("/etsy/listings", etsyController.getListings);

router.get("/etsy/refresh-token", etsyController.refreshToken);

router.get("/etsy/listings", etsyController.getActiveListings);

module.exports = router;
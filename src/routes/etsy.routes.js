const express = require("express"); // 调用express的router功能

const app = express();

app.set("json spaces", 2);

const etsyController = require("../controllers/etsy.controller");

const router = express.Router();

router.get("/auth/etsy", etsyController.redirectToEtsy);

router.get("/oauth/etsy/callback", etsyController.handleCallback);

router.get("/etsy/me", etsyController.getCurrentUser);

router.get("/etsy/refresh-token", etsyController.refreshToken);

router.get("/etsy/listings", etsyController.getActiveListings);

router.post(
    "/etsy/listings/:listingId/rewrite",
    etsyController.rewriteListingDescription
);

module.exports = router;
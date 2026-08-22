const express = require("express"); // 调用express的router功能

const app = express();

app.set("json spaces", 2);

const etsyController = require("../controllers/etsy.controller");
const descriptionRotationController = require(
    "../controllers/description-rotation.controller"
);
const teamAuth = require("../auth/team-auth");

const router = express.Router();

router.get(
    "/auth/etsy",
    teamAuth.requireRole("admin"),
    etsyController.redirectToEtsy
);

router.get("/etsy/me", etsyController.getCurrentUser);

router.post(
    "/etsy/refresh-token",
    teamAuth.requireRole("admin"),
    etsyController.refreshToken
);

router.get("/etsy/listings", etsyController.getActiveListings);

router.get("/etsy/performance", etsyController.getPerformance);

router.post(
    "/etsy/performance/import",
    teamAuth.requireRole("editor"),
    etsyController.importLegacyPerformance
);

router.post(
    "/etsy/listings/:listingId/rewrite",
    teamAuth.requireRole("editor"),
    etsyController.rewriteListingDescription
);

router.post(
    "/etsy/listings/:listingId/rewrite-preview",
    teamAuth.requireRole("editor"),
    etsyController.previewListingDescription
);

router.patch(
    "/etsy/listings/:listingId/description",
    teamAuth.requireRole("editor"),
    etsyController.updateListingDescription
);

router.get(
    "/etsy/description-rotation",
    descriptionRotationController.getDescriptionRotation
);

router.put(
    "/etsy/description-rotation",
    teamAuth.requireRole("admin"),
    descriptionRotationController.updateDescriptionRotation
);

module.exports = router;

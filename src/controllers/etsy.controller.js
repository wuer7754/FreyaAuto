const etsyService = require("../integrations/etsy/etsy.service");

const tokenManager = require("../utils/token.manager");

const openaiService = require(
    "../integrations/openai/openai.service"
);
const performanceTracker = require(
    "../analytics/performance-tracker.service"
);

function getErrorMessage(error, fallback) {
    return (
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.cause?.message ||
        error.message ||
        fallback
    );
}

async function redirectToEtsy(req, res) {
    try {
        const authUrl = etsyService.buildAuthUrl();
        res.redirect(authUrl);
    } catch (error) {
        console.error("Etsy auth error:", error);
        res.status(500).send("Failed to start Etsy authorization.");
    }
}

async function handleCallback(req, res) {
    try {
        const { code, state, error } = req.query;

        if (error) {
            console.error("Etsy OAuth rejected:", error);
            return res.redirect("/app/?etsy=connection-failed");
        }

        if (!code || !state) {
            return res.redirect("/app/?etsy=connection-failed");
        }

        const tokenData = await etsyService.exchangeCodeForToken(code, state);
        tokenManager.saveToken(tokenData);

        // 授权成功后立即补全用户和店铺 ID，这样回到工作台即可直接加载 Listings。
        const user = await etsyService.getCurrentUser();
        tokenManager.updateToken({
            user_id: user.user_id,
            shop_id: user.shop_id,
        });

        // Etsy OAuth 与 Freya Auto 使用同一公网域名，保留团队登录 Cookie 并回到应用。
        res.redirect("/app/?etsy=connected");
    } catch (error) {
        console.error("Etsy callback error:", error.response?.data || error.message);
        let hasExistingToken = false;
        try {
            hasExistingToken = Boolean(tokenManager.readToken()?.access_token);
        } catch {
            hasExistingToken = false;
        }
        const status = hasExistingToken
            ? "existing-connection"
            : "connection-failed";
        res.redirect(`/app/?etsy=${status}`);
    }
}
async function getCurrentUser(req, res) {
    try {
        const user = await etsyService.getCurrentUser();

        tokenManager.updateToken({
            user_id: user.user_id,
            shop_id: user.shop_id,
        });
        
        res.json(user);
    } catch (error) {
        console.error("Get Etsy user error:", error.response?.data || error.message);
        res.status(500).send("Failed to get Etsy user.");
    }
}



async function getActiveListings(req, res) {
    try {
        const listings = await etsyService.getActiveListings();
        const listingItems = Array.isArray(listings)
            ? listings
            : listings?.results || [];
        performanceTracker.syncListings(listingItems);

        res.json(listings);
    } catch (error) {
        console.error(
            "Get Etsy listings error:",
            error.response?.data || error.message
        );

        res.status(error.response?.status || 502).json({
            error: getErrorMessage(error, "Failed to get Etsy listings."),
        });
    }
}

async function refreshToken(req, res) {
    try {
        const token = await etsyService.refreshAccessToken();

        res.json({
            message: "Access token refreshed successfully.",
            token,
        });
    } catch (error) {
        console.error(
            "Refresh token error:",
            error.response?.data || error.message
        );

        res.status(500).send("Failed to refresh Etsy access token.");
    }
}



async function rewriteListingDescription(req, res) {
    try {
        const listingId = req.params.listingId;

        if (!listingId) {
            return res.status(400).json({
                error: "Listing ID is required.",
            });
        }

        console.log("1. Fetching Etsy listing:", listingId);
        const listing = await etsyService.getListing(listingId);
        console.log("2. Etsy listing fetched:", listing.title);

        const oldDescription = listing.description;

        console.log("3. Calling OpenAI...");
        const newDescription =
            await openaiService.rewriteListingDescription(listing);
        console.log("4. OpenAI rewrite completed");

        console.log("5. Updating Etsy listing...");
        const updatedListing =
            await etsyService.updateListingDescription(
                listingId,
                newDescription
            );
        console.log("6. Etsy listing updated");

        performanceTracker.recordUpdate({
            listingId,
            title: listing.title,
            viewsBefore: listing.views,
            source: "full-rewrite",
            updatedBy: req.teamUser?.username || "unknown",
        });

        return res.json({
            success: true,
            listing_id: listingId,
            title: listing.title,
            old_description: oldDescription,
            new_description: newDescription,
            updated_listing: updatedListing,
        });
    } catch (error) {
        console.error("Rewrite listing full error:", error);
        console.error("Error cause:", error.cause);
        console.error("Response data:", error.response?.data);

        return res.status(500).json({
            success: false,
            error:
                error.response?.data ||
                error.cause?.message ||
                error.message ||
                "Failed to rewrite listing.",
        });
    }
}

async function previewListingDescription(req, res) {
    try {
        const listingId = req.params.listingId;

        if (!listingId) {
            return res.status(400).json({
                success: false,
                error: "Listing ID is required.",
            });
        }

        const listing = await etsyService.getListing(listingId);
        const newDescription =
            await openaiService.rewriteListingDescription(listing);

        return res.json({
            success: true,
            listing_id: listingId,
            title: listing.title,
            old_description: listing.description,
            new_description: newDescription,
            current_views: listing.views,
        });
    } catch (error) {
        console.error(
            "Preview listing rewrite error:",
            getErrorMessage(error, "Failed to preview listing rewrite.")
        );

        return res.status(error.status || 500).json({
            success: false,
            error: getErrorMessage(
                error,
                "Failed to preview listing rewrite."
            ),
        });
    }
}

async function updateListingDescription(req, res) {
    try {
        const listingId = req.params.listingId;
        const description = req.body?.description;

        if (!listingId) {
            return res.status(400).json({
                success: false,
                error: "Listing ID is required.",
            });
        }

        if (typeof description !== "string" || !description.trim()) {
            return res.status(400).json({
                success: false,
                error: "Description is required.",
            });
        }

        // 更新前重新读取 Etsy 的累计浏览量，作为所有团队成员共享的追踪基准。
        const listing = await etsyService.getListing(listingId);

        const updatedListing =
            await etsyService.updateListingDescription(
                listingId,
                description.trim()
            );

        const performance = performanceTracker.recordUpdate({
            listingId,
            title: listing.title,
            viewsBefore: listing.views,
            source: "manual",
            updatedBy: req.teamUser?.username || "unknown",
        });

        return res.json({
            success: true,
            listing_id: listingId,
            description: description.trim(),
            updated_listing: updatedListing,
            performance,
        });
    } catch (error) {
        console.error(
            "Update listing description error:",
            getErrorMessage(error, "Failed to update listing description.")
        );

        return res.status(error.status || 500).json({
            success: false,
            error: getErrorMessage(
                error,
                "Failed to update listing description."
            ),
        });
    }
}

function getPerformance(req, res) {
    try {
        return res.json(performanceTracker.getPublicData());
    } catch (error) {
        console.error("Get performance tracking error:", error.message);
        return res.status(500).json({
            error: "Failed to load performance tracking data.",
        });
    }
}

function importLegacyPerformance(req, res) {
    try {
        const data = performanceTracker.importLegacy({
            updates: Array.isArray(req.body?.updates) ? req.body.updates : [],
            tracking: Array.isArray(req.body?.tracking) ? req.body.tracking : [],
            importedBy: req.teamUser?.username || "unknown",
        });
        return res.json({
            success: true,
            updates: data.updates,
            records: data.tracking,
        });
    } catch (error) {
        console.error("Import legacy performance error:", error.message);
        return res.status(400).json({
            error: "Failed to import browser tracking data.",
        });
    }
}

module.exports = {
    redirectToEtsy,
    handleCallback,
    getCurrentUser,
    getActiveListings,
    refreshToken,
    rewriteListingDescription,
    previewListingDescription,
    updateListingDescription,
    getPerformance,
    importLegacyPerformance,
};

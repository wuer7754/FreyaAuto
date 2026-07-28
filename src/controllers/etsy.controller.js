const etsyService = require("../integrations/etsy/etsy.service");

const tokenManager = require("../utils/token.manager");

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
            return res.status(400).send(`Etsy OAuth error: ${error}`);
        }

        if (!code || !state) {
            return res.status(400).send("Missing code or state.");
        }

        const tokenData = await etsyService.exchangeCodeForToken(code, state);
        tokenManager.saveToken(tokenData);

        console.log("====== Etsy Token Data ======");
        console.log(tokenData);

        res.send("Etsy connected successfully. Token received.");
    } catch (error) {
        console.error("Etsy callback error:", error.response?.data || error.message);
        res.status(500).send("Failed to exchange Etsy authorization code.");
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

        res.json(listings);
    } catch (error) {
        console.error(
            "Get Etsy listings error:",
            error.response?.data || error.message
        );

        res.status(500).send("Failed to get Etsy listings.");
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

module.exports = {
    redirectToEtsy,
    handleCallback,
    getCurrentUser,
    getActiveListings,
    refreshToken,
};
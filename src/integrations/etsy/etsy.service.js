const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const etsyClient = require("../../client/etsy.client");
const tokenManager = require("../../utils/token.manager");
const shopDashboard = require("../../analytics/shop-dashboard.service");
const oauthStateFile = path.join(__dirname, "../../config/oauth-state.json");
const oauthStateLifetimeMs = 10 * 60 * 1000;

function readOauthStates() {
    try {
        const states = JSON.parse(fs.readFileSync(oauthStateFile, "utf8"));
        const cutoff = Date.now() - oauthStateLifetimeMs;
        return Object.fromEntries(
            Object.entries(states || {}).filter(
                ([, value]) => Number(value?.createdAt) >= cutoff
            )
        );
    } catch (error) {
        if (error.code === "ENOENT") return {};
        throw error;
    }
}

function writeOauthStates(states) {
    fs.mkdirSync(path.dirname(oauthStateFile), { recursive: true });
    fs.writeFileSync(oauthStateFile, `${JSON.stringify(states, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
}

function base64Url(buffer) {
    return buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

function createCodeVerifier() {
    return base64Url(crypto.randomBytes(32));
}

function createCodeChallenge(codeVerifier) {
    return base64Url(
        crypto.createHash("sha256").update(codeVerifier).digest()
    );
}

function buildAuthUrl() {
    const clientId = process.env.ETSY_CLIENT_ID;
    const redirectUri = process.env.ETSY_REDIRECT_URI;
    const scopes = process.env.ETSY_SCOPES;

    const state = crypto.randomBytes(16).toString("hex");
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);

    const states = readOauthStates();
    states[state] = {
        codeVerifier,
        createdAt: Date.now(),
    };
    writeOauthStates(states);

    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scopes,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
    });
    const url = `https://www.etsy.com/oauth/connect?${params.toString()}`;

    return url;
}

async function exchangeCodeForToken(code, state) {
    const states = readOauthStates();
    const saved = states[state];

    if (!saved) {
        throw new Error("Invalid or expired OAuth state.");
    }

    const response = await etsyClient.post(
        "/v3/public/oauth/token",
        new URLSearchParams({
            grant_type: "authorization_code",
            client_id: process.env.ETSY_CLIENT_ID,
            redirect_uri: process.env.ETSY_REDIRECT_URI,
            code,
            code_verifier: saved.codeVerifier,
        }),
        {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        }
    );

    delete states[state];
    writeOauthStates(states);

    return response.data;
}
async function getCurrentUser() {
    let token = tokenManager.getToken();

    if (!token?.access_token){
        throw new Error("missing acess token. please connect Esty first.")

    }
    const requestCurrentUser = () => etsyClient.get(
        "https://openapi.etsy.com/v3/application/users/me",
        {
            headers: {
                "x-api-key": `${process.env.ETSY_CLIENT_ID}:${process.env.ETSY_CLIENT_SECRET}`,
                Authorization: `Bearer ${token.access_token}`,
            },
        }
    );

    const requestCurrentUserWithRetry = async () => {
        try {
            return await requestCurrentUser();
        } catch (error) {
            const status = error.response?.status;
            const isTransient = !error.response || status === 429 || status >= 500;
            if (!isTransient) throw error;
            await new Promise((resolve) => setTimeout(resolve, 600));
            return requestCurrentUser();
        }
    };

    try{
        const response = await requestCurrentUserWithRetry();
        
        return response.data;

    }catch (error){
        const isExpired = error.response?.data?.error == "invalid_token";

        if(!isExpired){
            throw error;
        }

        // 先刷新并跟新token.json
        await refreshAccessToken();

        token = tokenManager.getToken();

        const retryResponse = await requestCurrentUserWithRetry();

        return retryResponse.data;
    }
}

async function  refreshAccessToken(){
    const token = tokenManager.getToken();

    if(!token || !token.refresh_token){
        throw new Error("Missing refresh token. please connnect Esty again.")
    }

    const response = await etsyClient.post(
        "/v3/public/oauth/token",
        new URLSearchParams({
            grant_type: "refresh_token",
            client_id: process.env.ETSY_CLIENT_ID,
            refresh_token: token.refresh_token,
        }),
        {
            headers:{
                "Content-Type":"application/x-www-form-urlencoded",
                "x-api-key": `${process.env.ETSY_CLIENT_ID}:${process.env.ETSY_CLIENT_SECRET}`
            }
        }
    )
    const newTokenData = response.data;
    
    return tokenManager.updateToken({
    access_token: newTokenData.access_token,
    refresh_token: newTokenData.refresh_token,
    token_type: newTokenData.token_type,
    expires_in: newTokenData.expires_in,
});
}

async function getActiveListings() {
    let token = tokenManager.getToken();

    if (!token?.access_token) {
        throw new Error("Missing access token. Please connect Etsy first.");
    }

    if (!token?.shop_id) {
        throw new Error("Missing shop ID. Please load Etsy user information first.");
    }

    const requestListings = async () => {
        return etsyClient.get(
            `/v3/application/shops/${token.shop_id}/listings/active`,
            {
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    "x-api-key": `${process.env.ETSY_CLIENT_ID}:${process.env.ETSY_CLIENT_SECRET}`,
                },
                params: {
                    limit: 25,
                    offset: 0,
                    includes: "Images",
                },
            }
        );
    };

    // Listings 是只读请求。代理偶发断开 TLS 时短暂等待并安全重试一次。
    const requestListingsWithRetry = async () => {
        try {
            return await requestListings();
        } catch (error) {
            const status = error.response?.status;
            const isTransient = !error.response || status === 429 || status >= 500;
            if (!isTransient) throw error;

            await new Promise((resolve) => setTimeout(resolve, 600));
            return requestListings();
        }
    };

    try {
        const response = await requestListingsWithRetry();

        return response.data;
    } catch (error) {
        const isExpired =
            error.response?.data?.error === "invalid_token";

        if (!isExpired) {
            throw error;
        }

        console.log("Access token expired. Refreshing...");

        await refreshAccessToken();

        token = tokenManager.getToken();

        const retryResponse = await requestListingsWithRetry();

        return retryResponse.data;
    }
}

async function getShopDashboard(days = 30) {
    let token = tokenManager.getToken();
    const periodDays = Math.min(Math.max(Number(days) || 30, 1), 365);

    if (!token?.access_token || !token?.shop_id) {
        throw new Error("Missing Etsy connection. Please reconnect Etsy first.");
    }

    const requestDashboard = async () => {
        const headers = {
            Authorization: `Bearer ${token.access_token}`,
            "x-api-key": `${process.env.ETSY_CLIENT_ID}:${process.env.ETSY_CLIENT_SECRET}`,
        };
        const minCreated = Math.floor(
            (Date.now() - periodDays * 24 * 60 * 60 * 1000) / 1000
        );
        const [shopResponse, listingsResponse, firstReceiptsResponse] =
            await Promise.all([
                etsyClient.get(`/v3/application/shops/${token.shop_id}`, {
                    headers,
                }),
                etsyClient.get(
                    `/v3/application/shops/${token.shop_id}/listings/active`,
                    { headers, params: { limit: 100, offset: 0 } }
                ),
                etsyClient.get(
                    `/v3/application/shops/${token.shop_id}/receipts`,
                    {
                        headers,
                        params: {
                            min_created: minCreated,
                            limit: 100,
                            offset: 0,
                            was_canceled: false,
                        },
                    }
                ),
            ]);

        const receipts = [...(firstReceiptsResponse.data?.results || [])];
        const receiptCount = Number(firstReceiptsResponse.data?.count) || receipts.length;
        for (let offset = 100; offset < Math.min(receiptCount, 1000); offset += 100) {
            const response = await etsyClient.get(
                `/v3/application/shops/${token.shop_id}/receipts`,
                {
                    headers,
                    params: {
                        min_created: minCreated,
                        limit: 100,
                        offset,
                        was_canceled: false,
                    },
                }
            );
            receipts.push(...(response.data?.results || []));
        }

        return shopDashboard.buildShopDashboard({
            shop: shopResponse.data,
            listings: listingsResponse.data?.results || [],
            receipts,
            days: periodDays,
        });
    };

    try {
        return await requestDashboard();
    } catch (error) {
        const isExpired =
            error.response?.status === 401 ||
            error.response?.data?.error === "invalid_token";
        if (!isExpired) throw error;

        await refreshAccessToken();
        token = tokenManager.getToken();
        return requestDashboard();
    }
}
async function getListing(listingId) {
    let token = tokenManager.getToken();

    if (!token?.access_token) {
        throw new Error(
            "Missing access token. Please connect Etsy first."
        );
    }

    const requestListing = async () => {
        return etsyClient.get(
            `/v3/application/listings/${listingId}`,
            {
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    "x-api-key":
                        `${process.env.ETSY_CLIENT_ID}:` +
                        `${process.env.ETSY_CLIENT_SECRET}`,
                },
            }
        );
    };

    try {
        const response = await requestListing();

        return response.data;
    } catch (error) {
        const isExpired =
            error.response?.status === 401 ||
            error.response?.data?.error === "invalid_token";

        if (!isExpired) {
            throw error;
        }

        await refreshAccessToken();

        token = tokenManager.getToken();

        const retryResponse = await requestListing();

        return retryResponse.data;
    }

}

async function getListingImages(listingId) {
    let token = tokenManager.getToken();
    if (!token?.access_token) {
        throw new Error("Missing access token. Please connect Etsy first.");
    }
    const requestImages = () => etsyClient.get(
        `/v3/application/listings/${listingId}/images`,
        {
            headers: {
                Authorization: `Bearer ${token.access_token}`,
                "x-api-key": `${process.env.ETSY_CLIENT_ID}:${process.env.ETSY_CLIENT_SECRET}`,
            },
        }
    );
    try {
        return (await requestImages()).data;
    } catch (error) {
        const isExpired = error.response?.status === 401 || error.response?.data?.error === "invalid_token";
        if (!isExpired) throw error;
        await refreshAccessToken();
        token = tokenManager.getToken();
        return (await requestImages()).data;
    }
}

async function updateListingDescription(
    listingId,
    description
) {
    let token = tokenManager.getToken();

    if (!token?.access_token) {
        throw new Error(
            "Missing access token. Please connect Etsy first."
        );
    }

    if (!description?.trim()) {
        throw new Error("Description cannot be empty.");
    }

    const requestUpdate = async () => {
        const body = new URLSearchParams();

        body.append("description", description);

        return etsyClient.patch(
            `/v3/application/shops/${token.shop_id}/listings/${listingId}`,
            body,
            {
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    "x-api-key":
                        `${process.env.ETSY_CLIENT_ID}:` +
                        `${process.env.ETSY_CLIENT_SECRET}`,
                    "Content-Type":
                        "application/x-www-form-urlencoded; charset=utf-8",
                },
            }
        );
    };

    try {
        const response = await requestUpdate();

        return response.data;
    } catch (error) {
        const isExpired =
            error.response?.status === 401 ||
            error.response?.data?.error === "invalid_token";

        if (!isExpired) {
            throw error;
        }

        await refreshAccessToken();

        token = tokenManager.getToken();

        const retryResponse = await requestUpdate();

        return retryResponse.data;
    }
}

function publicApiHeaders() {
    return {
        "x-api-key": `${process.env.ETSY_CLIENT_ID}:${process.env.ETSY_CLIENT_SECRET}`,
    };
}

async function searchActiveListings(keywords, limit = 24) {
    const cleanedKeywords = String(keywords || "").trim();
    if (cleanedKeywords.length < 2) {
        throw new Error("Enter at least two characters to research Etsy listings.");
    }

    const response = await etsyClient.get("/v3/application/listings/active", {
        headers: publicApiHeaders(),
        params: {
            keywords: cleanedKeywords,
            limit: Math.min(Math.max(Number(limit) || 24, 1), 50),
            sort_on: "score",
            sort_order: "desc",
        },
    });

    return response.data;
}

async function getListingsByIds(listingIds) {
    const ids = [...new Set((listingIds || []).map(Number).filter(Number.isInteger))];
    if (ids.length === 0) return { count: 0, results: [] };

    const response = await etsyClient.get("/v3/application/listings/batch", {
        headers: publicApiHeaders(),
        params: {
            listing_ids: ids.slice(0, 100).join(","),
            includes: "Images,Shop,BuyerPrice",
            buyer_country: process.env.ETSY_MARKET_COUNTRY || "US",
            currency: process.env.ETSY_MARKET_CURRENCY || "USD",
        },
    });

    return response.data;
}

async function updateListingTags(listingId, tags) {
    let token = tokenManager.getToken();
    const normalizedTags = [...new Set(
        (Array.isArray(tags) ? tags : [])
            .map((tag) => String(tag).trim().replace(/\s+/g, " "))
            .filter(Boolean)
    )];

    if (!token?.access_token || !token?.shop_id) {
        throw new Error("Missing Etsy connection. Please reconnect Etsy first.");
    }
    if (normalizedTags.length === 0 || normalizedTags.length > 13) {
        throw new Error("Choose between 1 and 13 Etsy tags.");
    }
    if (normalizedTags.some((tag) => tag.length > 20)) {
        throw new Error("Each Etsy tag must be 20 characters or fewer.");
    }
    if (normalizedTags.some((tag) => !/^[\p{L}\p{N}\p{Zs}'-]+$/u.test(tag))) {
        throw new Error("Tags may contain letters, numbers, spaces, apostrophes, and hyphens only.");
    }

    const requestUpdate = () => {
        const body = new URLSearchParams();
        body.append("tags", normalizedTags.join(","));
        return etsyClient.patch(
            `/v3/application/shops/${token.shop_id}/listings/${listingId}`,
            body,
            {
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    ...publicApiHeaders(),
                    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
                },
            }
        );
    };

    try {
        const response = await requestUpdate();
        return response.data;
    } catch (error) {
        const isExpired =
            error.response?.status === 401 ||
            error.response?.data?.error === "invalid_token";
        if (!isExpired) throw error;

        await refreshAccessToken();
        token = tokenManager.getToken();
        const response = await requestUpdate();
        return response.data;
    }
}

async function updateListingKeywords(listingId, { title, tags }) {
    let token = tokenManager.getToken();
    const normalizedTitle = String(title || "").trim().replace(/\s+/g, " ");
    const normalizedTags = [...new Set(
        (Array.isArray(tags) ? tags : [])
            .map((tag) => String(tag).trim().replace(/\s+/g, " "))
            .filter(Boolean)
    )];

    if (!token?.access_token || !token?.shop_id) {
        throw new Error("Missing Etsy connection. Please reconnect Etsy first.");
    }
    if (!normalizedTitle || normalizedTitle.length > 140) {
        throw new Error("Etsy titles must contain between 1 and 140 characters.");
    }
    if (normalizedTags.length === 0 || normalizedTags.length > 13) {
        throw new Error("Choose between 1 and 13 Etsy tags.");
    }
    if (normalizedTags.some((tag) => tag.length > 20)) {
        throw new Error("Each Etsy tag must be 20 characters or fewer.");
    }
    if (normalizedTags.some((tag) => !/^[\p{L}\p{N}\p{Zs}'-]+$/u.test(tag))) {
        throw new Error("Tags may contain letters, numbers, spaces, apostrophes, and hyphens only.");
    }

    const requestUpdate = () => {
        const body = new URLSearchParams();
        body.append("title", normalizedTitle);
        body.append("tags", normalizedTags.join(","));
        return etsyClient.patch(
            `/v3/application/shops/${token.shop_id}/listings/${listingId}`,
            body,
            {
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    ...publicApiHeaders(),
                    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
                },
            }
        );
    };

    try {
        const response = await requestUpdate();
        return response.data;
    } catch (error) {
        const isExpired =
            error.response?.status === 401 ||
            error.response?.data?.error === "invalid_token";
        if (!isExpired) throw error;

        await refreshAccessToken();
        token = tokenManager.getToken();
        const response = await requestUpdate();
        return response.data;
    }
}
module.exports = {
    buildAuthUrl,
    exchangeCodeForToken,
    getCurrentUser,
    refreshAccessToken,
    getActiveListings,
    getShopDashboard,
    getListing,
    getListingImages,
    updateListingDescription,
    searchActiveListings,
    getListingsByIds,
    updateListingTags,
    updateListingKeywords,
};

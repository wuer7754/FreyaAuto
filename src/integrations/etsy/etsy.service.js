const crypto = require("crypto");
const axios = require("axios");
const tokenManager = require("../../utils/token.manager");
const oauthStore = new Map();

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

    oauthStore.set(state, {
        codeVerifier,
        createdAt: Date.now(),
    });

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

    console.log(url);

    return url;
}

async function exchangeCodeForToken(code, state) {
    const saved = oauthStore.get(state);

    if (!saved) {
        throw new Error("Invalid or expired OAuth state.");
    }

    oauthStore.delete(state);

    const response = await axios.post(
        "https://api.etsy.com/v3/public/oauth/token",
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

    return response.data;
}
async function getCurrentUser() {
    let token = tokenManager.getToken();

    if (!token?.access_token){
        throw new Error("missing acess token. please connect Esty first.")

    }
    try{
        const reponse = await axios.get(
         "https://openapi.etsy.com/v3/application/users/me",
            {
                headers: {
                    "x-api-key": `${process.env.ETSY_CLIENT_ID}:${process.env.ETSY_CLIENT_SECRET}`,
                    Authorization: `Bearer ${token.access_token}`,
                },
            }
        );
        
        return response.data;

    }catch (error){
        const isExpired = error.response?.data?.error == "invalid_token";

        if(!isExpired){
            throw error;
        }

        // 先刷新并跟新token.json
        await refreshAccessToken();

        token = tokenManager.getToken();

        const retryResponse = await axios.get(
            "https://openapi.etsy.com/v3/application/users/me",
            {
                headers: {
                    "x-api-key": `${process.env.ETSY_CLIENT_ID}:${process.env.ETSY_CLIENT_SECRET}`,
                    Authorization: `Bearer ${token.access_token}`,
                },
            }
        );

        return retryResponse.data;
    }
}

async function  refreshAccessToken(){
    const token = tokenManager.getToken();

    if(!token || !token.refresh_token){
        throw new Error("Missing refresh token. please connnect Esty again.")
    }

    const response = await axios.post(
        "https://api.etsy.com/v3/public/oauth/token",
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
        return axios.get(
            `https://api.etsy.com/v3/application/shops/${token.shop_id}/listings/active`,
            {
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    "x-api-key": `${process.env.ETSY_CLIENT_ID}:${process.env.ETSY_CLIENT_SECRET}`,
                },
                params: {
                    limit: 25,
                    offset: 0,
                },
            }
        );
    };

    try {
        const response = await requestListings();

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

        const retryResponse = await requestListings();

        return retryResponse.data;
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
        return axios.get(
            `https://api.etsy.com/v3/application/listings/${listingId}`,
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

        return axios.patch(
            `https://api.etsy.com/v3/application/shops/${token.shop_id}/listings/${listingId}`,
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
module.exports = {
    buildAuthUrl,
    exchangeCodeForToken,
    getCurrentUser,
    refreshAccessToken,
    getActiveListings,
    getListing,
    updateListingDescription,
};


let csrfToken = "";

async function request(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const response = await fetch(path, {
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken
                ? { "X-Freya-CSRF": csrfToken }
                : {}),
            ...options.headers,
        },
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

    if (!response.ok) {
        let message =
            typeof payload === "string"
                ? payload
                : payload?.error?.message || payload?.error || "Request failed.";
        if (
            typeof message === "string" &&
            (message.includes("Cannot GET /etsy/") || message.includes("<!DOCTYPE html>"))
        ) {
            message =
                "The Freya Auto server is running an older API. Restart the server, then try again.";
        }
        // A server restart can invalidate an old signed cookie.  Tell App.jsx
        // immediately so it returns to the login screen instead of showing a
        // misleading feature-specific error state.
        if (response.status === 401) {
            window.dispatchEvent(new Event("freya-auth-expired"));
        }
        throw new Error(message);
    }

    return payload;
}

export async function getAuthSession() {
    const response = await request("/api/auth/session");
    csrfToken = response?.user?.csrfToken || "";
    return response;
}

export async function loginTeamMember(username, password) {
    const response = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
    });
    csrfToken = response?.user?.csrfToken || "";
    return response;
}

export async function logoutTeamMember() {
    const response = await request("/api/auth/logout", { method: "POST" });
    csrfToken = "";
    return response;
}

export function getEtsyAccount() {
    return request("/etsy/me");
}

export function getListings() {
    return request("/etsy/listings");
}

export function getEtsyListingImages(listingId) {
    return request(`/etsy/listings/${encodeURIComponent(listingId)}/images`);
}

export function getShopDashboard(days = 30) {
    return request(`/etsy/dashboard?days=${encodeURIComponent(days)}`);
}

export function getPerformance() {
    return request("/etsy/performance");
}

export function importLegacyPerformance(updates, tracking) {
    return request("/etsy/performance/import", {
        method: "POST",
        body: JSON.stringify({ updates, tracking }),
    });
}

export function previewRewrite(listingId) {
    return request(`/etsy/listings/${listingId}/rewrite-preview`, {
        method: "POST",
    });
}

export function applyDescription(listingId, description) {
    return request(`/etsy/listings/${listingId}/description`, {
        method: "PATCH",
        body: JSON.stringify({ description }),
    });
}

export function getDescriptionRotation() {
    return request("/etsy/description-rotation");
}

export function researchEtsyMarket(keywords, limit = 24) {
    const params = new URLSearchParams({ keywords, limit: String(limit) });
    return request(`/etsy/market/search?${params.toString()}`);
}

export function updateListingTags(listingId, tags) {
    return request(`/etsy/listings/${listingId}/tags`, {
        method: "PATCH",
        body: JSON.stringify({ tags }),
    });
}

export function updateListingKeywords(listingId, title, tags) {
    return request(`/etsy/listings/${listingId}/keywords`, {
        method: "PATCH",
        body: JSON.stringify({ title, tags }),
    });
}

export function saveDescriptionRotation(config) {
    return request("/etsy/description-rotation", {
        method: "PUT",
        body: JSON.stringify(config),
    });
}

export function getSocialStatus() {
    return request("/social/status");
}

export function getSocialHistory(limit = 20) {
    return request(`/social/history?limit=${encodeURIComponent(limit)}`);
}

export function getPinterestBoards() {
    return request("/social/pinterest/boards");
}

export function uploadSocialImage(file) {
    return request("/social/media", {
        method: "POST",
        body: file,
        headers: {
            "Content-Type": "application/octet-stream",
            "X-Freya-File-Type": file.type,
        },
    });
}

export function generateSocialCopy(listingId, brief) {
    return request("/social/copy", {
        method: "POST",
        body: JSON.stringify({ listingId, brief }),
    });
}

export function generateSocialQueueCopy(listingId, brief, items) {
    return request("/social/copy/queue", {
        method: "POST",
        body: JSON.stringify({ listingId, brief, items }),
    });
}

export function generateSocialImage(payload) {
    return request("/social/image/generate", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export function publishSocialCampaign(campaign) {
    return request("/social/publish", {
        method: "POST",
        body: JSON.stringify(campaign),
    });
}

export function scheduleSocialCampaigns(campaigns) {
    return request("/social/schedule", {
        method: "POST",
        body: JSON.stringify({ campaigns }),
    });
}

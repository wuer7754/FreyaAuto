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
        const message =
            typeof payload === "string"
                ? payload
                : payload?.error?.message || payload?.error || "Request failed.";
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

export function saveDescriptionRotation(config) {
    return request("/etsy/description-rotation", {
        method: "PUT",
        body: JSON.stringify(config),
    });
}

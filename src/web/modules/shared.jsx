/**
 * 共用基础层：只提供展示组件与格式化函数，不管理业务状态。
 * 五个功能模块依赖这里，避免互相导入造成循环依赖。
 * 参数中的 { listing, large = false } 是解构与默认值；icon: Icon 是重命名，
 * JSX 自定义组件需要大写开头。?. 在值为空时停止读取，|| 提供后备值。
 */

export function getListingImage(listing) {
    const image = listing?.images?.[0];
    return (
        image?.url_570xN ||
        image?.url_fullxfull ||
        image?.url_170x135 ||
        listing?.image_url ||
        ""
    );
}

export function getEtsyImageUrl(image) {
    return image?.url_fullxfull || image?.url_570xN || image?.url_170x135 || image?.url_75x75 || "";
}

export function formatPrice(listing) {
    const price = listing?.price;
    if (!price) return "—";
    if (typeof price === "string" || typeof price === "number") {
        return String(price);
    }
    const divisor = Number(price.divisor || 100);
    const amount = Number(price.amount || 0) / divisor;
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: price.currency_code || "USD",
    }).format(amount);
}

export function friendlyError(error) {
    const message = error?.message || "Something went wrong.";
    if (message.includes("Country, region, or territory not supported")) {
        return "OpenAI rejected the request because the server's network region is not supported.";
    }
    if (message.includes("Missing shop ID")) {
        return "Your Etsy shop details are missing. Reconnect Etsy, then refresh the workspace.";
    }
    return message;
}

export function ProductThumb({ listing, large = false }) {
    const image = getListingImage(listing);
    return (
        <div className={`product-thumb${large ? " product-thumb--large" : ""}`}>
            {image ? (
                <img src={image} alt="" />
            ) : (
                <span>{listing?.title?.trim()?.charAt(0) || "F"}</span>
            )}
        </div>
    );
}

export function StatusPill({ connected }) {
    return (
        <span className={`status-pill ${connected ? "is-live" : "is-offline"}`}>
            <span className="status-dot" />
            {connected ? "Etsy connected" : "Needs attention"}
        </span>
    );
}

export function EmptyState({ icon: Icon, title, body, action }) {
    return (
        <div className="empty-state">
            <div className="empty-state__icon"><Icon size={22} /></div>
            <h3>{title}</h3>
            <p>{body}</p>
            {action}
        </div>
    );
}

/**
 * 为何这样拆：历史记录与账号设置属于工作区管理，集中在此模块。数据由 App 加载并通过 props 传入，页面只负责展示与触发刷新，避免重复请求。
 * 组件参数的 { ... } 是对象解构，从父组件传入的 props 中取出需要的值。
 * 回调函数让子模块请求父层更新数据，保持 React 单向数据流。
 */
import { useEffect, useState } from "react";
import {
    Check,
    Camera,
    Cloud,
    History,
    LockKeyhole,
    MessageCircle,
    RefreshCw,
    Share2,
    ShieldCheck,
    Sparkles,
} from "lucide-react";
import { getSocialStatus } from "../api";
import { StatusPill, EmptyState } from "./shared";

// 把服务器保存的来源代码转换成页面上显示的名称。
function getUpdateSourceLabel(source) {
    // switch 检查 source 的值；匹配某个 case 后，return 返回名称并结束函数。
    switch (source) {
        case "weekly-rotation":
            return "Weekly rotation";
        case "keyword-update":
            return "Keyword update";
        default:
            // 其他来源沿用原来的显示规则，归为手动更新。
            return "Manual update";
    }
}

// history.map 为每条记录生成节点；key 使用记录 id，帮助 React 正确复用列表元素。
// 三元表达式 condition ? a : b 在有记录时显示列表，否则显示空状态。
export function HistoryPage({ history }) {
    return (
        <div className="page-stack page-enter">
            <section className="page-intro"><div><span className="section-kicker">Shared audit trail</span><h2>Update history</h2><p>Manual and scheduled updates are stored on the server and shared with the private team.</p></div></section>
            <section className="content-card">
                {history.length ? (
                    <div className="history-list">
                        {history.map((item) => (
                            <article key={item.id} className="history-item">
                                <div className="history-item__icon"><Check size={18} /></div>
                                <div>
                                    <strong>{item.title}</strong>
                                    <span>
                                        Listing #{item.listingId} · {getUpdateSourceLabel(item.source)} · {item.updatedBy}
                                    </span>
                                </div>
                                <time>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.updatedAt))}</time>
                            </article>
                        ))}
                    </div>
                ) : (
                    <EmptyState icon={History} title="No updates yet" body="Listings updated through the preview workflow will appear here." />
                )}
            </section>
        </div>
    );
}

// account?.user_id 在账号尚未加载时返回 undefined，|| "—" 提供展示后备值。
export function SettingsPage({ account, connected, refresh, refreshing, isAdmin }) {
    const [socialStatus, setSocialStatus] = useState(null);
    const [socialStatusLoading, setSocialStatusLoading] = useState(true);
    const [socialStatusError, setSocialStatusError] = useState("");

    async function loadSocialStatus() {
        setSocialStatusLoading(true);
        setSocialStatusError("");

        try {
            setSocialStatus(await getSocialStatus());
        } catch (error) {
            setSocialStatus(null);
            setSocialStatusError(error?.message || "Unable to check connections.");
        } finally {
            setSocialStatusLoading(false);
        }
    }

    // 空依赖数组 [] 表示设置页面首次显示时检查一次连接状态。
    useEffect(() => {
        loadSocialStatus();
    }, []);

    const connectionCards = [
        {
            id: "buffer",
            name: "Buffer",
            icon: Share2,
            connected: socialStatus?.buffer?.configured,
            detail: socialStatus?.buffer?.organization?.name || "Publishing workspace",
            description: "Coordinates publishing and scheduling across connected social channels.",
        },
        {
            id: "facebook",
            name: "Facebook",
            icon: MessageCircle,
            connected: socialStatus?.facebook?.configured,
            detail: socialStatus?.facebook?.name || "No Facebook channel found",
            description: "Publishes approved promotional copy and images through Buffer.",
        },
        {
            id: "instagram",
            name: "Instagram",
            icon: Camera,
            connected: socialStatus?.instagram?.configured,
            detail: socialStatus?.instagram?.name || "No Instagram channel found",
            description: "Publishes approved image posts and captions through Buffer.",
        },
        {
            id: "r2",
            name: "Cloudflare R2",
            icon: Cloud,
            connected: socialStatus?.r2?.configured,
            detail: socialStatus?.r2?.bucket || "No R2 bucket configured",
            description: "Stores public social images so Buffer can retrieve them securely.",
        },
    ];

    return (
        <div className="page-stack page-enter">
            <section className="page-intro"><div><span className="section-kicker">Connections</span><h2>Workspace settings</h2><p>Review the services Freya Auto uses to read, refine, and update your listings.</p></div></section>
            <section className="settings-grid">
                <article className="setting-card">
                    <div className="setting-card__logo etsy-logo">E</div>

                    <div className="setting-card__body">
                        <div>
                            <h3>Etsy shop</h3>
                            <StatusPill connected={connected} />
                        </div>

                        <p>
                            Used to load active listings and publish descriptions
                            only after confirmation.
                        </p>

                        <dl>
                            <div>
                                <dt>User ID</dt>
                                <dd>{account?.user_id || "—"}</dd>
                            </div>
                            <div>
                                <dt>Shop ID</dt>
                                <dd>{account?.shop_id || "—"}</dd>
                            </div>
                        </dl>
                    </div>

                    <div className="setting-card__actions">
                        {/* 只有管理员可以重新授权 Etsy。 */}
                        {isAdmin ? (
                            <a
                                className="button button--secondary"
                                href="/auth/etsy"
                            >
                                Reconnect Etsy
                            </a>
                        ) : (
                            <span className="role-note">
                                <LockKeyhole size={15} />
                                Admin only
                            </span>
                        )}

                        <button
                            className="button button--ghost"
                            onClick={refresh}
                            disabled={refreshing}
                        >
                            <RefreshCw
                                size={17}
                                className={refreshing ? "spin" : ""}
                            />
                            Check connection
                        </button>
                    </div>
                </article>
                <article className="setting-card">
                    <div className="setting-card__logo ai-logo">
                        <Sparkles size={22} />
                    </div>

                    <div className="setting-card__body">
                        <div>
                            <h3>OpenAI · product descriptions & social copy</h3>

                            {/* 这是固定的配置状态，不依赖组件传入的数据。 */}
                            <span className="status-pill is-live">
                                <span className="status-dot" />
                                OpenAI API configured
                            </span>
                        </div>

                        <p>
                            Uses the OpenAI API and Freya Furniture brand guidance
                            to draft Etsy product descriptions and social-media copy
                            from real listing facts.
                        </p>

                        <div className="privacy-line">
                            <ShieldCheck size={18} />
                            <span>
                                OpenAI creates drafts only. Etsy listings are changed
                                only after you review and confirm an update.
                            </span>
                        </div>
                    </div>
                </article>

                {connectionCards.map((service) => {
                    const ServiceIcon = service.icon;
                    const statusLabel = service.connected ? "Connected" : "Not connected";

                    return (
                        <article className="setting-card" key={service.id}>
                            <div className={`setting-card__logo service-logo service-logo--${service.id}`}>
                                <ServiceIcon size={22} />
                            </div>

                            <div className="setting-card__body">
                                <div>
                                    <h3>{service.name}</h3>
                                    <span
                                        className={`status-pill ${service.connected ? "is-live" : "is-offline"}`}
                                    >
                                        <span className="status-dot" />
                                        {socialStatusLoading ? "Checking…" : statusLabel}
                                    </span>
                                </div>

                                <p>{service.description}</p>

                                <dl>
                                    <div>
                                        <dt>Connection detail</dt>
                                        <dd>{socialStatusLoading ? "Loading…" : service.detail}</dd>
                                    </div>
                                </dl>
                            </div>
                        </article>
                    );
                })}

                <div className="settings-connections-footer">
                    {socialStatusError && (
                        <span className="settings-connection-error">
                            {socialStatusError}
                        </span>
                    )}
                    <button
                        className="button button--ghost"
                        onClick={loadSocialStatus}
                        disabled={socialStatusLoading}
                    >
                        <RefreshCw
                            size={17}
                            className={socialStatusLoading ? "spin" : ""}
                        />
                        Check social connections
                    </button>
                </div>
            </section>
        </div>
    );
}

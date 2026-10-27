/**
 * 为何这样拆：商品浏览、选择与改写是连续工作流，因此放在同一模块。草稿和提交状态由 useCatalog 管理；共享商品与更新记录由 App 注入，确保其他页面看到相同数据。
 * 组件参数的 { ... } 是对象解构，从父组件传入的 props 中取出需要的值。
 * 回调函数让子模块请求父层更新数据，保持 React 单向数据流。
 */
import { useMemo, useState } from "react";
import {
    AlertTriangle,
    ArrowRight,
    Check,
    ChevronRight,
    Clock3,
    ExternalLink,
    LoaderCircle,
    PackageSearch,
    RefreshCw,
    Search,
    ShieldCheck,
    Sparkles,
    WandSparkles,
    X,
} from "lucide-react";
import { applyDescription, getPerformance, previewRewrite } from "../api";
import { formatPrice, friendlyError, ProductThumb, EmptyState } from "./shared";

// 自定义 Hook 复用有状态逻辑，必须在组件顶层调用，不能放进条件分支。
export function useCatalog({ listings, setListings, setHistory, setPerformanceTracking, setToast, navigate }) {
    const [search, setSearch] = useState("");
    const [selectedListing, setSelectedListing] = useState(null);
    const [preview, setPreview] = useState(null);
    const [draftDescription, setDraftDescription] = useState("");
    const [generating, setGenerating] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    // useState 返回 [当前值, 更新函数]；数组解构给它们分别命名。
    // useMemo 的依赖数组表示：商品或搜索词变化时，重新计算过滤结果。
    const filteredListings = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return listings;
        return listings.filter((listing) =>
            `${listing.title || ""} ${listing.listing_id || ""}`
                .toLowerCase()
                .includes(term)
        );
    }, [listings, search]);

    function openStudio(listing) {
        setSelectedListing(listing);
        setPreview(null);
        setDraftDescription("");
        navigate("studio");
    }

    // async/await 按顺序等待请求；finally 无论成功或失败都会恢复按钮状态。
    async function generatePreview() {
        if (!selectedListing) return;
        setGenerating(true);
        setPreview(null);
        try {
            const result = await previewRewrite(selectedListing.listing_id);
            setPreview(result);
            setDraftDescription(result.new_description || "");
            setToast({ type: "success", message: "A new description is ready to review." });
        } catch (error) {
            setToast({ type: "error", message: friendlyError(error) });
        } finally {
            setGenerating(false);
        }
    }

    async function confirmUpdate() {
        if (!selectedListing || !draftDescription.trim()) return;
        setUpdating(true);
        try {
            await applyDescription(selectedListing.listing_id, draftDescription);
            const updated = {
                ...selectedListing,
                description: draftDescription.trim(),
            };
            setSelectedListing(updated);
            // 函数式更新读取最新状态；map 返回新数组，展开语法保留未修改字段。
            setListings((items) =>
                items.map((item) =>
                    item.listing_id === updated.listing_id ? updated : item
                )
            );

            const performance = await getPerformance();
            setHistory(performance.updates || []);
            setPerformanceTracking(performance.records || []);
            setPreview((current) => ({
                ...current,
                old_description: draftDescription.trim(),
                new_description: draftDescription.trim(),
            }));
            setConfirmOpen(false);
            setToast({ type: "success", message: "The Etsy listing was updated successfully." });
        } catch (error) {
            setToast({ type: "error", message: friendlyError(error) });
        } finally {
            setUpdating(false);
        }
    }

    return { search, setSearch, selectedListing, setSelectedListing, preview, setPreview,
        draftDescription, setDraftDescription, generating, updating, confirmOpen, setConfirmOpen,
        filteredListings, openStudio, generatePreview, confirmUpdate };
}

export function OverviewPage({
    loading,
    connected,
    listings,
    history,
    refresh,
    refreshing,
    openStudio,
    navigate,
}) {
    const recent = listings.slice(0, 3);
    return (
        <div className="page-stack page-enter">
            <section className="welcome-panel">
                <div className="welcome-panel__copy">
                    <span className="section-kicker">Your listing atelier</span>
                    <h2>Refine every listing with a calmer, more consistent voice.</h2>
                    <p>
                        Review active Etsy products, generate a Freya-ready description,
                        and approve every change before it reaches your shop.
                    </p>
                    <div className="welcome-panel__actions">
                        <button className="button button--primary" onClick={() => navigate("listings")}>
                            Browse listings <ArrowRight size={18} />
                        </button>
                        <button className="button button--ghost" onClick={refresh} disabled={refreshing}>
                            <RefreshCw size={17} className={refreshing ? "spin" : ""} />
                            Refresh workspace
                        </button>
                    </div>
                </div>
                <div className="welcome-panel__seal" aria-hidden="true">
                    <span>F</span>
                    <small>FREYA<br />FURNITURE</small>
                </div>
            </section>

            <section className="metric-grid" aria-label="Workspace summary">
                <MetricCard label="Active listings" value={loading ? "—" : listings.length} note="Synced from Etsy" icon={PackageSearch} />
                <MetricCard label="Shop connection" value={connected ? "Healthy" : "Action needed"} note={connected ? "OAuth is active" : "Reconnect to continue"} icon={ShieldCheck} tone={connected ? "sage" : "clay"} />
                <MetricCard label="Updates recorded" value={history.length} note="Saved on this Mac" icon={Clock3} tone="gold" />
            </section>

            <section className="content-card">
                <div className="section-heading">
                    <div>
                        <span className="section-kicker">Active collection</span>
                        <h2>Recently loaded listings</h2>
                    </div>
                    <button className="text-button" onClick={() => navigate("listings")}>
                        View all <ChevronRight size={17} />
                    </button>
                </div>
                {loading ? (
                    <div className="skeleton-list"><i /><i /><i /></div>
                ) : recent.length ? (
                    <div className="listing-preview-grid">
                        {recent.map((listing) => (
                            <article className="listing-preview" key={listing.listing_id}>
                                <ProductThumb listing={listing} large />
                                <div className="listing-preview__body">
                                    <span>#{listing.listing_id}</span>
                                    <h3>{listing.title}</h3>
                                    <div>
                                        <strong>{formatPrice(listing)}</strong>
                                        <button onClick={() => openStudio(listing)} aria-label={`Rewrite ${listing.title}`}>
                                            <Sparkles size={17} />
                                        </button>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        icon={PackageSearch}
                        title="No listings loaded"
                        body="Connect Etsy or refresh the workspace to load your active products."
                        action={<a className="button button--primary" href="/auth/etsy">Connect Etsy</a>}
                    />
                )}
            </section>
        </div>
    );
}

function MetricCard({ label, value, note, icon: Icon, tone = "wood" }) {
    return (
        <article className={`metric-card metric-card--${tone}`}>
            <div className="metric-card__icon"><Icon size={20} /></div>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
        </article>
    );
}

// JSX 的 {表达式} 把 JavaScript 值放进界面；map 生成列表，key 标识稳定的项目身份。
export function ListingsPage({ loading, listings, total, search, setSearch, refresh, refreshing, openStudio }) {
    return (
        <div className="page-stack page-enter">
            <section className="page-intro">
                <div>
                    <span className="section-kicker">Etsy inventory</span>
                    <h2>Your active collection</h2>
                    <p>Choose a listing to review and refine. Nothing is published without your confirmation.</p>
                </div>
                <button className="button button--secondary" onClick={refresh} disabled={refreshing}>
                    <RefreshCw size={17} className={refreshing ? "spin" : ""} /> Refresh
                </button>
            </section>

            <section className="content-card content-card--table">
                <div className="table-toolbar">
                    <label className="search-field">
                        <Search size={18} />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search title or listing ID"
                        />
                        {search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={16} /></button>}
                    </label>
                    <span>{listings.length} of {total} listings</span>
                </div>

                {loading ? (
                    <div className="skeleton-table"><i /><i /><i /><i /></div>
                ) : listings.length ? (
                    <div className="table-wrap">
                        <table className="listing-table">
                            <thead>
                                <tr><th>Product</th><th>Status</th><th>Price</th><th>Listing ID</th><th><span className="sr-only">Actions</span></th></tr>
                            </thead>
                            <tbody>
                                {listings.map((listing) => (
                                    <tr key={listing.listing_id}>
                                        <td>
                                            <div className="product-cell">
                                                <ProductThumb listing={listing} />
                                                <div><strong>{listing.title}</strong><span>{listing.quantity ?? "—"} available</span></div>
                                            </div>
                                        </td>
                                        <td><span className="state-badge"><span />{listing.state || "active"}</span></td>
                                        <td>{formatPrice(listing)}</td>
                                        <td><code>{listing.listing_id}</code></td>
                                        <td>
                                            <div className="row-actions">
                                                {listing.url && <a href={listing.url} target="_blank" rel="noreferrer" aria-label="Open on Etsy"><ExternalLink size={17} /></a>}
                                                <button className="button button--small" onClick={() => openStudio(listing)}><Sparkles size={16} /> Rewrite</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <EmptyState icon={Search} title="No matching listings" body="Try a different title or listing ID." />
                )}
            </section>
        </div>
    );
}

// onClick={generate} 传递函数，点击后才执行；onClick={generate()} 会在渲染时立即调用。
export function StudioPage({ listings, selected, setSelected, preview, draft, setDraft, generating, generate, requestUpdate, canEdit }) {
    if (!selected) {
        return (
            <div className="page-enter">
                <EmptyState icon={WandSparkles} title="Choose a listing first" body="Load your Etsy listings, then select one to begin rewriting." />
            </div>
        );
    }

    return (
        <div className="page-stack page-enter">
            <section className="studio-header">
                <div className="studio-product">
                    <ProductThumb listing={selected} large />
                    <div>
                        <span className="section-kicker">Rewrite studio · #{selected.listing_id}</span>
                        <h2>{selected.title}</h2>
                        <p>Generate a brand-aligned draft, edit it freely, then approve the final Etsy update.</p>
                    </div>
                </div>
                <label className="listing-select">
                    <span>Switch listing</span>
                    <select
                        value={selected.listing_id}
                        onChange={(event) => {
                            const next = listings.find((item) => String(item.listing_id) === event.target.value);
                            if (next) setSelected(next);
                        }}
                    >
                        {listings.map((listing) => <option key={listing.listing_id} value={listing.listing_id}>{listing.title}</option>)}
                    </select>
                </label>
            </section>

            <div className="safety-note"><ShieldCheck size={19} /><div><strong>{canEdit ? "Preview-first workflow" : "View-only access"}</strong><span>{canEdit ? "Generating a draft will not change Etsy. You must confirm the update separately." : "Ask an editor or administrator to generate and publish listing descriptions."}</span></div></div>

            <section className="editor-grid">
                <article className="editor-panel">
                    <div className="editor-panel__head"><div><span>Original</span><h3>Current Etsy description</h3></div><small>{(preview?.old_description || selected.description || "").length} characters</small></div>
                    <div className="description-paper description-paper--muted">{preview?.old_description || selected.description || "No description was returned by Etsy."}</div>
                </article>

                <article className="editor-panel editor-panel--accent">
                    <div className="editor-panel__head"><div><span>Freya draft</span><h3>Refined description</h3></div><small>{draft.length} characters</small></div>
                    {generating ? (
                        <div className="generating-state"><div className="generating-orbit"><Sparkles size={22} /></div><strong>Composing the Freya voice…</strong><span>Reviewing product facts and shaping a clean Etsy-ready draft.</span></div>
                    ) : preview ? (
                        <textarea className="draft-editor" value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Rewritten listing description" readOnly={!canEdit} />
                    ) : (
                        <div className="draft-placeholder"><WandSparkles size={28} /><strong>Ready when you are</strong><span>Generate a private draft. Etsy will remain unchanged.</span></div>
                    )}
                </article>
            </section>

            <section className="studio-actions">
                <div><span>Step {preview ? "2" : "1"} of 2</span><strong>{preview ? "Review the draft, then confirm the Etsy update." : "Generate a private preview from the current listing."}</strong></div>
                <div>
                    <button className="button button--secondary" onClick={generate} disabled={generating || !canEdit}>{generating ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}{preview ? "Regenerate draft" : "Generate preview"}</button>
                    <button className="button button--primary" onClick={requestUpdate} disabled={!canEdit || !preview || !draft.trim()}>Update Etsy <ArrowRight size={18} /></button>
                </div>
            </section>
        </div>
    );
}

export function ConfirmDialog({ listing, updating, cancel, confirm }) {
    return (
        <div className="dialog-backdrop" role="presentation">
            <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
                <div className="confirm-dialog__icon"><AlertTriangle size={23} /></div>
                <span className="section-kicker">Final confirmation</span>
                <h2 id="confirm-title">Update this Etsy listing?</h2>
                <p>The current description for <strong>{listing?.title}</strong> will be replaced. This action changes the live Etsy product.</p>
                <div className="confirm-dialog__listing"><ProductThumb listing={listing} /><div><strong>{listing?.title}</strong><span>Listing #{listing?.listing_id}</span></div></div>
                <div className="confirm-dialog__actions"><button className="button button--ghost" onClick={cancel} disabled={updating}>Keep reviewing</button><button className="button button--danger" onClick={confirm} disabled={updating}>{updating ? <LoaderCircle size={18} className="spin" /> : <Check size={18} />}Confirm Etsy update</button></div>
            </section>
        </div>
    );
}

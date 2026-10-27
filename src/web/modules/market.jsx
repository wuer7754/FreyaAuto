/**
 * 市场洞察模块（Market Intelligence）。
 *
 * 这里与 analytics.jsx 分开：Performance 只关心本店浏览量趋势；
 * 本模块只关心 Etsy 市场搜索、竞品价格和 SEO 标签。独立后，每个文件
 * 都有单一职责，App.jsx 只负责把页面拼装起来。
 *
 * 函数参数中的 { listings, canEdit, notify, updateLocalListing } 是 React props 的
 * 对象解构。useState 保存当前页面的临时输入；useEffect 在所选商品变化时同步草稿，
 * 使数据仍从 App 向下传、通过回调向上更新。
 */
import { useEffect, useState } from "react";
import {
    AlertTriangle,
    ArrowRight,
    BadgePercent,
    ChartNoAxesCombined,
    Check,
    ChevronRight,
    ExternalLink,
    Eye,
    LoaderCircle,
    Lightbulb,
    Percent,
    RefreshCw,
    Search,
    Save,
    ShieldCheck,
    Sparkles,
    Store,
    Tags,
    X,
} from "lucide-react";
import { researchEtsyMarket, updateListingTags } from "../api";
import { formatPrice, friendlyError, EmptyState } from "./shared";

function listingPriceNumber(listing) {
    const price = listing?.price;
    if (typeof price === "number") return price;
    if (typeof price === "string") return Number(price) || 0;
    if (!price) return 0;
    return Number(price.amount || 0) / Number(price.divisor || 100);
}

function marketMoney(value, currency = "USD") {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "—";
    }
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
    }).format(Number(value));
}

export function MarketIntelligencePage({ listings, canEdit, notify, updateLocalListing }) {
    const [query, setQuery] = useState("");
    const [research, setResearch] = useState(null);
    const [researching, setResearching] = useState(false);
    const [researchError, setResearchError] = useState("");
    const [selectedListingId, setSelectedListingId] = useState(
        listings[0]?.listing_id || ""
    );
    const selectedListing =
        listings.find(
            (listing) => String(listing.listing_id) === String(selectedListingId)
        ) || listings[0];
    const [draftTags, setDraftTags] = useState(selectedListing?.tags || []);
    const [customTag, setCustomTag] = useState("");
    const [savingTags, setSavingTags] = useState(false);
    const [discount, setDiscount] = useState(15);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    useEffect(() => {
        setDraftTags(Array.isArray(selectedListing?.tags) ? selectedListing.tags : []);
        setCustomTag("");
    }, [selectedListingId]);

    async function runResearch(event) {
        event?.preventDefault();
        if (query.trim().length < 2) return;
        setResearching(true);
        setResearchError("");
        try {
            setResearch(await researchEtsyMarket(query.trim()));
        } catch (error) {
            setResearchError(friendlyError(error));
        } finally {
            setResearching(false);
        }
    }

    function addTag(rawTag) {
        const tag = String(rawTag || "").trim().replace(/\s+/g, " ");
        if (!tag) return;
        if (tag.length > 20) {
            notify({ type: "error", message: "Etsy tags can contain no more than 20 characters." });
            return;
        }
        if (draftTags.some((item) => item.toLowerCase() === tag.toLowerCase())) return;
        if (draftTags.length >= 13) {
            notify({ type: "error", message: "Etsy allows a maximum of 13 tags per listing." });
            return;
        }
        setDraftTags((current) => [...current, tag]);
        setCustomTag("");
    }

    async function saveTags() {
        if (!selectedListing || !canEdit) return;
        setSavingTags(true);
        try {
            const response = await updateListingTags(
                selectedListing.listing_id,
                draftTags
            );
            const savedTags = response.tags || draftTags;
            updateLocalListing(selectedListing.listing_id, savedTags);
            setDraftTags(savedTags);
            notify({
                type: "success",
                message: "Etsy tags updated. Performance tracking now uses a new baseline.",
            });
        } catch (error) {
            notify({ type: "error", message: friendlyError(error) });
        } finally {
            setSavingTags(false);
        }
    }

    const currentTagKeys = new Set(
        (selectedListing?.tags || []).map((tag) => String(tag).toLowerCase())
    );
    const draftTagKeys = new Set(draftTags.map((tag) => tag.toLowerCase()));
    const discountedListings = (research?.listings || []).filter(
        (listing) => !listing.isOwnShop && listing.hasDiscount
    );
    const basePrice = listingPriceNumber(selectedListing);
    const plannedPrice = basePrice * (1 - Number(discount || 0) / 100);

    return (
        <div className="page-stack page-enter market-page">
            <section className="page-intro market-intro">
                <div>
                    <span className="section-kicker">Etsy market intelligence</span>
                    <h2>Search signals & promotions</h2>
                    <p>Compare public Etsy search results, identify repeated competitor tags, and prepare an evidence-led update for your own listing.</p>
                </div>
                <div className="market-source-note"><ShieldCheck size={17} /><span>Public result sample—not private competitor traffic</span></div>
            </section>

            <form className="market-search-card" onSubmit={runResearch}>
                <div className="market-search-card__number">01</div>
                <div className="market-search-card__copy">
                    <span className="section-kicker">Start with a buyer phrase</span>
                    <h3>What would a shopper search?</h3>
                    <p>Try a specific phrase such as “arched floor mirror” instead of a broad word like “mirror”.</p>
                </div>
                <label className="market-search-input">
                    <Search size={20} />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="arched floor mirror" aria-label="Etsy search phrase" />
                    <button className="button button--primary" disabled={researching || query.trim().length < 2}>
                        {researching ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}
                        {researching ? "Researching…" : "Research Etsy"}
                    </button>
                </label>
                {researchError && <div className="market-inline-error"><AlertTriangle size={16} />{researchError}</div>}
            </form>

            {!research ? (
                <section className="market-empty-grid">
                    <article><Tags size={22} /><strong>Keyword overlap</strong><span>See which public tags repeat across relevant search results.</span></article>
                    <article><BadgePercent size={22} /><strong>Promotion signals</strong><span>Observe visible discounts and their typical percentage.</span></article>
                    <article><Lightbulb size={22} /><strong>Safe application</strong><span>Review every tag before changing your own Etsy listing.</span></article>
                </section>
            ) : (
                <>
                    <section className="market-summary" aria-label="Market research summary">
                        <article><span>Results sampled</span><strong>{research.sampleSize}</strong><small>for “{research.query}”</small></article>
                        <article><span>Repeated public tags</span><strong>{research.keywordSignals.filter((item) => item.listingCount > 1).length}</strong><small>possible relevance signals</small></article>
                        <article><span>Listings on sale</span><strong>{research.promotionSummary.discountedShare}%</strong><small>{research.promotionSummary.discountedCount} in this sample</small></article>
                        <article><span>Average visible discount</span><strong>{research.promotionSummary.averageDiscount || 0}%</strong><small>among discounted results</small></article>
                    </section>

                    <section className="market-workbench">
                        <article className="content-card keyword-signals">
                            <div className="section-heading">
                                <div><span className="section-kicker">Search vocabulary</span><h2>Competitor tag signals</h2></div>
                                <span className="research-timestamp">Sampled {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(research.sampledAt))}</span>
                            </div>
                            <p className="market-explainer">Frequency shows how many sampled listings publicly use a tag. It is not Etsy search volume.</p>
                            <div className="keyword-signal-list">
                                {research.keywordSignals.slice(0, 18).map((signal) => {
                                    const selected = draftTagKeys.has(signal.keyword.toLowerCase());
                                    const alreadyUsed = currentTagKeys.has(signal.keyword.toLowerCase());
                                    return (
                                        <div className={`keyword-signal ${selected ? "is-selected" : ""}`} key={signal.keyword}>
                                            <div><strong>{signal.keyword}</strong><span>{signal.listingCount} listings · best sampled position #{signal.bestRank}{alreadyUsed ? " · already on your listing" : ""}</span></div>
                                            <button type="button" disabled={!canEdit} onClick={() => selected ? setDraftTags((tags) => tags.filter((tag) => tag.toLowerCase() !== signal.keyword.toLowerCase())) : addTag(signal.keyword)} aria-label={`${selected ? "Remove" : "Add"} ${signal.keyword}`}>
                                                {selected ? <Check size={16} /> : <span>+</span>}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </article>

                        <aside className="content-card tag-editor">
                            <span className="section-kicker">Your listing</span>
                            <h2>Review before publishing</h2>
                            <label><span>Listing</span><select value={selectedListing?.listing_id || ""} onChange={(event) => setSelectedListingId(event.target.value)}>{listings.map((listing) => <option key={listing.listing_id} value={listing.listing_id}>{listing.title}</option>)}</select></label>
                            <div className="tag-editor__count"><span>Draft tags</span><strong>{draftTags.length} / 13</strong></div>
                            <div className="draft-tags">
                                {draftTags.map((tag) => <button type="button" key={tag} onClick={() => setDraftTags((tags) => tags.filter((item) => item !== tag))}>{tag}<X size={13} /></button>)}
                            </div>
                            <form className="custom-tag-form" onSubmit={(event) => { event.preventDefault(); addTag(customTag); }}>
                                <input value={customTag} onChange={(event) => setCustomTag(event.target.value)} maxLength={20} placeholder="Add an accurate tag" />
                                <button className="button button--small" disabled={!customTag.trim()}>Add</button>
                            </form>
                            <div className="market-caution"><AlertTriangle size={16} /><span>Only use phrases that accurately describe this product. Relevance matters more than copying every frequent tag.</span></div>
                            <button className="button button--primary tag-save" onClick={saveTags} disabled={!canEdit || savingTags || draftTags.length === 0}>
                                {savingTags ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />}
                                {savingTags ? "Updating Etsy…" : "Update Etsy tags"}
                            </button>
                        </aside>
                    </section>

                    <section className="content-card competitor-results">
                        <div className="section-heading"><div><span className="section-kicker">Ranked sample</span><h2>Listings Etsy returned</h2></div><small>Position is only for this API sample and can change.</small></div>
                        <div className="competitor-grid">
                            {research.listings.filter((listing) => !listing.isOwnShop).slice(0, 12).map((listing) => (
                                <a className="competitor-card" key={listing.listingId} href={listing.url} target="_blank" rel="noreferrer">
                                    <div className="competitor-card__image">{listing.image ? <img src={listing.image} alt="" /> : <Store size={22} />}{listing.hasDiscount && <span>-{listing.discountPercentage}%</span>}</div>
                                    <div className="competitor-card__body"><small>#{listing.rank} · {listing.shopName}</small><strong>{listing.title}</strong><div>{listing.hasDiscount ? <><b>{marketMoney(listing.discountedPrice, listing.currency)}</b><s>{marketMoney(listing.originalPrice, listing.currency)}</s></> : <b>{marketMoney(listing.price, listing.currency)}</b>}<ExternalLink size={14} /></div></div>
                                </a>
                            ))}
                        </div>
                    </section>

                    <section className="promotion-studio">
                        <div className="promotion-evidence">
                            <span className="section-kicker">Competitor promotion watch</span>
                            <h2>Visible sales in this search</h2>
                            <p>Use this as a market signal, not an instruction to match the lowest price.</p>
                            <div className="discount-list">
                                {discountedListings.slice(0, 6).map((listing) => <a href={listing.url} target="_blank" rel="noreferrer" key={listing.listingId}><span><strong>{listing.discountPercentage}% off</strong><small>{listing.shopName}</small></span><span>{marketMoney(listing.discountedPrice, listing.currency)} <ExternalLink size={13} /></span></a>)}
                                {!discountedListings.length && <div className="no-discounts">No visible discounts were returned in this sample.</div>}
                            </div>
                        </div>
                        <div className="promotion-planner">
                            <div className="promotion-planner__icon"><Percent size={23} /></div>
                            <span className="section-kicker">Promotion planner</span>
                            <h2>Prepare a listing-level sale</h2>
                            <p>Etsy does not provide a public API for creating sales, so Freya Auto prepares the decision and Etsy handles final confirmation.</p>
                            <label><span>Listing</span><select value={selectedListing?.listing_id || ""} onChange={(event) => setSelectedListingId(event.target.value)}>{listings.map((listing) => <option key={listing.listing_id} value={listing.listing_id}>{listing.title}</option>)}</select></label>
                            <div className="promotion-form-row">
                                <label><span>Discount</span><div className="discount-input"><input type="number" min="10" max="70" value={discount} onChange={(event) => setDiscount(event.target.value)} /><b>%</b></div></label>
                                <label><span>Starts</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
                                <label><span>Ends</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
                            </div>
                            <div className="promotion-price-preview"><span>Current Etsy price<strong>{formatPrice(selectedListing)}</strong></span><ArrowRight size={18} /><span>Planned sale price<strong>{marketMoney(plannedPrice, selectedListing?.price?.currency_code || "USD")}</strong></span></div>
                            <a className="button button--primary promotion-launch" href="https://www.etsy.com/your/shops/me/marketing" target="_blank" rel="noreferrer">Open Etsy Marketing <ExternalLink size={17} /></a>
                            <small className="promotion-footnote">In Etsy: Marketing → Sales and Discounts → Run a sale. Choose percentage off with no order minimum to select specific listings.</small>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}


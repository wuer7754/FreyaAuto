/**
 * 为何这样拆：表现、市场搜索、SEO 实验和图表共同解释商品数据，因此集中在分析模块。共享记录由 App 提供；搜索、标签编辑和图表选择保留在本模块。
 * 组件参数的 { ... } 是对象解构，从父组件传入的 props 中取出需要的值。
 * 回调函数让子模块请求父层更新数据，保持 React 单向数据流。
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

function ViewsTrendChart({ data }) {
    if (!data.length) {
        return <div className="views-chart__empty">Waiting for the first Etsy view snapshot.</div>;
    }

    const displayData =
        data.length === 1
            ? [data[0], { ...data[0], label: "Latest" }]
            : data;
    const width = 760;
    const height = 260;
    const padding = { top: 22, right: 34, bottom: 36, left: 18 };
    const values = displayData.map((item) => item.views);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = maximum - minimum || 1;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    // map 把数据值转换为 SVG 坐标；展开参数 ...values 将数组拆成多个数值参数。
    const points = displayData.map((item, index) => ({
        ...item,
        x:
            padding.left +
            (index / Math.max(1, displayData.length - 1)) * plotWidth,
        y:
            padding.top +
            (1 - (item.views - minimum) / range) * plotHeight,
    }));
    const line = points.map((point) => `${point.x},${point.y}`).join(" ");
    const area = `M ${points[0].x} ${padding.top + plotHeight} L ${points
        .map((point) => `${point.x} ${point.y}`)
        .join(" L ")} L ${points.at(-1).x} ${padding.top + plotHeight} Z`;

    return (
        <svg className="views-chart__svg" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <defs>
                <linearGradient id="views-area-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--wood)" stopOpacity=".28" />
                    <stop offset="100%" stopColor="var(--wood)" stopOpacity=".02" />
                </linearGradient>
            </defs>
            {[0, 0.33, 0.66, 1].map((position) => (
                <line
                    key={position}
                    x1={padding.left}
                    x2={padding.left + plotWidth}
                    y1={padding.top + plotHeight * position}
                    y2={padding.top + plotHeight * position}
                    className="views-chart__grid"
                />
            ))}
            <path d={area} fill="url(#views-area-fill)" />
            <polyline points={line} className="views-chart__line" />
            {points.map((point, index) => (
                <circle key={`${point.at}-${index}`} cx={point.x} cy={point.y} r="4" className="views-chart__point" />
            ))}
            <text x={padding.left} y={height - 10} className="views-chart__label">{points[0].label}</text>
            <text x={padding.left + plotWidth} y={height - 10} textAnchor="end" className="views-chart__label">{points.at(-1).label}</text>
            <text x={padding.left + plotWidth} y={padding.top - 7} textAnchor="end" className="views-chart__value">{maximum} views</text>
        </svg>
    );
}

function getTrackedGrowth(record) {
    if (
        record?.baselineViews === null ||
        record?.baselineViews === undefined ||
        record?.latestViews === null ||
        record?.latestViews === undefined
    ) {
        return 0;
    }
    return Math.max(0, Number(record.latestViews) - Number(record.baselineViews));
}

export function PerformancePage({ records, dashboard, refresh, refreshing }) {
    const [selectedId, setSelectedId] = useState(records[0]?.listingId || null);
    const experimentRecords = records.filter(
        (record) => record.source === "keyword-update" && record.experiment
    );
    const [experimentRanks, setExperimentRanks] = useState({});
    const [experimentRanksLoading, setExperimentRanksLoading] = useState(false);
    const [experimentRanksError, setExperimentRanksError] = useState("");

    useEffect(() => {
        // flatMap 先映射再展开一层：每个实验的多个词汇变成一个请求列表。
        const searches = experimentRecords.flatMap((record) =>
            (record.experiment?.queryTerms || []).map((term) => ({ record, term }))
        );
        if (!searches.length) {
            setExperimentRanks({});
            return undefined;
        }

        // 清理函数把此标志置为 true，防止旧请求在切换页面后回写状态；不会取消网络请求。
        let cancelled = false;
        setExperimentRanksLoading(true);
        setExperimentRanksError("");
        // Promise.all 并发等待所有查询；结果顺序与输入一致，用 index 对应实验词。
        Promise.all(searches.map(({ term }) => researchEtsyMarket(term, 50)))
            .then((results) => {
                if (cancelled) return;
                const nextRanks = {};
                searches.forEach(({ record, term }, index) => {
                    const match = (results[index]?.listings || []).find(
                        (listing) =>
                            String(listing.listingId) === String(record.listingId)
                    );
                    const key = String(record.listingId);
                    nextRanks[key] = [
                        ...(nextRanks[key] || []),
                        { term, rank: match?.rank || null },
                    ];
                });
                setExperimentRanks(nextRanks);
            })
            .catch((error) => {
                if (!cancelled) setExperimentRanksError(friendlyError(error));
            })
            .finally(() => {
                if (!cancelled) setExperimentRanksLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [
        experimentRecords
            .map(
                (record) =>
                    `${record.listingId}:${record.experiment?.queryTerms?.join("|")}`
            )
            .join(";"),
    ]);

    const selected =
        records.find(
            (record) => String(record.listingId) === String(selectedId)
        ) || records[0];
    // reduce 从初始值累加；排序先用 [...records] 复制，避免 sort 修改 props 原数组。
    const totalGrowth = records.reduce(
        (sum, record) => sum + getTrackedGrowth(record),
        0
    );
    const strongest = [...records].sort(
        (a, b) => getTrackedGrowth(b) - getTrackedGrowth(a)
    )[0];
    const totalBaseline = records.reduce(
        (sum, record) => sum + (Number(record.baselineViews) || 0),
        0
    );
    const totalCurrent = records.reduce(
        (sum, record) => sum + (Number(record.latestViews) || 0),
        0
    );
    const listingsMoving = records.filter((record) => getTrackedGrowth(record) > 0).length;
    // Each daily description run shares one runId. Sorting creates a copy first,
    // then the newest run becomes the visual “today's three” group.
    const newestDailyRecord = [...records]
        .filter((record) => record.source === "daily-batch-rotation" && record.runId)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
    const dailyBatchRecords = newestDailyRecord
        ? records.filter((record) => record.runId === newestDailyRecord.runId)
        : [];

    if (!records.length) {
        return (
            <div className="page-stack page-enter">
                <section className="page-intro">
                    <div>
                        <span className="section-kicker">Post-update analytics</span>
                        <h2>Listing performance</h2>
                    <p>Track how Etsy views change after a listing update or SEO test.</p>
                    </div>
                </section>
                <section className="content-card">
                    <EmptyState
                        icon={ChartNoAxesCombined}
                        title="No listings are being tracked"
                        body="Update a listing through Rewrite studio. Its current Etsy view count will become the baseline automatically."
                    />
                </section>
            </div>
        );
    }

    const growth = getTrackedGrowth(selected);
    const chartData = (selected.snapshots || []).map((snapshot) => ({
        ...snapshot,
        label: new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
        }).format(new Date(snapshot.at)),
    }));

    return (
        <div className="page-stack page-enter">
            <section className="page-intro">
                <div>
                    <span className="section-kicker">Post-update analytics</span>
                    <h2>Listing performance</h2>
                    <p>Etsy provides cumulative views. Freya Auto saves a baseline at update time and measures every new view from there.</p>
                </div>
                <button className="button button--secondary" onClick={refresh} disabled={refreshing}>
                    <RefreshCw size={17} className={refreshing ? "spin" : ""} /> Reload analytics
                </button>
            </section>

            {dashboard && <ShopDashboardPanel dashboard={dashboard} />}

            <section className="portfolio-test" aria-labelledby="portfolio-test-title">
                <div className="portfolio-test__head">
                    <div>
                        <span className="section-kicker">Comprehensive test</span>
                        <h3 id="portfolio-test-title">All updated listings</h3>
                        <p>The combined view movement across the full {records.length}-listing collection since each listing's latest update.</p>
                    </div>
                    <span className="portfolio-test__count"><strong>{records.length}</strong> listings</span>
                </div>
                <div className="portfolio-test__metrics">
                    <div><span>Combined baseline</span><strong>{totalBaseline.toLocaleString()}</strong><small>Views at update time</small></div>
                    <div><span>Current views</span><strong>{totalCurrent.toLocaleString()}</strong><small>Latest cumulative total</small></div>
                    <div className="is-accent"><span>New views</span><strong>+{totalGrowth.toLocaleString()}</strong><small>Across the collection</small></div>
                    <div><span>Listings moving</span><strong>{listingsMoving}/{records.length}</strong><small>Recorded at least one new view</small></div>
                </div>
                <div className="portfolio-test__strongest">
                    <span>Strongest movement</span>
                    <strong>+{strongest ? getTrackedGrowth(strongest) : 0}</strong>
                    <p>{strongest?.title || "Waiting for data"}</p>
                </div>
            </section>

            <DailyDescriptionBatchPanel records={dailyBatchRecords} />

            <section className="experiment-section" aria-labelledby="experiment-section-title">
                <div className="section-heading-row">
                    <div><span className="section-kicker">Controlled tests</span><h3 id="experiment-section-title">Single-listing experiments</h3><p>Small, time-boxed changes tracked separately from the full collection.</p></div>
                    <strong>{experimentRecords.length} active</strong>
                </div>
                <div className="experiment-grid">
                    {experimentRecords.map((record) => (
                        <SeoTestModule
                            key={record.listingId}
                            record={record}
                            ranks={experimentRanks[String(record.listingId)] || []}
                            ranksLoading={experimentRanksLoading}
                            ranksError={experimentRanksError}
                        />
                    ))}
                    {!experimentRecords.length && (
                        <div className="experiment-empty"><Sparkles size={18} /><span>No single-listing experiments are active.</span></div>
                    )}
                </div>
            </section>

            <details className="performance-drilldown">
                <summary><span><span className="section-kicker">Detailed explorer</span><strong>Open all {records.length} listing trends</strong></span><ChevronRight size={18} /></summary>
                <section className="performance-layout">
                    <aside className="tracker-list" aria-label="Tracked listings">
                        <div className="tracker-list__head"><span className="section-kicker">Tracked collection</span><strong>{records.length} active</strong></div>
                        {records.map((record) => {
                            const recordGrowth = getTrackedGrowth(record);
                            return (
                                <button
                                    key={record.listingId}
                                    className={`tracker-item ${String(selected?.listingId) === String(record.listingId) ? "is-active" : ""}`}
                                    onClick={() => setSelectedId(record.listingId)}
                                >
                                    <span className="tracker-item__icon"><Eye size={17} /></span>
                                    <span className="tracker-item__copy"><strong>{record.title}</strong><small>Listing #{record.listingId}</small></span>
                                    <span className="tracker-item__growth">+{recordGrowth}</span>
                                </button>
                            );
                        })}
                    </aside>

                    <article className="performance-detail">
                        <div className="performance-detail__head">
                            <div><span className="section-kicker">View growth</span><h3>{selected.title}</h3><small>Updated {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(selected.updatedAt))}</small></div>
                            <div className="growth-total"><span>Since update</span><strong>+{growth}</strong></div>
                        </div>

                        <div className="view-stat-row">
                            <div><span>Baseline</span><strong>{selected.baselineViews ?? "—"}</strong></div>
                            <ArrowRight size={17} />
                            <div><span>Current views</span><strong>{selected.latestViews}</strong></div>
                            <div><span>Last checked</span><strong>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(selected.lastCheckedAt))}</strong></div>
                        </div>

                        <div className="views-chart" role="img" aria-label={`Etsy view trend for ${selected.title}`}>
                            <ViewsTrendChart data={chartData} />
                        </div>

                        <div className="analytics-note"><ShieldCheck size={17} /><span>This compares cumulative Etsy views before and after the latest listing update. It shows movement, not proof that one edit caused it.</span></div>
                    </article>
                </section>
            </details>
        </div>
    );
}

function DailyDescriptionBatchPanel({ records }) {
    if (!records.length) {
        return (
            <section className="content-card">
                <div className="section-heading">
                    <div>
                        <span className="section-kicker">Daily description batch</span>
                        <h2>Today’s three-listing view growth</h2>
                        <p>Enable “Daily · next 3 listings” in Weekly rotation. Its first completed batch will appear here.</p>
                    </div>
                </div>
            </section>
        );
    }

    const totalGrowth = records.reduce(
        (sum, record) => sum + getTrackedGrowth(record),
        0
    );
    return (
        <section className="content-card" aria-labelledby="daily-batch-title">
            <div className="section-heading">
                <div>
                    <span className="section-kicker">Daily description batch</span>
                    <h2 id="daily-batch-title">Today’s three-listing view growth</h2>
                    <p>These descriptions were updated together by the newest daily rotation run.</p>
                </div>
                <strong>+{totalGrowth.toLocaleString()} new views</strong>
            </div>
            <div className="portfolio-test__metrics">
                {records.map((record) => (
                    <div key={record.listingId}>
                        <span>{record.title}</span>
                        <strong>+{getTrackedGrowth(record)}</strong>
                        <small>{record.baselineViews ?? "—"} → {record.latestViews ?? "—"} views</small>
                    </div>
                ))}
            </div>
        </section>
    );
}

function ShopDashboardPanel({ dashboard }) {
    const currency = dashboard.shop?.currency || "USD";
    const money = (value) =>
        new Intl.NumberFormat("en-US", {
            style: "currency",
            currency,
            maximumFractionDigits: 2,
        }).format(Number(value) || 0);
    const favoriteRate = dashboard.catalog?.lifetimeFavoriteRate;

    return (
        <section className="shop-pulse" aria-labelledby="shop-pulse-title">
            <div className="shop-pulse__head">
                <div className="shop-pulse__identity">
                    <div className="shop-pulse__mark"><Store size={20} /></div>
                    <div>
                        <span className="section-kicker">Etsy shop data · last {dashboard.periodDays} days</span>
                        <h3 id="shop-pulse-title">{dashboard.shop?.title}</h3>
                        <p>{dashboard.shop?.name} · Updated {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(dashboard.generatedAt))}</p>
                    </div>
                </div>
                <div className="shop-pulse__rating"><strong>{dashboard.shop?.reviewAverage?.toFixed(2) || "—"}</strong><span>{dashboard.shop?.reviewCount || 0} reviews</span></div>
            </div>

            <div className="shop-pulse__commerce">
                <div><span>Orders</span><strong>{dashboard.commerce?.orders || 0}</strong><small>Completed receipts</small></div>
                <div><span>Units sold</span><strong>{dashboard.commerce?.unitsSold || 0}</strong><small>Across all listings</small></div>
                <div className="is-revenue"><span>Revenue</span><strong>{money(dashboard.commerce?.revenue)}</strong><small>Excludes tax and shipping</small></div>
                <div><span>Average order</span><strong>{money(dashboard.commerce?.averageOrderValue)}</strong><small>Merchandise revenue / orders</small></div>
            </div>

            <div className="shop-pulse__footprint">
                <div><span>Active listings</span><strong>{dashboard.shop?.activeListings || 0}</strong></div>
                <div><span>Shop followers</span><strong>{dashboard.shop?.followers || 0}</strong></div>
                <div><span>Active-listing views</span><strong>{Number(dashboard.catalog?.cumulativeViews || 0).toLocaleString()}</strong></div>
                <div><span>Listing favorites</span><strong>{Number(dashboard.catalog?.cumulativeFavorites || 0).toLocaleString()}</strong></div>
                <div><span>Lifetime favorite rate</span><strong>{favoriteRate === null || favoriteRate === undefined ? "—" : `${(favoriteRate * 100).toFixed(1)}%`}</strong></div>
            </div>

            <div className="shop-pulse__data-note">
                <ShieldCheck size={16} />
                <span>Orders and revenue are read directly from Etsy. Search impressions, traffic sources, and private search terms still require an Etsy Stats snapshot because Open API does not expose them.</span>
                <a href="https://www.etsy.com/your/shops/me/stats" target="_blank" rel="noreferrer">Open Etsy Stats <ExternalLink size={12} /></a>
            </div>
        </section>
    );
}

function SeoTestModule({ record, ranks, ranksLoading, ranksError }) {
    const startedAt = new Date(record.updatedAt);
    const endsAt = new Date(record.experiment.endsAt);
    const now = new Date();
    const duration = Math.max(endsAt - startedAt, 1);
    const progress = Math.min(100, Math.max(0, ((now - startedAt) / duration) * 100));
    const daysLeft = Math.max(0, Math.ceil((endsAt - now) / (24 * 60 * 60 * 1000)));
    const viewGrowth = getTrackedGrowth(record);
    const favoriteGrowth =
        record.baselineFavorites === null || record.baselineFavorites === undefined ||
        record.latestFavorites === null || record.latestFavorites === undefined
            ? null
            : Number(record.latestFavorites) - Number(record.baselineFavorites);
    const visibleTerms = ranks.filter((item) => item.rank).length;
    const complete = now >= endsAt;

    return (
        <article className="seo-test" aria-labelledby={`seo-test-title-${record.listingId}`}>
            <div className="seo-test__rail">
                <div className="seo-test__mark"><Sparkles size={18} /></div>
                <div>
                    <span className="section-kicker">Test module · 7 days</span>
                    <h3 id={`seo-test-title-${record.listingId}`}>Casablanca SEO test</h3>
                    <p>One listing changed. Three similar Casablanca listings stay untouched as a comparison.</p>
                </div>
                <span className={`seo-test__status ${complete ? "is-complete" : ""}`}>
                    <span />{complete ? "Complete" : `${daysLeft} days left`}
                </span>
            </div>

            <div className="seo-test__body">
                <div className="seo-test__listing">
                    <span>Listing #{record.listingId}</span>
                    <strong>{record.title}</strong>
                    <div className="seo-test__changes"><span>Title updated</span><span>13 tags updated</span></div>
                    <a href={`https://www.etsy.com/listing/${record.listingId}`} target="_blank" rel="noreferrer">
                        Open Etsy <ExternalLink size={13} />
                    </a>
                </div>

                <div className="seo-test__metrics" aria-label="SEO test metrics">
                    <div><span>Views</span><strong>+{viewGrowth}</strong><small>{record.baselineViews ?? "—"} → {record.latestViews ?? "—"}</small></div>
                    <div><span>Favorites</span><strong>{favoriteGrowth === null ? "—" : `${favoriteGrowth >= 0 ? "+" : ""}${favoriteGrowth}`}</strong><small>{record.baselineFavorites ?? "—"} → {record.latestFavorites ?? "—"}</small></div>
                    <div><span>Search samples</span><strong>{ranksLoading ? "…" : `${visibleTerms}/${record.experiment.queryTerms.length}`}</strong><small>Visible in public top 50</small></div>
                    <div><span>Test window</span><strong>7 days</strong><small>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(startedAt)} – {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(endsAt)}</small></div>
                </div>

                <div className="seo-test__progress" aria-label={`${Math.round(progress)} percent of test elapsed`}>
                    <span style={{ width: `${progress}%` }} />
                </div>

                <div className="seo-test__queries">
                    {(ranks.length ? ranks : record.experiment.queryTerms.map((term) => ({ term, rank: null }))).map((item) => (
                        <div key={item.term}>
                            <Search size={14} />
                            <span>{item.term}</span>
                            <strong>{ranksLoading ? "Checking…" : item.rank ? `#${item.rank}` : "Not in top 50"}</strong>
                        </div>
                    ))}
                </div>
                {ranksError && <p className="seo-test__error"><AlertTriangle size={14} />{ranksError}</p>}
                <p className="seo-test__note">Public search position is a consistent sample, not the personalized rank every shopper sees. Orders and Etsy Search conversion still come from Etsy Stats.</p>
            </div>
        </article>
    );
}

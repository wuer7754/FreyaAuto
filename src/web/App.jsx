import { useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    ArrowRight,
    CalendarClock,
    ChartNoAxesCombined,
    Check,
    CheckCircle2,
    ChevronRight,
    Clock3,
    ExternalLink,
    Eye,
    History,
    LayoutDashboard,
    LoaderCircle,
    Layers3,
    LockKeyhole,
    LogOut,
    Menu,
    Moon,
    PackageSearch,
    RefreshCw,
    Search,
    Save,
    Settings,
    ShieldCheck,
    Sparkles,
    Store,
    Sun,
    UserRound,
    WandSparkles,
    X,
} from "lucide-react";
import {
    applyDescription,
    getAuthSession,
    getDescriptionRotation,
    getEtsyAccount,
    getListings,
    getPerformance,
    importLegacyPerformance,
    loginTeamMember,
    logoutTeamMember,
    previewRewrite,
    saveDescriptionRotation,
} from "./api";

const NAV_ITEMS = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "listings", label: "Listings", icon: PackageSearch },
    { id: "studio", label: "Rewrite studio", icon: WandSparkles },
    { id: "rotation", label: "Weekly rotation", icon: CalendarClock },
    { id: "performance", label: "Performance", icon: ChartNoAxesCombined },
    { id: "history", label: "Update history", icon: History },
    { id: "settings", label: "Settings", icon: Settings },
];

function getInitialTheme() {
    const saved = localStorage.getItem("freya-theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function readHistory() {
    try {
        return JSON.parse(localStorage.getItem("freya-update-history") || "[]");
    } catch {
        return [];
    }
}

function readPerformanceTracking() {
    try {
        const value = JSON.parse(
            localStorage.getItem("freya-performance-tracking") || "[]"
        );
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function savePerformanceTracking(records) {
    localStorage.setItem("freya-performance-tracking", JSON.stringify(records));
}

function getViewCount(listing) {
    const views = Number(listing?.views);
    return Number.isFinite(views) ? views : null;
}

function syncPerformanceTracking(records, listings) {
    const now = new Date().toISOString();

    return records.map((record) => {
        const listing = listings.find(
            (item) => String(item.listing_id) === String(record.listingId)
        );
        const views = getViewCount(listing);

        if (!listing || views === null) return record;

        const snapshots = Array.isArray(record.snapshots)
            ? [...record.snapshots]
            : [];
        const lastSnapshot = snapshots.at(-1);
        const isNewDay = lastSnapshot
            ? lastSnapshot.at.slice(0, 10) !== now.slice(0, 10)
            : true;

        if (!lastSnapshot || lastSnapshot.views !== views || isNewDay) {
            snapshots.push({ at: now, views });
        }

        return {
            ...record,
            title: listing.title || record.title,
            latestViews: views,
            lastCheckedAt: now,
            snapshots: snapshots.slice(-60),
        };
    });
}

function getListingImage(listing) {
    const image = listing?.images?.[0];
    return (
        image?.url_570xN ||
        image?.url_fullxfull ||
        image?.url_170x135 ||
        listing?.image_url ||
        ""
    );
}

function formatPrice(listing) {
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

function friendlyError(error) {
    const message = error?.message || "Something went wrong.";
    if (message.includes("Country, region, or territory not supported")) {
        return "OpenAI rejected the request because the server's network region is not supported.";
    }
    if (message.includes("Missing shop ID")) {
        return "Your Etsy shop details are missing. Reconnect Etsy, then refresh the workspace.";
    }
    return message;
}

function BrandMark() {
    return (
        <div className="brand-mark" aria-hidden="true">
            <span>F</span>
        </div>
    );
}

function ProductThumb({ listing, large = false }) {
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

function StatusPill({ connected }) {
    return (
        <span className={`status-pill ${connected ? "is-live" : "is-offline"}`}>
            <span className="status-dot" />
            {connected ? "Etsy connected" : "Needs attention"}
        </span>
    );
}

function EmptyState({ icon: Icon, title, body, action }) {
    return (
        <div className="empty-state">
            <div className="empty-state__icon"><Icon size={22} /></div>
            <h3>{title}</h3>
            <p>{body}</p>
            {action}
        </div>
    );
}

function LoginPage({ theme, toggleTheme, onAuthenticated }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    async function submit(event) {
        event.preventDefault();
        setSubmitting(true);
        setError("");
        try {
            const response = await loginTeamMember(username, password);
            onAuthenticated(response.user);
        } catch (loginError) {
            setError(friendlyError(loginError));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="login-shell">
            <button
                className="icon-button login-theme"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
                {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <section className="login-card">
                <div className="login-brand"><BrandMark /><div><strong>Freya Auto</strong><span>Private team workspace</span></div></div>
                <div className="login-heading">
                    <span className="section-kicker">Freya Furniture</span>
                    <h1>Welcome back</h1>
                    <p>Sign in with your private team account to manage the Freya Etsy workspace.</p>
                </div>
                <form className="login-form" onSubmit={submit}>
                    <label><span>Username</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus /></label>
                    <label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
                    {error && <div className="login-error" role="alert"><AlertTriangle size={16} /><span>{error}</span></div>}
                    <button className="button button--primary login-submit" disabled={submitting}>
                        {submitting ? <LoaderCircle size={18} className="spin" /> : <LockKeyhole size={18} />}
                        {submitting ? "Signing in…" : "Sign in securely"}
                    </button>
                </form>
                <div className="login-private"><ShieldCheck size={17} /><span>Only invited Freya team members can access this workspace.</span></div>
            </section>
        </main>
    );
}

export default function App() {
    const [theme, setTheme] = useState(getInitialTheme);
    const [authStatus, setAuthStatus] = useState("checking");
    const [teamUser, setTeamUser] = useState(null);
    const [page, setPage] = useState("overview");
    const [menuOpen, setMenuOpen] = useState(false);
    const [account, setAccount] = useState(null);
    const [connection, setConnection] = useState("checking");
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedListing, setSelectedListing] = useState(null);
    const [preview, setPreview] = useState(null);
    const [draftDescription, setDraftDescription] = useState("");
    const [generating, setGenerating] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [toast, setToast] = useState(null);
    const [history, setHistory] = useState([]);
    const [performanceTracking, setPerformanceTracking] = useState([]);

    const filteredListings = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return listings;
        return listings.filter((listing) =>
            `${listing.title || ""} ${listing.listing_id || ""}`
                .toLowerCase()
                .includes(term)
        );
    }, [listings, search]);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("freya-theme", theme);
    }, [theme]);

    useEffect(() => {
        getAuthSession()
            .then((response) => {
                setTeamUser(response.user || null);
                setAuthStatus(response.authenticated ? "authenticated" : "signed-out");
            })
            .catch(() => setAuthStatus("signed-out"));
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const etsyStatus = params.get("etsy");
        if (!etsyStatus) return;

        if (etsyStatus === "connected") {
            setToast({
                type: "success",
                message: "Etsy authorization completed. Your shop is ready.",
            });
        } else if (etsyStatus === "existing-connection") {
            setToast({
                type: "error",
                message: "That authorization link expired, but your existing Etsy connection is still available.",
            });
        } else {
            setToast({
                type: "error",
                message: "Etsy authorization was not completed. Start again from Workspace settings if no shop is connected.",
            });
        }
        params.delete("etsy");
        const query = params.toString();
        window.history.replaceState(
            {},
            "",
            `${window.location.pathname}${query ? `?${query}` : ""}`
        );
    }, []);

    useEffect(() => {
        if (authStatus === "authenticated") loadWorkspace();
    }, [authStatus]);

    useEffect(() => {
        if (!toast) return undefined;
        const timer = window.setTimeout(() => setToast(null), 4500);
        return () => window.clearTimeout(timer);
    }, [toast]);

    async function loadWorkspace({ quiet = false } = {}) {
        if (quiet) setRefreshing(true);
        else setLoading(true);

        try {
            const user = await getEtsyAccount();
            setAccount(user);
            setConnection("connected");
        } catch (error) {
            setConnection("disconnected");
            setToast({ type: "error", message: friendlyError(error) });
            setLoading(false);
            setRefreshing(false);
            return;
        }

        try {
            const response = await getListings();
            const nextListings = Array.isArray(response)
                ? response
                : response?.results || [];
            setListings(nextListings);
            setSelectedListing((current) => {
                if (!current) return nextListings[0] || null;
                return (
                    nextListings.find(
                        (item) => item.listing_id === current.listing_id
                    ) || current
                );
            });

            const canImportLegacy =
                teamUser?.role === "admin" || teamUser?.role === "editor";
            const migrationKey = "freya-server-tracking-migrated-v1";
            if (canImportLegacy && !localStorage.getItem(migrationKey)) {
                const legacyHistory = readHistory();
                const legacyTracking = readPerformanceTracking();
                if (legacyHistory.length || legacyTracking.length) {
                    await importLegacyPerformance(
                        legacyHistory,
                        legacyTracking
                    );
                }
                localStorage.setItem(migrationKey, "true");
            }

            const performance = await getPerformance();
            setHistory(performance.updates || []);
            setPerformanceTracking(performance.records || []);
        } catch (error) {
            setToast({
                type: "error",
                message: `Etsy is authorized, but listings could not be loaded: ${friendlyError(error)}`,
            });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    function navigate(nextPage) {
        setPage(nextPage);
        setMenuOpen(false);
    }

    function openStudio(listing) {
        setSelectedListing(listing);
        setPreview(null);
        setDraftDescription("");
        navigate("studio");
    }

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

    async function signOut() {
        try {
            await logoutTeamMember();
        } finally {
            setTeamUser(null);
            setAuthStatus("signed-out");
            setAccount(null);
            setListings([]);
        }
    }

    const connected = connection === "connected";
    const pageTitle = NAV_ITEMS.find((item) => item.id === page)?.label || "Overview";
    const canEdit = teamUser?.role === "editor" || teamUser?.role === "admin";
    const isAdmin = teamUser?.role === "admin";

    if (authStatus === "checking") {
        return <div className="auth-loading"><LoaderCircle size={26} className="spin" /><span>Opening the private workspace…</span></div>;
    }

    if (authStatus !== "authenticated") {
        return (
            <LoginPage
                theme={theme}
                toggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
                onAuthenticated={(user) => {
                    setTeamUser(user);
                    setAuthStatus("authenticated");
                }}
            />
        );
    }

    return (
        <div className="app-shell">
            <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
                <div className="sidebar__top">
                    <div className="brand-lockup">
                        <BrandMark />
                        <div>
                            <strong>Freya Auto</strong>
                            <span>Listing atelier</span>
                        </div>
                    </div>
                    <button
                        className="icon-button sidebar__close"
                        onClick={() => setMenuOpen(false)}
                        aria-label="Close navigation"
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className="nav-list" aria-label="Main navigation">
                    <span className="nav-eyebrow">Workspace</span>
                    {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            className={`nav-item ${page === id ? "is-active" : ""}`}
                            onClick={() => navigate(id)}
                        >
                            <Icon size={19} strokeWidth={1.8} />
                            <span>{label}</span>
                            {id === "listings" && listings.length > 0 && (
                                <span className="nav-count">{listings.length}</span>
                            )}
                        </button>
                    ))}
                </nav>

                <div className="sidebar__foot">
                    <div className="connection-card">
                        <div className="connection-card__icon"><Store size={18} /></div>
                        <div>
                            <span>Etsy shop</span>
                            <strong>{connected ? "Connected" : "Not connected"}</strong>
                        </div>
                        <span className={`connection-light ${connected ? "is-live" : ""}`} />
                    </div>
                    <p>Crafted for Freya Furniture</p>
                </div>
            </aside>

            {menuOpen && (
                <button
                    className="scrim"
                    aria-label="Close navigation"
                    onClick={() => setMenuOpen(false)}
                />
            )}

            <main className="main-panel">
                <header className="topbar">
                    <div className="topbar__title">
                        <button
                            className="icon-button menu-button"
                            onClick={() => setMenuOpen(true)}
                            aria-label="Open navigation"
                        >
                            <Menu size={21} />
                        </button>
                        <div>
                            <span>Freya Furniture</span>
                            <h1>{pageTitle}</h1>
                        </div>
                    </div>
                    <div className="topbar__actions">
                        <StatusPill connected={connected} />
                        <div className="team-user" title={`Signed in as ${teamUser.displayName}`}>
                            <UserRound size={16} />
                            <span><strong>{teamUser.displayName}</strong><small>{teamUser.role}</small></span>
                        </div>
                        <button
                            className="icon-button"
                            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
                        >
                            {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
                        </button>
                        <button className="icon-button" onClick={signOut} aria-label="Sign out">
                            <LogOut size={18} />
                        </button>
                    </div>
                </header>

                <div className="page-content">
                    {page === "overview" && (
                        <OverviewPage
                            loading={loading}
                            connected={connected}
                            listings={listings}
                            history={history}
                            refresh={() => loadWorkspace({ quiet: true })}
                            refreshing={refreshing}
                            openStudio={openStudio}
                            navigate={navigate}
                        />
                    )}
                    {page === "listings" && (
                        <ListingsPage
                            loading={loading}
                            listings={filteredListings}
                            total={listings.length}
                            search={search}
                            setSearch={setSearch}
                            refresh={() => loadWorkspace({ quiet: true })}
                            refreshing={refreshing}
                            openStudio={openStudio}
                        />
                    )}
                    {page === "studio" && (
                        <StudioPage
                            listings={listings}
                            selected={selectedListing}
                            setSelected={(listing) => {
                                setSelectedListing(listing);
                                setPreview(null);
                                setDraftDescription("");
                            }}
                            preview={preview}
                            draft={draftDescription}
                            setDraft={setDraftDescription}
                            generating={generating}
                            generate={generatePreview}
                            requestUpdate={() => setConfirmOpen(true)}
                            canEdit={canEdit}
                        />
                    )}
                    {page === "history" && <HistoryPage history={history} />}
                    {page === "performance" && (
                        <PerformancePage
                            records={performanceTracking}
                            refresh={() => loadWorkspace({ quiet: true })}
                            refreshing={refreshing}
                        />
                    )}
                    {page === "rotation" && (
                        <WeeklyRotationPage
                            listings={listings}
                            notify={setToast}
                            canManage={isAdmin}
                        />
                    )}
                    {page === "settings" && (
                        <SettingsPage
                            account={account}
                            connected={connected}
                            refresh={() => loadWorkspace({ quiet: true })}
                            refreshing={refreshing}
                            isAdmin={isAdmin}
                        />
                    )}
                </div>
            </main>

            {confirmOpen && (
                <ConfirmDialog
                    listing={selectedListing}
                    updating={updating}
                    cancel={() => setConfirmOpen(false)}
                    confirm={confirmUpdate}
                />
            )}

            {toast && (
                <div className={`toast toast--${toast.type}`} role="status">
                    {toast.type === "success" ? (
                        <CheckCircle2 size={20} />
                    ) : (
                        <AlertTriangle size={20} />
                    )}
                    <span>{toast.message}</span>
                    <button onClick={() => setToast(null)} aria-label="Dismiss message">
                        <X size={16} />
                    </button>
                </div>
            )}
        </div>
    );
}

function OverviewPage({
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

function ListingsPage({ loading, listings, total, search, setSearch, refresh, refreshing, openStudio }) {
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

function StudioPage({ listings, selected, setSelected, preview, draft, setDraft, generating, generate, requestUpdate, canEdit }) {
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

const ROTATION_WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

function WeeklyRotationPage({ listings, notify, canManage }) {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [listingSearch, setListingSearch] = useState("");
    const [previewTemplateId, setPreviewTemplateId] = useState(null);

    useEffect(() => {
        loadConfig();
    }, []);

    async function loadConfig() {
        setLoading(true);
        try {
            setConfig(await getDescriptionRotation());
        } catch (error) {
            notify({ type: "error", message: friendlyError(error) });
        } finally {
            setLoading(false);
        }
    }

    function updateField(field, value) {
        setConfig((current) => ({ ...current, [field]: value }));
    }

    function toggleTemplate(templateId) {
        const selected = config.templateIds.includes(templateId);
        updateField(
            "templateIds",
            selected
                ? config.templateIds.filter((id) => id !== templateId)
                : [...config.templateIds, templateId]
        );
    }

    function toggleListing(listingId) {
        const numericId = Number(listingId);
        const selected = config.listingIds.some(
            (id) => Number(id) === numericId
        );
        updateField(
            "listingIds",
            selected
                ? config.listingIds.filter((id) => Number(id) !== numericId)
                : [...config.listingIds, numericId]
        );
    }

    async function saveSettings() {
        if (!canManage) return;
        setSaving(true);
        try {
            const response = await saveDescriptionRotation({
                enabled: config.enabled,
                listingIds: config.listingIds,
                templateIds: config.templateIds,
                weekday: config.weekday,
                hour: config.hour,
                minute: config.minute,
                timezone: config.timezone,
            });
            setConfig(response.config);
            notify({
                type: "success",
                message: config.enabled
                    ? "Weekly description rotation is active."
                    : "Weekly rotation settings were saved.",
            });
        } catch (error) {
            notify({ type: "error", message: friendlyError(error) });
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="page-stack page-enter">
                <section className="page-intro"><div><span className="section-kicker">Description automation</span><h2>Weekly rotation</h2><p>Loading templates and schedule settings…</p></div></section>
                <div className="skeleton-table"><i /><i /><i /></div>
            </div>
        );
    }

    if (!config) {
        return (
            <div className="page-enter">
                <EmptyState
                    icon={CalendarClock}
                    title="Rotation settings are unavailable"
                    body="Restart the Freya Auto server, then try loading the schedule again."
                    action={<button className="button button--secondary" onClick={loadConfig}>Try again</button>}
                />
            </div>
        );
    }

    const normalizedSearch = listingSearch.trim().toLowerCase();
    const filteredListings = listings.filter((listing) =>
        `${listing.title} ${listing.listing_id}`
            .toLowerCase()
            .includes(normalizedSearch)
    );
    const nextTemplate = config.templates[
        config.nextTemplateIndex % Math.max(config.templateIds.length, 1)
    ];
    const actualNextTemplate =
        config.templates.find(
            (template) =>
                template.id ===
                config.templateIds[
                    config.nextTemplateIndex %
                        Math.max(config.templateIds.length, 1)
                ]
        ) || nextTemplate;
    const previewTemplate = config.templates.find(
        (template) => template.id === previewTemplateId
    );

    return (
        <>
        <div className="page-stack page-enter">
            <section className="page-intro">
                <div>
                    <span className="section-kicker">Description automation</span>
                    <h2>Weekly rotation</h2>
                    <p>Cycle selected listings through different Freya description formats on a predictable weekly schedule.</p>
                </div>
                <span className={`rotation-state ${config.enabled ? "is-active" : ""}`}><span />{config.enabled ? "Automation active" : "Automation paused"}</span>
            </section>

            {!canManage && <div className="safety-note"><ShieldCheck size={19} /><div><strong>Administrator access required</strong><span>You can review this schedule, but only an administrator can change or activate it.</span></div></div>}

            <section className="rotation-master-card">
                <div className="rotation-master-card__icon"><CalendarClock size={23} /></div>
                <div><span className="section-kicker">Master control</span><h3>Run this rotation automatically</h3><p>When enabled, Freya Auto will generate and publish a new description for every selected listing at the scheduled time.</p></div>
                <label className="switch-control">
                    <input type="checkbox" checked={config.enabled} disabled={!canManage} onChange={(event) => updateField("enabled", event.target.checked)} />
                    <span aria-hidden="true" />
                    <strong>{config.enabled ? "On" : "Off"}</strong>
                </label>
            </section>

            <div className="rotation-layout">
                <div className="rotation-form-stack">
                    <section className="rotation-panel">
                        <div className="rotation-panel__head"><div><span className="rotation-step">01</span><div><h3>Choose the weekly rhythm</h3><p>The server checks the schedule every minute.</p></div></div></div>
                        <div className="schedule-grid">
                            <label><span>Day</span><select disabled={!canManage} value={config.weekday} onChange={(event) => updateField("weekday", Number(event.target.value))}>{ROTATION_WEEKDAYS.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label>
                            <label><span>Time</span><input disabled={!canManage} type="time" value={`${String(config.hour).padStart(2, "0")}:${String(config.minute).padStart(2, "0")}`} onChange={(event) => { const [hour, minute] = event.target.value.split(":").map(Number); setConfig((current) => ({ ...current, hour, minute })); }} /></label>
                            <label><span>Timezone</span><select disabled={!canManage} value={config.timezone} onChange={(event) => updateField("timezone", event.target.value)}><option value="America/New_York">New York</option><option value="America/Chicago">Chicago</option><option value="America/Denver">Denver</option><option value="America/Los_Angeles">Los Angeles</option><option value="Asia/Shanghai">Shanghai</option><option value="UTC">UTC</option></select></label>
                        </div>
                    </section>

                    <section className="rotation-panel">
                        <div className="rotation-panel__head"><div><span className="rotation-step">02</span><div><h3>Select description templates</h3><p>Choose at least two. They will run in the order shown.</p></div></div><strong>{config.templateIds.length} selected</strong></div>
                        <div className="template-choice-grid">
                            {config.templates.map((template, index) => {
                                const selected = config.templateIds.includes(template.id);
                                return (
                                    <article key={template.id} className={`template-choice ${selected ? "is-selected" : ""}`}>
                                        <button type="button" className="template-choice__select" disabled={!canManage} onClick={() => toggleTemplate(template.id)} aria-pressed={selected}>
                                            <span className="template-choice__number">{String(index + 1).padStart(2, "0")}</span>
                                            <span className="template-choice__copy"><strong>{template.name}</strong><small>{template.publicDescription}</small><em>{template.sections.join(" · ")}</em></span>
                                            <span className="template-choice__check">{selected && <Check size={15} />}</span>
                                        </button>
                                        <button type="button" className="template-choice__preview" onClick={() => setPreviewTemplateId(template.id)}><Eye size={15} /> Preview template</button>
                                    </article>
                                );
                            })}
                        </div>
                    </section>

                    <section className="rotation-panel">
                        <div className="rotation-panel__head"><div><span className="rotation-step">03</span><div><h3>Choose listings</h3><p>Only these products will be changed by the schedule.</p></div></div><strong>{config.listingIds.length} selected</strong></div>
                        <label className="search-field rotation-search"><Search size={18} /><input value={listingSearch} onChange={(event) => setListingSearch(event.target.value)} placeholder="Search listing title or ID" /></label>
                        <div className="rotation-listings">
                            {filteredListings.map((listing) => {
                                const selected = config.listingIds.some((id) => Number(id) === Number(listing.listing_id));
                                return (
                                    <label className={`rotation-listing ${selected ? "is-selected" : ""}`} key={listing.listing_id}>
                                        <input type="checkbox" disabled={!canManage} checked={selected} onChange={() => toggleListing(listing.listing_id)} />
                                        <ProductThumb listing={listing} />
                                        <span><strong>{listing.title}</strong><small>#{listing.listing_id} · {listing.views ?? "—"} views</small></span>
                                        <span className="rotation-listing__check">{selected && <Check size={15} />}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </section>
                </div>

                <aside className="rotation-summary">
                    <div className="rotation-summary__symbol"><Layers3 size={24} /></div>
                    <span className="section-kicker">Next rotation</span>
                    <h3>{actualNextTemplate?.name || "Select templates"}</h3>
                    <p>{config.enabled ? config.scheduleLabel : "The schedule is paused until you enable it and save."}</p>
                    <dl><div><dt>Listings</dt><dd>{config.listingIds.length}</dd></div><div><dt>Templates</dt><dd>{config.templateIds.length}</dd></div><div><dt>Last run</dt><dd>{config.lastRunAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(config.lastRunAt)) : "Not yet"}</dd></div></dl>
                    <div className="rotation-warning"><AlertTriangle size={17} /><span>Freya Auto must remain running at the scheduled time. Each run calls OpenAI and then updates the live Etsy descriptions.</span></div>
                    <button className="button button--primary rotation-save" onClick={saveSettings} disabled={saving || !canManage}>{saving ? <LoaderCircle size={18} className="spin" /> : <Save size={18} />}Save rotation settings</button>
                </aside>
            </div>

            <section className="content-card">
                <div className="section-heading"><div><span className="section-kicker">Automation log</span><h2>Recent weekly runs</h2></div></div>
                {config.history?.length ? (
                    <div className="rotation-history">
                        {config.history.map((run) => {
                            const successes = run.results?.filter((result) => result.success).length || 0;
                            return <article key={run.id}><span className={`run-status run-status--${run.status}`}>{run.status}</span><div><strong>{run.templateName}</strong><small>{successes} of {run.results?.length || 0} listings updated</small></div><time>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(run.startedAt))}</time></article>;
                        })}
                    </div>
                ) : <div className="rotation-history-empty"><Clock3 size={20} /><span>No scheduled rotations have run yet.</span></div>}
            </section>
        </div>
        {previewTemplate && (
            <TemplatePreviewDialog
                templates={config.templates}
                selected={previewTemplate}
                select={setPreviewTemplateId}
                close={() => setPreviewTemplateId(null)}
            />
        )}
        </>
    );
}

function TemplatePreviewDialog({ templates, selected, select, close }) {
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === "Escape") close();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [close]);

    return (
        <div className="dialog-backdrop template-preview-backdrop" role="presentation">
            <section className="template-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="template-preview-title">
                <header className="template-preview-dialog__head">
                    <div><span className="section-kicker">Layout preview</span><h2 id="template-preview-title">Compare description templates</h2><p>Example copy shows the format and reading rhythm only. Your real listing will use its own facts.</p></div>
                    <button className="icon-button" onClick={close} aria-label="Close template preview"><X size={19} /></button>
                </header>

                <nav className="template-preview-tabs" aria-label="Description templates">
                    {templates.map((template, index) => (
                        <button key={template.id} className={template.id === selected.id ? "is-active" : ""} onClick={() => select(template.id)}>
                            <span>{String(index + 1).padStart(2, "0")}</span>{template.shortName}
                        </button>
                    ))}
                </nav>

                <div className="template-preview-layout">
                    <aside className="template-preview-meta">
                        <div className="template-preview-meta__mark"><Layers3 size={22} /></div>
                        <span className="section-kicker">{selected.shortName} format</span>
                        <h3>{selected.name}</h3>
                        <p>{selected.publicDescription}</p>
                        <ol>{selected.sections.map((section) => <li key={section}>{section}</li>)}</ol>
                        <div className="preview-safety-note"><ShieldCheck size={17} /><span>Previewing does not call OpenAI and never changes Etsy.</span></div>
                    </aside>
                    <div className="template-preview-paper">
                        <div className="template-preview-paper__top"><span>Sample Etsy description</span><small>{selected.preview?.length || 0} characters</small></div>
                        <div className="template-preview-copy">{selected.preview}</div>
                    </div>
                </div>
            </section>
        </div>
    );
}

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

function PerformancePage({ records, refresh, refreshing }) {
    const [selectedId, setSelectedId] = useState(records[0]?.listingId || null);
    const selected =
        records.find(
            (record) => String(record.listingId) === String(selectedId)
        ) || records[0];
    const totalGrowth = records.reduce(
        (sum, record) => sum + getTrackedGrowth(record),
        0
    );
    const strongest = [...records].sort(
        (a, b) => getTrackedGrowth(b) - getTrackedGrowth(a)
    )[0];

    if (!records.length) {
        return (
            <div className="page-stack page-enter">
                <section className="page-intro">
                    <div>
                        <span className="section-kicker">Post-update analytics</span>
                        <h2>Listing performance</h2>
                        <p>Track how Etsy views change after a description update.</p>
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
                    <RefreshCw size={17} className={refreshing ? "spin" : ""} /> Refresh Etsy views
                </button>
            </section>

            <section className="performance-summary" aria-label="Performance summary">
                <article><span>Listings tracked</span><strong>{records.length}</strong><small>Since their latest update</small></article>
                <article><span>New views recorded</span><strong>+{totalGrowth}</strong><small>Across tracked listings</small></article>
                <article><span>Strongest movement</span><strong>+{strongest ? getTrackedGrowth(strongest) : 0}</strong><small>{strongest?.title || "Waiting for data"}</small></article>
            </section>

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

                    <div className="analytics-note"><ShieldCheck size={17} /><span>This compares cumulative Etsy views before and after the latest description update. It does not claim that the description alone caused the change.</span></div>
                </article>
            </section>
        </div>
    );
}

function HistoryPage({ history }) {
    return (
        <div className="page-stack page-enter">
            <section className="page-intro"><div><span className="section-kicker">Shared audit trail</span><h2>Update history</h2><p>Manual and scheduled updates are stored on the server and shared with the private team.</p></div></section>
            <section className="content-card">
                {history.length ? (
                    <div className="history-list">
                        {history.map((item) => (
                            <article key={item.id} className="history-item">
                                <div className="history-item__icon"><Check size={18} /></div>
                                <div><strong>{item.title}</strong><span>Listing #{item.listingId} · {item.source === "weekly-rotation" ? "Weekly rotation" : "Manual update"} · {item.updatedBy}</span></div>
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

function SettingsPage({ account, connected, refresh, refreshing, isAdmin }) {
    return (
        <div className="page-stack page-enter">
            <section className="page-intro"><div><span className="section-kicker">Connections</span><h2>Workspace settings</h2><p>Review the services Freya Auto uses to read, refine, and update your listings.</p></div></section>
            <section className="settings-grid">
                <article className="setting-card">
                    <div className="setting-card__logo etsy-logo">E</div>
                    <div className="setting-card__body"><div><h3>Etsy shop</h3><StatusPill connected={connected} /></div><p>Used to load active listings and publish descriptions only after confirmation.</p><dl><div><dt>User ID</dt><dd>{account?.user_id || "—"}</dd></div><div><dt>Shop ID</dt><dd>{account?.shop_id || "—"}</dd></div></dl></div>
                    <div className="setting-card__actions">{isAdmin ? <a className="button button--secondary" href="/auth/etsy">Reconnect Etsy</a> : <span className="role-note"><LockKeyhole size={15} />Admin only</span>}<button className="button button--ghost" onClick={refresh} disabled={refreshing}><RefreshCw size={17} className={refreshing ? "spin" : ""} /> Check connection</button></div>
                </article>
                <article className="setting-card">
                    <div className="setting-card__logo ai-logo"><Sparkles size={22} /></div>
                    <div className="setting-card__body"><div><h3>AI copy studio</h3><span className="status-pill is-live"><span className="status-dot" />Configured</span></div><p>Uses the Freya Furniture brand system to create preview drafts from real listing facts.</p><div className="privacy-line"><ShieldCheck size={18} /><span>Drafts never update Etsy automatically from the desktop interface.</span></div></div>
                </article>
            </section>
        </div>
    );
}

function ConfirmDialog({ listing, updating, cancel, confirm }) {
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

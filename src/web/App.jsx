/**
 * 应用外壳：负责登录、导航、主题、全局提示及跨页面的数据加载。
 * 按业务边界拆成 catalog、rotation、analytics、social、account 五个模块，
 * 让同一业务的页面与操作靠在一起，修改某项功能时不必阅读整个应用。
 * 共享数据保留在这里作为单一来源；模块通过 props 和回调交换数据。
 * shared 是无业务状态的基础层，业务模块不会反向依赖 App，避免循环依赖。
 */
import { useEffect, useState } from "react";
import {
    AlertTriangle,
    CalendarClock,
    BarChart3,
    ChartNoAxesCombined,
    CheckCircle2,
    History,
    LayoutDashboard,
    LoaderCircle,
    LockKeyhole,
    LogOut,
    Menu,
    Megaphone,
    Moon,
    PackageSearch,
    Search,
    Settings,
    ShieldCheck,
    Store,
    Sun,
    UserRound,
    WandSparkles,
    X,
} from "lucide-react";
import {
    getAuthSession,
    getEtsyAccount,
    getListings,
    getPerformance,
    getShopDashboard,
    importLegacyPerformance,
    loginTeamMember,
    logoutTeamMember,
} from "./api";
import { friendlyError, StatusPill } from "./modules/shared";

import { OverviewPage, ListingsPage, StudioPage, ConfirmDialog, useCatalog } from "./modules/catalog";
import { WeeklyRotationPage } from "./modules/rotation";
import { PerformancePage } from "./modules/analytics";
import { MarketIntelligencePage } from "./modules/market";
import { SocialPublisherPage } from "./modules/social";
import { HistoryPage, SettingsPage } from "./modules/account";

const NAV_ITEMS = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "listings", label: "Listings", icon: PackageSearch },
    { id: "studio", label: "Rewrite studio", icon: WandSparkles },
    { id: "rotation", label: "Weekly rotation", icon: CalendarClock },
    { id: "performance", label: "Performance", icon: ChartNoAxesCombined },
    // Market research is a separate decision workflow, not a Performance sub-page.
    { id: "market", label: "Market intelligence", icon: BarChart3 },
    { id: "social", label: "Social publisher", icon: Megaphone },
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

function BrandMark() {
    return (
        <div className="brand-mark" aria-hidden="true">
            <span>F</span>
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
    const [toast, setToast] = useState(null);
    const [history, setHistory] = useState([]);
    const [performanceTracking, setPerformanceTracking] = useState([]);
    const [shopDashboard, setShopDashboard] = useState(null);

    // Hook 在 App 生命周期内保持草稿，即使在侧边栏切换页面也不会丢失。
    const { search, setSearch, selectedListing, setSelectedListing, preview, setPreview,
        draftDescription, setDraftDescription, generating, updating, confirmOpen, setConfirmOpen,
        filteredListings, openStudio, generatePreview, confirmUpdate } = useCatalog({
        listings, setListings, setHistory, setPerformanceTracking, setToast, navigate,
    });

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
        // API requests emit this event when the signed session cookie is no
        // longer accepted (for example, after a server restart).  Keeping this
        // at the application boundary prevents individual pages from having to
        // guess whether an error means "data unavailable" or "please log in".
        const handleExpiredSession = () => {
            setTeamUser(null);
            setAuthStatus("signed-out");
            setAccount(null);
            setListings([]);
        };
        window.addEventListener("freya-auth-expired", handleExpiredSession);
        return () => window.removeEventListener("freya-auth-expired", handleExpiredSession);
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

    // Effect 的返回函数负责清理计时器；提示变化或组件卸载时会执行。
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
            try {
                setShopDashboard(await getShopDashboard(30));
            } catch (dashboardError) {
                setShopDashboard(null);
                setToast({
                    type: "error",
                    message: `Listings loaded, but shop totals are unavailable: ${friendlyError(dashboardError)}`,
                });
            }
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
                            dashboard={shopDashboard}
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
                    {page === "market" && (
                        <MarketIntelligencePage
                            listings={listings}
                            canEdit={canEdit}
                            notify={setToast}
                            updateLocalListing={(listingId, tags) =>
                                setListings((items) =>
                                    items.map((item) =>
                                        Number(item.listing_id) === Number(listingId)
                                            ? { ...item, tags }
                                            : item
                                    )
                                )
                            }
                        />
                    )}
                    {page === "social" && (
                        <SocialPublisherPage
                            listings={listings}
                            canPublish={canEdit}
                            notify={setToast}
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

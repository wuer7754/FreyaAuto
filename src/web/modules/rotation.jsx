/**
 * 为何这样拆：周轮换配置和模板预览使用同一套配置，放在一起便于维护。模块管理自己的加载和保存状态，通过 props 接收商品、权限和全局提示。
 * 组件参数的 { ... } 是对象解构，从父组件传入的 props 中取出需要的值。
 * 回调函数让子模块请求父层更新数据，保持 React 单向数据流。
 */
import { useEffect, useState } from "react";
import {
    AlertTriangle,
    CalendarClock,
    Check,
    Clock3,
    Eye,
    LoaderCircle,
    Layers3,
    Search,
    Save,
    ShieldCheck,
    X,
} from "lucide-react";
import { getDescriptionRotation, saveDescriptionRotation } from "../api";
import { friendlyError, ProductThumb, EmptyState } from "./shared";

const ROTATION_WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

export function WeeklyRotationPage({ listings, notify, canManage }) {
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
        // current 是最新状态；...current 复制旧字段；[field] 用变量的值作为属性名。
        // 箭头函数返回对象时加圆括号，避免把花括号误认为函数体。
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

    // includes 判断是否已选；filter 返回移除后的新数组，展开语法追加新项。
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
                mode: config.mode,
                weekday: config.weekday,
                hour: config.hour,
                minute: config.minute,
                timezone: config.timezone,
            });
            setConfig(response.config);
            notify({
                type: "success",
                message: config.enabled
                    ? config.mode === "daily-batch"
                        ? "Daily three-list description rotation is active."
                        : "Weekly description rotation is active."
                    : "Rotation settings were saved.",
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
                    <p>Choose either the original weekly full rotation or a daily sequence that updates only three descriptions at a time.</p>
                </div>
                <span className={`rotation-state ${config.enabled ? "is-active" : ""}`}><span />{config.enabled ? "Automation active" : "Automation paused"}</span>
            </section>

            {!canManage && <div className="safety-note"><ShieldCheck size={19} /><div><strong>Administrator access required</strong><span>You can review this schedule, but only an administrator can change or activate it.</span></div></div>}

            <section className="rotation-master-card">
                <div className="rotation-master-card__icon"><CalendarClock size={23} /></div>
                <div><span className="section-kicker">Master control</span><h3>Run this rotation automatically</h3><p>Daily batch mode changes three selected descriptions per day, then continues with the next three tomorrow.</p></div>
                <label className="switch-control">
                    <input type="checkbox" checked={config.enabled} disabled={!canManage} onChange={(event) => updateField("enabled", event.target.checked)} />
                    <span aria-hidden="true" />
                    <strong>{config.enabled ? "On" : "Off"}</strong>
                </label>
            </section>

            <div className="rotation-layout">
                <div className="rotation-form-stack">
                    <section className="rotation-panel">
                        <div className="rotation-panel__head"><div><span className="rotation-step">01</span><div><h3>Choose the update rhythm</h3><p>The server checks the schedule every minute.</p></div></div></div>
                        <div className="template-choice-grid rotation-mode-grid">
                            <article className={`template-choice ${config.mode === "weekly-all" ? "is-selected" : ""}`}>
                                <button type="button" disabled={!canManage} className="template-choice__select" onClick={() => updateField("mode", "weekly-all")} aria-pressed={config.mode === "weekly-all"}>
                                    <span className="template-choice__number">01</span><span className="template-choice__copy"><strong>Weekly · all selected listings</strong><small>Original behavior: update every selected description on one scheduled weekday.</small></span><span className="template-choice__check">{config.mode === "weekly-all" && <Check size={15} />}</span>
                                </button>
                            </article>
                            <article className={`template-choice ${config.mode === "daily-batch" ? "is-selected" : ""}`}>
                                <button type="button" disabled={!canManage} className="template-choice__select" onClick={() => updateField("mode", "daily-batch")} aria-pressed={config.mode === "daily-batch"}>
                                    <span className="template-choice__number">02</span><span className="template-choice__copy"><strong>Daily · next 3 listings</strong><small>Update three descriptions today; automatically continue with the next three tomorrow.</small></span><span className="template-choice__check">{config.mode === "daily-batch" && <Check size={15} />}</span>
                                </button>
                            </article>
                        </div>
                        <div className="schedule-grid">
                            {config.mode === "weekly-all" && <label><span>Day</span><select disabled={!canManage} value={config.weekday} onChange={(event) => updateField("weekday", Number(event.target.value))}>{ROTATION_WEEKDAYS.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label>}
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
                    <dl><div><dt>{config.mode === "daily-batch" ? "Daily batch" : "Listings"}</dt><dd>{config.mode === "daily-batch" ? "3" : config.listingIds.length}</dd></div><div><dt>Templates</dt><dd>{config.templateIds.length}</dd></div><div><dt>Last run</dt><dd>{config.lastRunAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(config.lastRunAt)) : "Not yet"}</dd></div></dl>
                    <div className="rotation-warning"><AlertTriangle size={17} /><span>Freya Auto must remain running at the scheduled time. Each run calls OpenAI and then updates the live Etsy descriptions.</span></div>
                    <button className="button button--primary rotation-save" onClick={saveSettings} disabled={saving || !canManage}>{saving ? <LoaderCircle size={18} className="spin" /> : <Save size={18} />}Save rotation settings</button>
                </aside>
            </div>

            <section className="content-card">
                <div className="section-heading"><div><span className="section-kicker">Automation log</span><h2>Recent description runs</h2></div></div>
                {config.history?.length ? (
                    <div className="rotation-history">
                        {config.history.map((run) => {
                            const successes = run.results?.filter((result) => result.success).length || 0;
                            return <article key={run.id}><span className={`run-status run-status--${run.status}`}>{run.status}</span><div><strong>{run.templateName}</strong><small>{run.mode === "daily-batch" ? "Daily batch · " : ""}{successes} of {run.results?.length || 0} listings updated</small></div><time>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(run.startedAt))}</time></article>;
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

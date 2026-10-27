/**
 * 为何这样拆：图片、文案、渠道发布与周排期共享素材和渠道状态，放在一起避免跨模块同步。模块独立管理发布流程，通过 props 获取商品、权限和提示回调。
 * 组件参数的 { ... } 是对象解构，从父组件传入的 props 中取出需要的值。
 * 回调函数让子模块请求父层更新数据，保持 React 单向数据流。
 */
import { useEffect, useState } from "react";
import {
    AlertTriangle,
    CalendarClock,
    Check,
    CheckCircle2,
    ExternalLink,
    Image as ImageIcon,
    Link2,
    LoaderCircle,
    LockKeyhole,
    Megaphone,
    Send,
    ShieldCheck,
    Sparkles,
    WandSparkles,
    X,
} from "lucide-react";
import {
    getEtsyListingImages,
    getSocialHistory,
    getSocialStatus,
    generateSocialCopy,
    generateSocialQueueCopy,
    generateSocialImage,
    publishSocialCampaign,
    scheduleSocialCampaigns,
    uploadSocialImage,
} from "../api";
import { getListingImage, getEtsyImageUrl, friendlyError, ProductThumb, EmptyState } from "./shared";

export function SocialPublisherPage({ listings, canPublish, notify }) {
    const [status, setStatus] = useState(null);
    const [boards, setBoards] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [publishing, setPublishing] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingBackground, setUploadingBackground] = useState(false);
    const [uploadingQueue, setUploadingQueue] = useState(false);
    const [generatingQueueCopy, setGeneratingQueueCopy] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [queueConfirmOpen, setQueueConfirmOpen] = useState(false);
    const [selectedId, setSelectedId] = useState("");
    const [imageIndex, setImageIndex] = useState(0);
    const [etsyImages, setEtsyImages] = useState([]);
    const [loadingEtsyImages, setLoadingEtsyImages] = useState(false);
    const [selectedSourceImageIds, setSelectedSourceImageIds] = useState([]);
    const [scenePrompt, setScenePrompt] = useState("Place the mirror in a warm, refined entryway with natural daylight and realistic scale.");
    const [backgroundReference, setBackgroundReference] = useState(null);
    const [socialImageSize, setSocialImageSize] = useState("1024x1024");
    const [generatingSocialImage, setGeneratingSocialImage] = useState(false);
    const [platforms, setPlatforms] = useState({ instagram: true, facebook: true, pinterest: false });
    const [creativeBrief, setCreativeBrief] = useState("Warm, inviting, and focused on how the mirror makes an entryway feel brighter and more considered.");
    const [generatingCopy, setGeneratingCopy] = useState(false);
    const [instagramCaption, setInstagramCaption] = useState("");
    const [facebookText, setFacebookText] = useState("");
    const [pinterestTitle, setPinterestTitle] = useState("");
    const [pinterestDescription, setPinterestDescription] = useState("");
    const [pinterestBoardId, setPinterestBoardId] = useState("");
    const [instagramChannelId, setInstagramChannelId] = useState("");
    const [facebookChannelId, setFacebookChannelId] = useState("");
    const [pinterestChannelId, setPinterestChannelId] = useState("");
    const [destinationUrl, setDestinationUrl] = useState("");
    const [altText, setAltText] = useState("");
    const [uploadedImages, setUploadedImages] = useState([]);
    // 传入初始化函数，React 在挂载时读取缓存；不在每次渲染都解析本地数据。
    const [weeklyQueue, setWeeklyQueue] = useState(() => {
        try {
            const saved = window.localStorage.getItem("freya-social-weekly-queue");
            const parsed = saved ? JSON.parse(saved) : [];
            return Array.isArray(parsed) ? parsed.slice(0, 14) : [];
        } catch {
            return [];
        }
    });

    const selected = listings.find(
        (listing) => String(listing.listing_id) === String(selectedId)
    ) || listings[0] || null;
    const images = etsyImages.length ? etsyImages : selected?.images || [];
    const listingImageUrl =
        getEtsyImageUrl(images[imageIndex]) ||
        getListingImage(selected);
    const imageUrls = uploadedImages.length
        ? uploadedImages.map((image) => image.url)
        : [listingImageUrl].filter(Boolean);
    const imageUrl = imageUrls[0];

    useEffect(() => {
        if (!selectedId && listings[0]) setSelectedId(String(listings[0].listing_id));
    }, [listings, selectedId]);

    useEffect(() => {
        if (!selected?.listing_id) return undefined;
        // Effect 清理时标记失效，忽略旧请求结果，避免它覆盖新选择的素材。
        let cancelled = false;
        async function loadEtsyImages() {
            setLoadingEtsyImages(true);
            try {
                const response = await getEtsyListingImages(selected.listing_id);
                if (cancelled) return;
                const nextImages = response.images || [];
                setEtsyImages(nextImages);
                setImageIndex(0);
                setSelectedSourceImageIds(
                    nextImages[0] ? [String(nextImages[0].listing_image_id ?? 0)] : []
                );
            } catch (error) {
                if (!cancelled) {
                    setEtsyImages([]);
                    setSelectedSourceImageIds([]);
                    notify({ type: "error", message: friendlyError(error) });
                }
            } finally {
                if (!cancelled) setLoadingEtsyImages(false);
            }
        }
        loadEtsyImages();
        return () => { cancelled = true; };
    }, [selected?.listing_id, notify]);

    useEffect(() => {
        try {
            window.localStorage.setItem("freya-social-weekly-queue", JSON.stringify(weeklyQueue));
        } catch {
            // The queue still works for this session when browser storage is unavailable.
        }
    }, [weeklyQueue]);

    useEffect(() => {
        // Effect 清理时标记失效，忽略旧请求结果，避免它覆盖新选择的素材。
        let cancelled = false;
        async function loadSocialWorkspace() {
            setLoading(true);
            try {
                const socialStatus = await getSocialStatus();
                if (cancelled) return;
                setStatus(socialStatus);
                setPinterestBoardId(socialStatus.pinterest?.defaultBoardId || "");
                setInstagramChannelId(socialStatus.instagram?.channelId || "");
                setFacebookChannelId(socialStatus.facebook?.channelId || "");
                setPinterestChannelId(socialStatus.pinterest?.channelId || "");
                setBoards(socialStatus.boards || []);
                if (socialStatus.instagram?.configured || socialStatus.facebook?.configured) {
                    setPlatforms({
                        instagram: Boolean(socialStatus.instagram?.configured),
                        facebook: Boolean(socialStatus.facebook?.configured),
                        pinterest: false,
                    });
                }
                const historyResponse = await getSocialHistory(12);
                if (!cancelled) {
                    setHistory(historyResponse.records || []);
                }
            } catch (error) {
                if (!cancelled) notify({ type: "error", message: friendlyError(error) });
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadSocialWorkspace();
        return () => { cancelled = true; };
    }, [notify]);

    useEffect(() => {
        if (!selected) return;
        const title = String(selected.title || "Freya Furniture mirror");
        setImageIndex(0);
        setUploadedImages([]);
        setInstagramCaption(`${title}\n\nA sculptural mirror designed to bring warmth, light, and character to an entryway, vanity, or dressing space. Discover the Freya Furniture collection on Etsy.\n\n#GoldMirror #ArchedMirror #WallMirror #EntrywayDecor #FreyaFurniture`);
        setFacebookText(`A graceful focal point for the spaces that welcome you home. ${title} brings warm character to an entryway, vanity, or dressing space. Explore it on Etsy.`);
        setPinterestTitle(title.slice(0, 100));
        setPinterestDescription(`${title}. A distinctive wall mirror for an entryway, vanity, bathroom, bedroom, or dressing space.`.slice(0, 500));
        setDestinationUrl(selected.url || "");
        setAltText(`${title}, styled as a decorative wall mirror.`.slice(0, 500));
    }, [selected?.listing_id]);

    // Object.entries 产生 [属性名, 值] 对；filter 留下选中渠道，map 解构取渠道名。
    const chosenPlatforms = Object.entries(platforms)
        .filter(([, enabled]) => enabled)
        .map(([platform]) => platform);
    const unavailableSelected = chosenPlatforms.some(
        (platform) => !status?.[platform]?.configured
    );
    const missingChannels = chosenPlatforms.filter(
        (platform) => !status?.[platform]?.configured
    );
    const pinterestNeedsBoard =
        platforms.pinterest && status?.pinterest?.configured && !pinterestBoardId;
    const instagramChannels = (status?.channels || []).filter((channel) => channel.service === "instagram");
    const facebookChannels = (status?.channels || []).filter((channel) => channel.service === "facebook");
    const pinterestChannels = (status?.channels || []).filter((channel) => channel.service === "pinterest");
    const ready = Boolean(
        canPublish && selected && imageUrl && chosenPlatforms.length &&
        !unavailableSelected && !pinterestNeedsBoard && !publishing
    );
    const queueTimesValid = weeklyQueue.every((item) => {
        const timestamp = new Date(`${item.date}T${item.time}:00`).getTime();
        return Number.isFinite(timestamp) && timestamp > Date.now() + 60 * 1000;
    });
    const queueReady = Boolean(
        canPublish && weeklyQueue.length && chosenPlatforms.length &&
        !unavailableSelected && !pinterestNeedsBoard && queueTimesValid &&
        !uploadingQueue && !publishing
    );

    function togglePlatform(platform) {
        setPlatforms((current) => ({ ...current, [platform]: !current[platform] }));
    }

    async function createChannelCopy() {
        if (!selected) return;
        setGeneratingCopy(true);
        try {
            const response = await generateSocialCopy(selected.listing_id, creativeBrief);
            setInstagramCaption(response.copy.instagramCaption);
            setFacebookText(response.copy.facebookText);
            notify({ type: "success", message: "Channel-specific copy is ready for review." });
        } catch (error) {
            notify({ type: "error", message: friendlyError(error) });
        } finally {
            setGeneratingCopy(false);
        }
    }

    function validateImageFiles(files, maximum = 10) {
        const selectedFiles = Array.from(files || []);
        if (!selectedFiles.length) return [];
        if (selectedFiles.length > maximum) {
            throw new Error(`Choose no more than ${maximum} images at a time.`);
        }
        selectedFiles.forEach((file) => {
            if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                throw new Error("Choose JPG, PNG, or WebP images.");
            }
            if (file.size > 10 * 1024 * 1024) {
                throw new Error(`${file.name} is larger than 10 MB.`);
            }
        });
        return selectedFiles;
    }

    async function uploadImages(files) {
        setUploadingImage(true);
        try {
            const selectedFiles = validateImageFiles(files, 10);
            if (!selectedFiles.length) return;
            const responses = [];
            for (const file of selectedFiles) {
                const response = await uploadSocialImage(file);
                responses.push({ ...response.image, originalName: file.name });
            }
            setUploadedImages(responses);
            notify({ type: "success", message: `${responses.length} image${responses.length === 1 ? " is" : "s are"} ready for Buffer.` });
        } catch (error) {
            notify({ type: "error", message: friendlyError(error) });
        } finally {
            setUploadingImage(false);
        }
    }

    function toggleSourceImage(image, index) {
        const id = String(image.listing_image_id ?? index);
        setSelectedSourceImageIds((current) => {
            if (current.includes(id)) return current.filter((item) => item !== id);
            if (current.length >= 4) {
                notify({ type: "error", message: "Choose up to four Etsy reference images." });
                return current;
            }
            return [...current, id];
        });
    }

    async function uploadBackgroundReference(file) {
        setUploadingBackground(true);
        try {
            const [selectedFile] = validateImageFiles([file], 1);
            if (!selectedFile) return;
            const response = await uploadSocialImage(selectedFile);
            setBackgroundReference({ ...response.image, originalName: selectedFile.name });
            notify({ type: "success", message: "Background reference is ready." });
        } catch (error) {
            notify({ type: "error", message: friendlyError(error) });
        } finally {
            setUploadingBackground(false);
        }
    }

    async function createSocialScene() {
        if (!selected || !selectedSourceImageIds.length) return;
        setGeneratingSocialImage(true);
        try {
            const response = await generateSocialImage({
                listingId: selected.listing_id,
                listingImageIds: selectedSourceImageIds,
                backgroundFilename: backgroundReference?.filename || "",
                prompt: scenePrompt,
                size: socialImageSize,
            });
            const generated = {
                ...response.image,
                originalName: `Generated social scene · ${new Date().toLocaleTimeString()}`,
            };
            setUploadedImages([generated]);
            notify({ type: "success", message: "The new social image is ready for Instagram and Facebook." });
        } catch (error) {
            notify({ type: "error", message: friendlyError(error) });
        } finally {
            setGeneratingSocialImage(false);
        }
    }

    function queueDate(offset) {
        const date = new Date();
        date.setDate(date.getDate() + offset + 1);
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    }

    function makeQueueItem(images, offset, label) {
        return {
            id: `queue-${Date.now()}-${offset}-${Math.random().toString(36).slice(2, 7)}`,
            images,
            label,
            date: queueDate(offset),
            time: "09:00",
            instagramCaption,
            facebookText,
            pinterestTitle,
            pinterestDescription,
        };
    }

    async function uploadWeeklyImages(files) {
        setUploadingQueue(true);
        try {
            const remainingSlots = 14 - weeklyQueue.length;
            if (remainingSlots <= 0) throw new Error("The weekly queue already contains 14 posts.");
            const selectedFiles = validateImageFiles(files, Math.min(7, remainingSlots));
            if (!selectedFiles.length) return;
            const additions = [];
            for (let index = 0; index < selectedFiles.length; index += 1) {
                const file = selectedFiles[index];
                const response = await uploadSocialImage(file);
                additions.push(makeQueueItem(
                    [{ ...response.image, originalName: file.name }],
                    weeklyQueue.length + index,
                    file.name
                ));
            }
            try {
                const copyResponse = await generateSocialQueueCopy(
                    selected.listing_id,
                    creativeBrief,
                    additions.map((item) => ({ label: item.label }))
                );
                additions.forEach((item, index) => {
                    item.instagramCaption = copyResponse.posts[index].instagramCaption;
                    item.facebookText = copyResponse.posts[index].facebookText;
                });
            } catch (copyError) {
                notify({
                    type: "error",
                    message: `Images were added, but unique copy could not be generated: ${friendlyError(copyError)}`,
                });
            }
            setWeeklyQueue((current) => [...current, ...additions]);
            notify({ type: "success", message: `${additions.length} weekly post${additions.length === 1 ? "" : "s"} added with different copy for each day.` });
        } catch (error) {
            notify({ type: "error", message: friendlyError(error) });
        } finally {
            setUploadingQueue(false);
        }
    }

    async function refreshWeeklyCopy() {
        if (!selected || !weeklyQueue.length) return;
        setGeneratingQueueCopy(true);
        try {
            const response = await generateSocialQueueCopy(
                selected.listing_id,
                creativeBrief,
                weeklyQueue.map((item) => ({ label: item.label }))
            );
            setWeeklyQueue((current) => current.map((item, index) => ({
                ...item,
                instagramCaption: response.posts[index].instagramCaption,
                facebookText: response.posts[index].facebookText,
            })));
            notify({ type: "success", message: "Every day now has a different Instagram and Facebook message." });
        } catch (error) {
            notify({ type: "error", message: friendlyError(error) });
        } finally {
            setGeneratingQueueCopy(false);
        }
    }

    // map 保留其他排期；...patch 覆盖匹配项的字段，创建新对象触发 React 更新。
    function updateQueueItem(id, patch) {
        setWeeklyQueue((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    }

    function addCurrentToQueue() {
        if (!imageUrls.length) return;
        setWeeklyQueue((current) => [
            ...current,
            makeQueueItem(
                imageUrls.map((url, index) => ({ url, originalName: uploadedImages[index]?.originalName || `Etsy image ${index + 1}` })),
                current.length,
                `${selected?.title || "Product"} · ${imageUrls.length} image${imageUrls.length === 1 ? "" : "s"}`
            ),
        ].slice(0, 14));
        notify({ type: "success", message: "The current post was added to the weekly queue." });
    }

    async function publish() {
        setPublishing(true);
        try {
            const response = await publishSocialCampaign({
                platforms: chosenPlatforms,
                listingId: selected.listing_id,
                listingTitle: selected.title,
                imageUrl,
                imageUrls,
                destinationUrl,
                altText,
                instagramCaption,
                facebookText,
                pinterestTitle,
                pinterestDescription,
                pinterestBoardId,
                instagramChannelId,
                facebookChannelId,
                pinterestChannelId,
            });
            setHistory((current) => [response.record, ...current].slice(0, 12));
            setConfirmOpen(false);
            notify({
                type: response.record?.status === "partial" ? "error" : "success",
                message: response.record?.status === "partial"
                    ? "Published to one channel, but the other channel needs attention."
                    : "The promotional image was published successfully.",
            });
        } catch (error) {
            notify({ type: "error", message: friendlyError(error) });
        } finally {
            setPublishing(false);
        }
    }

    async function scheduleQueue() {
        setPublishing(true);
        try {
            const campaigns = weeklyQueue.map((item) => ({
                platforms: chosenPlatforms,
                listingId: selected.listing_id,
                listingTitle: selected.title,
                imageUrl: item.images[0]?.url,
                imageUrls: item.images.map((image) => image.url),
                destinationUrl,
                altText,
                instagramCaption: item.instagramCaption,
                facebookText: item.facebookText,
                pinterestTitle: item.pinterestTitle,
                pinterestDescription: item.pinterestDescription,
                pinterestBoardId,
                instagramChannelId,
                facebookChannelId,
                pinterestChannelId,
                scheduledAt: new Date(`${item.date}T${item.time}:00`).toISOString(),
            }));
            const response = await scheduleSocialCampaigns(campaigns);
            setHistory((current) => [...(response.records || []), ...current].slice(0, 12));
            setWeeklyQueue([]);
            setQueueConfirmOpen(false);
            notify({
                type: response.success ? "success" : "error",
                message: response.success
                    ? `${response.scheduled} posts were scheduled in Buffer.`
                    : `${response.scheduled} posts were scheduled; review the delivery log for the remaining items.`,
            });
        } catch (error) {
            notify({ type: "error", message: friendlyError(error) });
        } finally {
            setPublishing(false);
        }
    }

    return (
        <div className="page-stack page-enter social-publisher">
            <section className="page-intro">
                <div><span className="section-kicker">Organic promotion via Buffer</span><h2>One campaign, written for both channels.</h2><p>Choose the images once, give Freya Auto a writing direction, then review distinct copy for Instagram and Facebook.</p></div>
                {status?.buffer?.configured ? <span className="market-source-note"><ShieldCheck size={15} />Connected through Buffer</span> : <a className="button button--secondary" href="https://publish.buffer.com/settings/api" target="_blank" rel="noreferrer"><ExternalLink size={15} />Get Buffer API key</a>}
            </section>

            <section className="social-channel-grid" aria-label="Channel connections">
                <SocialChannel icon={<span className="instagram-glyph" aria-hidden="true">IG</span>} name="Instagram" ready={status?.instagram?.configured} note={status?.instagram?.name || "Connect Instagram inside Buffer"} />
                <SocialChannel icon={<strong>f</strong>} name="Facebook" ready={status?.facebook?.configured} note={status?.facebook?.name || "Connect a Facebook Page inside Buffer"} variant="facebook" />
            </section>

            <section className="social-workbench">
                <div className="social-compose">
                    <article className="social-panel">
                        <SocialStep number="01" title="Choose the product images" body="Upload up to 10 images for an Instagram or Facebook post, or use an existing Etsy product image." />
                        <label className="social-field"><span>Listing</span><select value={selected?.listing_id || ""} onChange={(event) => setSelectedId(event.target.value)}>{listings.map((listing) => <option key={listing.listing_id} value={listing.listing_id}>{listing.title}</option>)}</select></label>
                        <div className="social-upload-row">
                            <label className={`button button--secondary social-upload-button ${uploadingImage ? "is-disabled" : ""}`}>
                                {uploadingImage ? <LoaderCircle size={17} className="spin" /> : <ImageIcon size={17} />}
                                {uploadingImage ? "Uploading…" : "Upload one or more images"}
                                <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploadingImage || !canPublish} onChange={(event) => { uploadImages(event.target.files); event.target.value = ""; }} />
                            </label>
                            <small>Up to 10 images · JPG, PNG or WebP · 10 MB each</small>
                        </div>
                        {uploadedImages.length > 0 && <div className="social-uploaded-file"><div><CheckCircle2 size={16} /><span><strong>{uploadedImages.length} uploaded image{uploadedImages.length === 1 ? "" : "s"} selected</strong><small>{uploadedImages.map((image) => image.originalName).join(" · ")}</small></span></div><button type="button" onClick={() => setUploadedImages([])}>Use Etsy image instead</button></div>}
                        {uploadedImages.length > 1 && <div className="social-selected-assets" aria-label="Selected uploaded images">{uploadedImages.map((image, index) => <div key={image.url}><img src={image.url} alt="" /><span>{String(index + 1).padStart(2, "0")}</span><button type="button" aria-label={`Remove image ${index + 1}`} onClick={() => setUploadedImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={12} /></button></div>)}</div>}
                        {selected && <div className="social-image-picker">
                            <div className="social-image-stage">{imageUrl ? <img src={imageUrl} alt={altText} /> : <ImageIcon size={30} />}</div>
                            <div className="social-image-strip">{(images.length ? images : [{ url_570xN: listingImageUrl }]).map((image, index) => {
                                const url = getEtsyImageUrl(image) || listingImageUrl;
                                return <button type="button" className={!uploadedImages.length && index === imageIndex ? "is-selected" : ""} key={image.listing_image_id || `${url}-${index}`} onClick={() => { setUploadedImages([]); setImageIndex(index); }} aria-label={`Use product image ${index + 1}`}><img src={url} alt="" /></button>;
                            })}</div>
                        </div>}
                        <div className="social-image-atelier">
                            <div className="social-image-atelier__head"><div><span className="section-kicker">AI scene atelier</span><h3>Create a new social image</h3><p>Choose up to four official Etsy photos. The product stays the reference; your prompt and optional background define the new scene.</p></div><Sparkles size={22} /></div>
                            <div className="social-source-label"><span>1 · Etsy product references</span><b>{selectedSourceImageIds.length}/4 selected</b></div>
                            {loadingEtsyImages ? <div className="social-source-loading"><LoaderCircle size={18} className="spin" />Loading every Etsy image…</div> : images.length ? <div className="social-source-grid">{images.map((image, index) => {
                                const imageId = String(image.listing_image_id ?? index);
                                const selectedSource = selectedSourceImageIds.includes(imageId);
                                return <button type="button" className={selectedSource ? "is-selected" : ""} key={`source-${imageId}`} onClick={() => toggleSourceImage(image, index)}><img src={getEtsyImageUrl(image)} alt={`Etsy product reference ${index + 1}`} /><span>{selectedSource ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</span></button>;
                            })}</div> : <SocialWarning icon={<AlertTriangle size={16} />} text="No Etsy product images were returned for this listing." />}
                            <label className="social-field"><span>2 · Describe the new image <b>{scenePrompt.length}/1200</b></span><textarea value={scenePrompt} maxLength={1200} onChange={(event) => setScenePrompt(event.target.value)} placeholder="Example: Put the mirror above a walnut console in a bright modern entryway, morning sunlight, editorial interior photography." /></label>
                            <div className="social-creator-controls">
                                <div><span>3 · Background reference (optional)</span><label className={`button button--secondary social-upload-button ${uploadingBackground ? "is-disabled" : ""}`}>{uploadingBackground ? <LoaderCircle size={16} className="spin" /> : <ImageIcon size={16} />}{uploadingBackground ? "Uploading…" : backgroundReference ? "Change background" : "Upload background"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingBackground || !canPublish} onChange={(event) => { uploadBackgroundReference(event.target.files?.[0]); event.target.value = ""; }} /></label></div>
                                <label><span>Format</span><select value={socialImageSize} onChange={(event) => setSocialImageSize(event.target.value)}><option value="1024x1024">Square · 1:1</option><option value="1024x1536">Portrait · 2:3</option><option value="1536x1024">Landscape · 3:2</option></select></label>
                            </div>
                            {backgroundReference && <div className="social-background-reference"><img src={backgroundReference.url} alt="Background reference" /><div><strong>{backgroundReference.originalName}</strong><span>Used for room, mood, and composition—not as the product.</span></div><button type="button" onClick={() => setBackgroundReference(null)}>Remove</button></div>}
                            <button type="button" className="button button--primary social-create-image" disabled={!canPublish || !selectedSourceImageIds.length || scenePrompt.trim().length < 8 || generatingSocialImage} onClick={createSocialScene}>{generatingSocialImage ? <LoaderCircle size={17} className="spin" /> : <WandSparkles size={17} />}{generatingSocialImage ? "Creating the social scene…" : "Generate new social image"}</button>
                            <p className="social-creator-note"><ShieldCheck size={14} />The generator is instructed to preserve the mirror’s silhouette, frame, color, proportions, and visible details. Review the result before publishing.</p>
                        </div>
                        <label className="social-field"><span>Destination link</span><div className="social-input-with-icon"><Link2 size={16} /><input type="url" value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} placeholder="https://www.etsy.com/listing/..." /></div></label>
                        <label className="social-field"><span>Image alt text</span><input value={altText} maxLength={500} onChange={(event) => setAltText(event.target.value)} /></label>
                    </article>

                    <article className="social-panel">
                        <SocialStep number="02" title="Set the writing direction" body="Describe the mood, room, audience, or key idea. Freya Auto will create a separate draft for each channel." />
                        <label className="social-field social-brief"><span>Writing prompt <b>{creativeBrief.length}/1200</b></span><textarea value={creativeBrief} maxLength={1200} onChange={(event) => setCreativeBrief(event.target.value)} placeholder="Example: Make the entryway feel welcoming; warm editorial tone; mention the gold arch without sounding salesy." /></label>
                        <div className="social-prompt-row">
                            {["Entryway inspiration", "Bathroom vanity styling", "New product introduction", "Warm editorial story"].map((prompt) => <button type="button" key={prompt} onClick={() => setCreativeBrief(prompt)}>{prompt}</button>)}
                        </div>
                        <button type="button" className="button button--secondary social-generate-button" disabled={generatingCopy || !selected || !canPublish} onClick={createChannelCopy}>{generatingCopy ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}{generatingCopy ? "Writing…" : "Generate Instagram + Facebook copy"}</button>
                    </article>

                    <article className="social-panel">
                        <SocialStep number="03" title="Review each channel" body="Instagram uses a caption; Facebook uses an opening hook followed by the post text." />
                        <div className="social-destination-tabs">
                            <ChannelToggle name="Instagram" icon={<span className="instagram-glyph is-compact" aria-hidden="true">IG</span>} selected={platforms.instagram} ready={status?.instagram?.configured} onClick={() => togglePlatform("instagram")} />
                            <ChannelToggle name="Facebook" icon={<strong className="facebook-glyph">f</strong>} selected={platforms.facebook} ready={status?.facebook?.configured} onClick={() => togglePlatform("facebook")} />
                        </div>
                        {platforms.instagram && <>
                            {instagramChannels.length > 1 && <label className="social-field"><span>Instagram account</span><select value={instagramChannelId} onChange={(event) => setInstagramChannelId(event.target.value)}>{instagramChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label>}
                            <label className="social-field"><span>Instagram caption <b>{instagramCaption.length}/2200</b></span><textarea value={instagramCaption} maxLength={2200} onChange={(event) => setInstagramCaption(event.target.value)} /></label>
                        </>}
                        {platforms.facebook && <>
                            {facebookChannels.length > 1 && <label className="social-field"><span>Facebook Page</span><select value={facebookChannelId} onChange={(event) => setFacebookChannelId(event.target.value)}>{facebookChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label>}
                            <label className="social-field"><span>Facebook opening + post text <b>{facebookText.length}/5000</b></span><textarea value={facebookText} maxLength={5000} onChange={(event) => setFacebookText(event.target.value)} /></label>
                            <p className="social-field-note">A normal Facebook image post does not need a separate title. The first sentence is the hook people see first.</p>
                        </>}
                    </article>
                </div>

                <aside className="social-review">
                    <span className="section-kicker">Review</span><h3>Ready when the channels are.</h3>
                    <div className="social-review__preview">{imageUrl ? <img src={imageUrl} alt="" /> : <ImageIcon size={28} />}</div>
                    <div className="social-review__product"><strong>{selected?.title || "Choose a listing"}</strong><small>{chosenPlatforms.length ? chosenPlatforms.join(" + ") : "No channels selected"}</small></div>
                    {unavailableSelected && <SocialWarning icon={<AlertTriangle size={16} />} text={`Connect ${missingChannels.map((name) => ({ instagram: "Instagram", facebook: "Facebook", pinterest: "Pinterest" }[name])).join(" and ")} inside Buffer, or publish only to an available channel.`} />}
                    {!chosenPlatforms.length && <SocialWarning icon={<AlertTriangle size={16} />} text="Select at least one connected Buffer channel." />}
                    {pinterestNeedsBoard && <SocialWarning icon={<AlertTriangle size={16} />} text="Select a Pinterest board for this Pin." />}
                    {!canPublish && <SocialWarning icon={<LockKeyhole size={16} />} text="An editor or administrator must approve social publishing." />}
                    <button className="button button--primary social-publish-button" onClick={() => setConfirmOpen(true)} disabled={!ready || loading}><Send size={17} />Review & publish</button>
                    <p className="social-organic-note">Buffer publishes these as organic promotional posts. Paid campaigns, audiences, budgets, and billing are not changed.</p>
                </aside>
            </section>

            <section className="content-card social-calendar">
                <div className="social-calendar__heading">
                    <div><span className="section-kicker">Seven-day planner</span><h2>Build the week, then schedule it once.</h2><p>Each uploaded image becomes a separate post on the next available day. Dates, times, and copy remain editable before anything reaches Buffer.</p></div>
                    <div className="social-calendar__actions">
                        <label className={`button button--secondary social-upload-button ${uploadingQueue ? "is-disabled" : ""}`}>
                            {uploadingQueue ? <LoaderCircle size={17} className="spin" /> : <CalendarClock size={17} />}
                            {uploadingQueue ? "Building queue…" : "Upload a week of images"}
                            <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploadingQueue || !canPublish} onChange={(event) => { uploadWeeklyImages(event.target.files); event.target.value = ""; }} />
                        </label>
                        {weeklyQueue.length > 0 && <button type="button" className="button button--secondary" disabled={generatingQueueCopy || !canPublish} onClick={refreshWeeklyCopy}>{generatingQueueCopy ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}{generatingQueueCopy ? "Writing different posts…" : "Rewrite every day differently"}</button>}
                        <button type="button" className="button button--ghost" disabled={!imageUrls.length || weeklyQueue.length >= 14} onClick={addCurrentToQueue}>Add current post</button>
                    </div>
                </div>

                {weeklyQueue.length ? <>
                    <div className="social-queue-summary"><span><strong>{weeklyQueue.length}</strong> posts prepared</span><span>{weeklyQueue.reduce((total, item) => total + item.images.length, 0)} images</span><span>{chosenPlatforms.join(" + ") || "No channel selected"}</span></div>
                    <div className="social-week-grid">
                        {weeklyQueue.map((item, index) => <article className="social-week-card" key={item.id}>
                            <div className="social-week-card__top"><span>Day {String(index + 1).padStart(2, "0")}</span><button type="button" aria-label={`Remove queued post ${index + 1}`} onClick={() => setWeeklyQueue((current) => current.filter((queued) => queued.id !== item.id))}><X size={14} /></button></div>
                            <div className="social-week-card__media"><img src={item.images[0]?.url} alt="" />{item.images.length > 1 && <strong>+{item.images.length - 1}</strong>}</div>
                            <div className="social-week-card__body">
                                <small title={item.label}>{item.label}</small>
                                <div className="social-week-card__schedule"><label><span>Date</span><input type="date" min={queueDate(0)} value={item.date} onChange={(event) => updateQueueItem(item.id, { date: event.target.value })} /></label><label><span>Time</span><input type="time" value={item.time} onChange={(event) => updateQueueItem(item.id, { time: event.target.value })} /></label></div>
                                {platforms.instagram && <label className="social-field social-field--compact"><span>Instagram caption</span><textarea value={item.instagramCaption} maxLength={2200} onChange={(event) => updateQueueItem(item.id, { instagramCaption: event.target.value })} /></label>}
                                {platforms.facebook && <label className="social-field social-field--compact"><span>Facebook post</span><textarea value={item.facebookText} maxLength={5000} onChange={(event) => updateQueueItem(item.id, { facebookText: event.target.value })} /></label>}
                                {platforms.pinterest && <label className="social-field social-field--compact"><span>Pin title</span><input value={item.pinterestTitle} maxLength={100} onChange={(event) => updateQueueItem(item.id, { pinterestTitle: event.target.value })} /></label>}
                            </div>
                        </article>)}
                    </div>
                    <div className="social-calendar__footer">
                        {!queueTimesValid && <SocialWarning icon={<AlertTriangle size={16} />} text="Every queued date and time must be in the future." />}
                        <button className="button button--primary" disabled={!queueReady} onClick={() => setQueueConfirmOpen(true)}><CalendarClock size={17} />Review & schedule {weeklyQueue.length} posts</button>
                    </div>
                </> : <div className="social-calendar__empty"><CalendarClock size={25} /><div><strong>Your weekly queue is empty</strong><span>Upload up to seven images at once; Freya Auto will place them on consecutive days starting tomorrow.</span></div></div>}
            </section>

            <section className="content-card social-history">
                <div className="section-heading"><div><span className="section-kicker">Delivery log</span><h2>Recent social posts</h2></div><small>{history.length} recorded</small></div>
                {history.length ? <div className="social-history-list">{history.map((record) => <article key={record.id}><div className="social-history__image">{record.imageUrl ? <img src={record.imageUrl} alt="" /> : <ImageIcon size={18} />}</div><div><strong>{record.listingTitle || `Listing #${record.listingId}`}</strong><small>{record.results?.map((result) => result.platform).join(" · ")}</small></div><span className={`run-status run-status--${record.status === "published" ? "success" : record.status}`}>{record.status}</span><time>{new Date(record.createdAt).toLocaleString()}</time></article>)}</div> : <EmptyState icon={Megaphone} title="No social posts yet" body="Confirmed Instagram and Facebook posts will be recorded here." />}
            </section>

            {confirmOpen && <div className="dialog-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="social-confirm-title"><div className="confirm-dialog__icon"><Send size={22} /></div><span className="section-kicker">Buffer publication</span><h2 id="social-confirm-title">Publish {imageUrls.length} image{imageUrls.length === 1 ? "" : "s"} now?</h2><p>Buffer will immediately send a live promotional post to <strong>{chosenPlatforms.join(" and ")}</strong>. Both channels receive the selected images with their own copy.</p><div className="confirm-dialog__listing"><ProductThumb listing={selected} /><div><strong>{selected?.title}</strong><span>{imageUrls.length} image{imageUrls.length === 1 ? "" : "s"} · {chosenPlatforms.length} destination{chosenPlatforms.length === 1 ? "" : "s"}</span></div></div><div className="confirm-dialog__actions"><button className="button button--ghost" onClick={() => setConfirmOpen(false)} disabled={publishing}>Keep reviewing</button><button className="button button--danger" onClick={publish} disabled={publishing}>{publishing ? <LoaderCircle size={18} className="spin" /> : <Send size={17} />}Publish with Buffer</button></div></section></div>}
            {queueConfirmOpen && <div className="dialog-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="queue-confirm-title"><div className="confirm-dialog__icon"><CalendarClock size={22} /></div><span className="section-kicker">Weekly Buffer queue</span><h2 id="queue-confirm-title">Schedule {weeklyQueue.length} posts?</h2><p>These posts will be added to Buffer at the dates and times shown. They will publish automatically to <strong>{chosenPlatforms.join(" and ")}</strong>.</p><div className="confirm-dialog__listing"><CalendarClock size={22} /><div><strong>{weeklyQueue[0]?.date} through {weeklyQueue[weeklyQueue.length - 1]?.date}</strong><span>{weeklyQueue.reduce((total, item) => total + item.images.length, 0)} images across {weeklyQueue.length} posts</span></div></div><div className="confirm-dialog__actions"><button className="button button--ghost" onClick={() => setQueueConfirmOpen(false)} disabled={publishing}>Keep reviewing</button><button className="button button--danger" onClick={scheduleQueue} disabled={publishing}>{publishing ? <LoaderCircle size={18} className="spin" /> : <CalendarClock size={17} />}Schedule in Buffer</button></div></section></div>}
        </div>
    );
}

function SocialChannel({ icon, name, ready, note, pinterest = false, variant = "" }) {
    const markClass = pinterest ? "is-pinterest" : variant === "facebook" ? "is-facebook" : "is-instagram";
    return <article className={`social-channel ${ready ? "is-ready" : ""}`}><div className={`social-channel__mark ${markClass}`}>{icon}</div><div><span>{name}</span><strong>{ready ? "Ready to publish" : "Setup required"}</strong><small>{note}</small></div><span className="social-channel__light" /></article>;
}

function SocialStep({ number, title, body }) {
    return <div className="social-panel__head"><span className="rotation-step">{number}</span><div><h3>{title}</h3><p>{body}</p></div></div>;
}

function ChannelToggle({ name, icon, selected, ready, onClick }) {
    return <button type="button" className={selected ? "is-selected" : ""} onClick={onClick} disabled={!ready}>{icon}<span>{name}<small>{ready ? "Configured" : "Connect in Buffer"}</small></span><i>{selected ? <Check size={14} /> : null}</i></button>;
}

function SocialWarning({ icon, text }) {
    return <div className="social-warning">{icon}<span>{text}</span></div>;
}

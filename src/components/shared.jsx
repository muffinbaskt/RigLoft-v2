import { useState, useEffect, useRef } from "react";
import {
  X,
  Plus,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Lock,
  LayoutGrid,
  Briefcase,
  Heart,
  Inbox,
  BookOpen,
  Printer,
  Trash2,
  Upload,
} from "lucide-react";
import QRCode from "qrcode";
import { selectOnFocus, uniqueId, normalizeText, playSaveChime, timeStamp, findCatalogMatch, withLearnedAlias } from "../lib/utils";
import {
  getWithRetry,
  saveWithRetry,
  uploadReferenceDocument,
  deleteReferenceDocument,
  pdfToImageFiles,
  CATALOG_KEY,
} from "../lib/api";
import { newTool, logToolEvent } from "../lib/tools";
import { formatTaskTimestamp } from "../lib/workertasks";
import {
  RECEIVING_QUEUE_KEY,
  RECEIVING_NAME_MEMORY_KEY,
  computeUsualVendor,
  itemReceipts,
  attachReceiptPhotoToJob,
  attachReceiptPhotoToLoveList,
  applyReceiptLineToJob,
  applyReceiptLineToLoveList,
} from "../lib/receiving";

// Small, self-contained UI pieces shared across several screens — a
// zoomable full-screen image, a multi-photo lightbox built on top of it,
// a generic "pick one from a flat list" modal shell, the multi-page
// group-preview stepper used before combining scanned receipt pages, the
// confirm-delete dialog used everywhere, the top-level section header
// (Job Lists/Love Lists/Receiving/Receipt Archive all share one banner
// shape), and the two tool-adding modals used from more than one screen.
// None of these know anything about jobs, Love Lists, or receipts
// specifically; each just takes plain props from whichever screen opens it.

// Pinch-to-zoom / double-tap / scroll-wheel zoomable image, used anywhere
// a photo opens inline in a fullscreen overlay (Reference Documents, Love
// List photos) rather than in the browser's own PDF viewer — those get
// native pinch-zoom for free, this is what gives inline photos the same
// ability. Pass a fresh `key` (usually the photo's URL) from the caller
// so zoom/pan resets whenever a different photo is shown.
export function ZoomableImage({ src, alt = "", overlay, initialScale = 1 }) {
  const [scale, setScale] = useState(initialScale);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const gesture = useRef({ startDist: 0, startScale: 1, startTranslate: { x: 0, y: 0 }, panStart: null });
  const lastTap = useRef(0);

  const clampScale = (s) => Math.min(4, Math.max(1, s));
  const reset = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };
  const dist = (a, b) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);

  const handleTouchStart = (e) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      gesture.current.startDist = dist(e.touches[0], e.touches[1]);
      gesture.current.startScale = scale;
      gesture.current.startTranslate = translate;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        scale > 1 ? reset() : setScale(2);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
      if (scale > 1) {
        gesture.current.panStart = {
          x: e.touches[0].clientX - translate.x,
          y: e.touches[0].clientY - translate.y,
        };
      }
    }
  };

  const handleTouchMove = (e) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      e.preventDefault();
      const ratio = dist(e.touches[0], e.touches[1]) / (gesture.current.startDist || 1);
      setScale(clampScale(gesture.current.startScale * ratio));
    } else if (e.touches.length === 1 && scale > 1 && gesture.current.panStart) {
      e.preventDefault();
      setTranslate({
        x: e.touches[0].clientX - gesture.current.panStart.x,
        y: e.touches[0].clientY - gesture.current.panStart.y,
      });
    }
  };

  const handleTouchEnd = (e) => {
    e.stopPropagation();
    gesture.current.panStart = null;
  };

  const handleWheel = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const next = clampScale(scale + (e.deltaY < 0 ? 0.2 : -0.2));
    setScale(next);
    if (next === 1) setTranslate({ x: 0, y: 0 });
  };

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    scale > 1 ? reset() : setScale(2);
  };

  // Mouse click-and-drag panning (desktop) — mirrors the single-finger
  // touch pan above, but tracked on window rather than the image itself,
  // so dragging still works smoothly even if the cursor slides off the
  // shrunk-down image edge mid-drag.
  const handleMouseDown = (e) => {
    if (scale <= 1) return;
    e.stopPropagation();
    e.preventDefault();
    gesture.current.panStart = { x: e.clientX - translate.x, y: e.clientY - translate.y };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      if (!gesture.current.panStart) return;
      setTranslate({
        x: e.clientX - gesture.current.panStart.x,
        y: e.clientY - gesture.current.panStart.y,
      });
    };
    const onUp = () => {
      gesture.current.panStart = null;
      setDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  // Two render paths on purpose: every existing caller (Reference
  // Documents, Love List photos, Receiving...) gets the exact same bare
  // <img> as before, untouched. Only when a caller actually passes an
  // overlay (a marker that needs to move/scale together with the image
  // as it's pinched and panned) does this switch to a version that
  // measures the image's real natural pixel size (via onLoad) and sets
  // the wrapper to that exact size, scaled to fit the screen — rather
  // than leaning on max-width/max-height shrink-to-fit CSS and hoping
  // the wrapper box ends up exactly matching the rendered image with no
  // letterboxing gap. Without that exact match, percentage-based overlay
  // coordinates only look right by coincidence; this makes it always
  // correct instead of close-but-off.
  if (overlay) {
    return (
      <ZoomableImageWithOverlay
        src={src}
        alt={alt}
        overlay={overlay}
        scale={scale}
        translate={translate}
        dragging={dragging}
        handleTouchStart={handleTouchStart}
        handleTouchMove={handleTouchMove}
        handleTouchEnd={handleTouchEnd}
        handleWheel={handleWheel}
        handleDoubleClick={handleDoubleClick}
        handleMouseDown={handleMouseDown}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      style={{
        transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
        transition: scale === 1 ? "transform 0.15s ease" : "none",
        touchAction: "none",
        cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
        WebkitUserDrag: "none",
        userSelect: "none",
      }}
      className="max-w-full max-h-full rounded-lg select-none"
    />
  );
}

// The overlay-aware render path for ZoomableImage above — split out
// purely so it can call its own useState/useEffect for measuring the
// image's real pixel size without those hooks running (uselessly) for
// every other, far more common, no-overlay call site. Sets the wrapper
// to that exact measured-and-scaled-to-fit size rather than trusting
// CSS shrink-to-fit to land on precisely the same box the image itself
// renders at — which is what a percentage-positioned overlay needs to
// actually line up with the image instead of drifting off it.
function ZoomableImageWithOverlay({
  src,
  alt,
  overlay,
  scale,
  translate,
  dragging,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  handleWheel,
  handleDoubleClick,
  handleMouseDown,
}) {
  const [naturalSize, setNaturalSize] = useState(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Matches the px-4 py-8 padding every caller of this overlay path
  // currently wraps its fullscreen container in — an estimate, but one
  // that only affects overall size, never alignment: as long as the
  // wrapper's aspect ratio matches the image's own exactly (which
  // setting both from the same naturalSize guarantees), the overlay's
  // percentage coordinates land correctly regardless of a few px of
  // padding guess being slightly off.
  let displayWidth;
  let displayHeight;
  if (naturalSize) {
    const maxW = Math.max(50, viewport.w - 32);
    const maxH = Math.max(50, viewport.h - 64);
    const fit = Math.min(maxW / naturalSize.width, maxH / naturalSize.height, 1);
    displayWidth = naturalSize.width * fit;
    displayHeight = naturalSize.height * fit;
  }

  return (
    <div
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      style={{
        position: "relative",
        width: displayWidth,
        height: displayHeight,
        transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
        transition: scale === 1 ? "transform 0.15s ease" : "none",
        touchAction: "none",
        cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
        WebkitUserDrag: "none",
        userSelect: "none",
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => setNaturalSize({ width: e.target.naturalWidth, height: e.target.naturalHeight })}
        className="rounded-lg select-none block"
        style={{ width: displayWidth ? "100%" : "auto", height: displayHeight ? "100%" : "auto" }}
      />
      {naturalSize && overlay}
    </div>
  );
}

// Full-screen zoomable photo viewer with left/right arrow-key (and
// on-screen chevron) navigation between the photos in `photos`, since
// closing and reopening each one individually gets tedious once there's
// more than a couple — a job's reference documents, a multi-page
// receipt, a Love List's photo gallery, etc. `photos` is an array of
// { url, alt? }; `index` is which one is currently shown. Escape (or
// tapping the backdrop/X) closes; arrow keys do nothing past either end
// rather than wrapping around.
export function PhotoLightbox({ photos, index, onIndexChange, onClose }) {
  const count = photos.length;
  const current = photos[index];

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      else if (e.key === "ArrowRight" && index < count - 1) onIndexChange(index + 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, count, onClose, onIndexChange]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center px-4 py-8"
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute top-4 right-4 text-slate-300 hover:text-white">
        <X className="w-6 h-6" />
      </button>
      {count > 1 && (
        <p className="absolute top-4 left-4 text-xs text-slate-400">
          {index + 1} of {count}
        </p>
      )}
      {count > 1 && index > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index - 1);
          }}
          className="absolute left-2 sm:left-4 text-slate-300 hover:text-white p-2"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}
      {count > 1 && index < count - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index + 1);
          }}
          className="absolute right-2 sm:right-4 text-slate-300 hover:text-white p-2"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}
      <ZoomableImage key={current.url} src={current.url} alt={current.alt || ""} />
    </div>
  );
}

// Shared shell for a bulk picker that's just "tap one option from a flat
// list, then close" — Set gang and Set storage were byte-for-byte
// identical apart from the title, the options, and the click handler
// before this got factored out.
export function SimpleListPickerModal({ title, options, onPick, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-slate-100 font-semibold mb-3">{title}</h3>
        <div className="space-y-1.5 mb-4">
          {options.map((o) => (
            <button
              key={o}
              onClick={() => onPick(o)}
              className="w-full text-left text-sm rounded-md px-3 py-2 border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              {o}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Fullscreen stepper for eyeballing a detected group's pages side by
// side without hunting through the whole pending list — arrow keys or
// the on-screen buttons move between them, each still fully zoomable via
// ZoomableImage in case a detail needs a closer look.
export function GroupPhotoStepper({ photos, onClose }) {
  const [index, setIndex] = useState(0);
  const current = photos[index];

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, photos.length - 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [photos.length, onClose]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-slate-300">
        <span className="text-sm">
          Page {current.pageNumber} · {index + 1} of {photos.length}
        </span>
        <button onClick={onClose} className="text-slate-300 hover:text-white">
          <X className="w-6 h-6" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-4 min-h-0 relative">
        <button
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white disabled:opacity-20 p-2"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
        <ZoomableImage key={current.url} src={current.url} alt={`Page ${current.pageNumber}`} />
        <button
          onClick={() => setIndex((i) => Math.min(i + 1, photos.length - 1))}
          disabled={index === photos.length - 1}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white disabled:opacity-20 p-2"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      </div>
      <div className="flex justify-center gap-1.5 pb-4">
        {photos.map((p, i) => (
          <button
            key={p.batchId}
            onClick={() => setIndex(i)}
            className={`w-2 h-2 rounded-full ${i === index ? "bg-amber-400" : "bg-slate-700"}`}
          />
        ))}
      </div>
    </div>
  );
}

export function ConfirmDelete({ title, message, confirmLabel = "Delete", onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4" onClick={onCancel}>
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-slate-100 font-semibold mb-1.5">{title}</h3>
        <p className="text-slate-400 text-sm mb-5">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 text-sm rounded-md py-2 bg-red-600 text-white font-semibold hover:bg-red-500"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// One consistent header shell for every top-level section (Job Lists,
// Love Lists, Receiving, Receipt Archive) — Job Lists' own header was the
// one that already looked right, so this is that shape, shared instead of
// each screen styling its own banner independently and slowly drifting
// apart (which is exactly what had already happened: Love Lists used a
// narrower width and an unboxed back icon, Receiving and Receipt Archive
// had no boxed back button or centered content at all). onQuickNav is the
// editor-only "jump to another section" menu — pass it only when the
// caller is both a real section root and isEditor, never for a transient
// sub-modal.
export function SectionHeader({
  onBack,
  backIcon: BackIcon = ChevronLeft,
  icon: Icon,
  iconClassName = "text-slate-400",
  title,
  badge,
  subtitle,
  titleSlot,
  maxWidthClass = "max-w-5xl",
  current,
  onQuickNav,
  quickNavIsOwner = false,
  locked = false,
  children,
  extra,
}) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
      <div className={`${maxWidthClass} mx-auto px-4 py-4 flex items-center justify-between gap-3 flex-wrap`}>
        <div className="flex items-center gap-2.5 min-w-0">
          {locked ? (
            // A scanned QR code opened straight to this one record, and
            // whoever scanned it isn't logged in — no back button, no way
            // to browse into the dashboard or anywhere else. This is
            // meant to be a dead end, not an on-ramp into the rest of the
            // app.
            <div
              title="Shared view — nothing else to navigate to here"
              className="w-8 h-8 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 shrink-0"
            >
              <Lock className="w-4 h-4" />
            </div>
          ) : (
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 hover:bg-slate-700 active:scale-90 transition-transform shrink-0"
            >
              <BackIcon className="w-4 h-4" />
            </button>
          )}
          {titleSlot || (
            <div className="min-w-0">
              <p className="font-semibold text-slate-100 leading-tight flex items-center gap-1.5 truncate">
                {Icon && <Icon className={`w-4 h-4 shrink-0 ${iconClassName}`} />}
                <span className="truncate">{title}</span>
                {badge}
              </p>
              {subtitle && <p className="text-xs text-slate-500 leading-tight truncate">{subtitle}</p>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
          {children}
          {!locked && onQuickNav && (
            <QuickNavMenu current={current} onNavigate={onQuickNav} isOwner={quickNavIsOwner} />
          )}
        </div>
      </div>
      {/* Extra rows (search bars, filters, inline messages) that need to
          stay part of the same sticky banner instead of scrolling away
          with the page content below it. */}
      {extra}
    </header>
  );
}

// The 4 sections an editor most often needs to jump directly between,
// without backing out to the landing screen first. Deliberately narrow —
// not every section (Tools, Backorders, Worker Kiosk) belongs in a quick
// jump menu, and Kiosk specifically signs the current account out, so it's
// left out on purpose.
export const QUICK_NAV_DESTINATIONS = [
  { key: "jobs", label: "Job Lists", icon: Briefcase },
  { key: "love", label: "Love Lists", icon: Heart },
  {
    key: "receiving",
    label: "Receiving",
    icon: Inbox,
    ownerOnly: true,
    // Lazy-loaded screen — start its chunk downloading on hover/touch-start
    // instead of waiting for the click, same as the landing-screen tiles.
    preload: () => import("../screens/ReceivingApp"),
  },
  {
    key: "archive",
    label: "Receipt Archive",
    icon: BookOpen,
    ownerOnly: true,
    preload: () => import("../screens/ReceiptArchive"),
  },
];

export function QuickNavMenu({ current, onNavigate, isOwner = false }) {
  const [open, setOpen] = useState(false);
  // Receiving and Receipt Archive are owner-only screens (no view-only
  // mode of their own) — a manager would just get bounced to an "Owner
  // only" screen, so those two don't even show up as options for them.
  const destinations = QUICK_NAV_DESTINATIONS.filter((d) => !d.ownerOnly || isOwner);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Jump to another section"
        className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-md shadow-lg z-40 overflow-hidden">
            {destinations.map((d) => {
              const isCurrent = d.key === current;
              return (
                <button
                  key={d.key}
                  onClick={() => {
                    setOpen(false);
                    if (!isCurrent) onNavigate(d.key);
                  }}
                  onMouseEnter={d.preload}
                  onTouchStart={d.preload}
                  disabled={isCurrent}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left ${
                    isCurrent ? "text-slate-600 cursor-default" : "text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  <d.icon className="w-4 h-4 text-slate-400 shrink-0" />
                  {d.label}
                  {isCurrent && <span className="ml-auto text-[10px] text-slate-600 shrink-0">current</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Used from both Receipt Archive ("send these items straight to Tools")
// and Tools itself (adding new tools directly, or the Backfill flow's
// "add this one manually instead") — genuinely shared, not owned by
// either screen.
export function AddToolModal({ onSave, onClose, initialRows, existingReceipt, title = "Add tools" }) {
  const [rows, setRows] = useState(
    initialRows && initialRows.length > 0
      ? initialRows
      : [{ id: uniqueId(), name: "", qty: "1", smeText: "" }]
  );
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const fileInputRef = useRef(null);

  const updateRow = (id, changes) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  };
  const addRow = () => {
    setRows((prev) => [...prev, { id: uniqueId(), name: "", qty: "1", smeText: "" }]);
  };
  const removeRow = (id) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleReceiptChosen = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setReceiptFile(file);
    setReceiptPreviewUrl(URL.createObjectURL(file));
  };

  const validRows = rows.filter((r) => r.name.trim());
  const totalCount = validRows.reduce((sum, r) => sum + (Math.max(1, Number(r.qty) || 1)), 0);

  const handleSave = async () => {
    if (validRows.length === 0) return;
    setSaving(true);
    setSaveError(null);

    // Uploaded once here, before any tool records exist, rather than
    // per-tool — every tool this batch creates points at the same
    // uploaded file instead of the receipt getting re-uploaded once per
    // item. When existingReceipt is provided (sent over from an already-
    // archived receipt), there's nothing to upload at all — every tool
    // just points at that same already-stored photo directly.
    let receiptPath = existingReceipt ? existingReceipt.path : null;
    let receiptUrl = existingReceipt ? existingReceipt.url : null;
    if (!existingReceipt && receiptFile) {
      const batchId = uniqueId();
      const result = await uploadReferenceDocument(batchId, receiptFile);
      if (!result.ok) {
        setSaveError(result.error || "Couldn't upload the receipt — you can still add the tools and attach it later.");
      } else {
        receiptPath = result.path;
        receiptUrl = result.url;
      }
    }

    const newTools = validRows.flatMap((row) => {
      const qty = Math.max(1, Number(row.qty) || 1);
      const smes = row.smeText
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return Array.from({ length: qty }, (_, i) => {
        const sme = smes[i] || null;
        let tool = newTool({
          name: row.name.trim(),
          sme,
          status: sme ? "needs_engraving" : "awaiting_sme",
        });
        if (receiptUrl) {
          tool = logToolEvent(
            { ...tool, receiptPath, receiptUrl },
            "receipt_attached",
            existingReceipt ? "Receipt photo attached from the Archive" : "Receipt photo attached"
          );
        }
        return tool;
      });
    });

    onSave(newTools);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4 py-8" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-lg max-h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h3 className="text-slate-100 font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            {existingReceipt
              ? "Receipt photo — already attached from the Archive"
              : "Receipt photo (optional — shared by every row below)"}
          </label>
          {existingReceipt ? (
            <div className="flex items-center gap-2 mb-4">
              <img
                src={existingReceipt.url}
                alt=""
                className="w-14 h-14 rounded-md object-cover border border-slate-700"
              />
              <p className="text-xs text-slate-500">
                Every tool created here will point at this same photo — no re-upload needed.
              </p>
            </div>
          ) : receiptPreviewUrl ? (
            <div className="flex items-center gap-2 mb-4">
              <img
                src={receiptPreviewUrl}
                alt=""
                className="w-14 h-14 rounded-md object-cover border border-slate-700"
              />
              <button
                onClick={() => {
                  setReceiptFile(null);
                  setReceiptPreviewUrl(null);
                }}
                className="text-xs text-slate-500 hover:text-red-400"
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleReceiptChosen}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                className="mb-4 flex items-center gap-1.5 text-sm rounded-md px-3 py-2 border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                <Camera className="w-4 h-4" />
                Attach receipt photo
              </button>
            </>
          )}

          <label className="block text-xs font-medium text-slate-400 mb-1.5">Items on this receipt</label>
          <div className="space-y-2 mb-3">
            {rows.map((row) => (
              <div key={row.id} className="border border-slate-800 rounded-lg p-2.5 bg-slate-800/40">
                <div className="flex gap-2 mb-2">
                  <input
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                    placeholder="Item name, e.g. Die grinder"
                    className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                  />
                  <input
                    type="number"
                    min="1"
                    onFocus={selectOnFocus}
                    onClick={selectOnFocus}
                    value={row.qty}
                    onChange={(e) => updateRow(row.id, { qty: e.target.value })}
                    className="w-16 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                  />
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(row.id)} className="text-slate-500 hover:text-red-400 p-1.5">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <input
                  value={row.smeText}
                  onChange={(e) => updateRow(row.id, { smeText: e.target.value })}
                  placeholder={
                    Number(row.qty) > 1
                      ? "SME #s if you already have them, comma-separated, one per item"
                      : "SME # if you already have it (optional)"
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                />
              </div>
            ))}
          </div>
          <button onClick={addRow} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />
            Add another item from this receipt
          </button>
          {saveError && <p className="text-xs text-red-400 mt-3">{saveError}</p>}
        </div>

        <div className="px-5 py-4 border-t border-slate-800 shrink-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={validRows.length === 0 || saving}
            className="flex-1 text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
          >
            {saving ? "Adding..." : `Add ${totalCount} tool${totalCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// Generic deep-link QR code — shared by Job Lists and Love Lists (both
// pass their own section/id/title/subtitle/heading), since the actual QR
// generation and print styling has nothing specific to either one.
export function DeepLinkQrModal({ section, id, title, subtitle, heading, onClose }) {
  const canvasRef = useRef(null);
  // id is optional — Kiosk isn't a specific record, so there's nothing for
  // an id to point at; every other section still gets one.
  const url = `${window.location.origin}${window.location.pathname}?section=${section}${
    id != null ? `&id=${id}` : ""
  }`;
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 240, margin: 1 }, () => {});
    }
  }, [url]);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4 py-8 print:static print:block print:bg-white print:p-0">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
            height: 0 !important;
            overflow: hidden !important;
          }
          #deep-link-qr-print-area, #deep-link-qr-print-area * {
            visibility: visible;
            height: auto !important;
            overflow: visible !important;
          }
          #deep-link-qr-print-area {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            padding: 0.5in;
          }
        }
      `}</style>
      <div className="bg-white text-slate-900 w-full max-w-sm rounded-lg flex flex-col print:static print:block print:max-w-none print:rounded-none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0 print:hidden">
          <h3 className="font-semibold text-base">{heading}</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="text-sm rounded-md px-3 py-1.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div id="deep-link-qr-print-area" className="p-6 flex flex-col items-center text-center">
          <h2 className="text-lg font-bold mb-1">{title}</h2>
          <p className="text-sm text-slate-600 mb-4">
            {subtitle || " "}
          </p>
          <canvas ref={canvasRef} />
          <p className="text-xs text-slate-500 mt-4 print:hidden">
            Scanning this opens it directly — no login needed to view it.
          </p>
        </div>
      </div>
    </div>
  );
}

// Small, generic cross-screen pieces — used by both Job Lists and
// Love Lists item views (purchase/receipt history, pulling an item
// straight out of the Receiving queue, a plain labeled dropdown).
export function Select({ value, onChange, options, labels }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {labels && labels[opt] !== undefined ? labels[opt] : opt}
          </option>
        ))}
      </select>
      <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

// Shown from either a Job or Love List item card — the purchase history
// lives on the catalog entry, so this reads straight off that rather
// than anything specific to the job/list you happened to open it from.
// Read-only look at whichever receipt most recently touched this
// specific item — a self-contained snapshot rather than a live lookup,
// so it still works even if the original Receiving history entry (or
// archived receipt) it came from was since deleted or cleared.
// One receipt's details and photos. Split out so each receipt on an item
// can open its own photo viewer.
export function SourceReceiptBlock({ receipt, heading }) {
  const [viewingIndex, setViewingIndex] = useState(null);
  const allPhotos = [receipt.photoUrl, ...(receipt.extraPhotoUrls || [])].filter(Boolean);
  return (
    <div>
      {heading && (
        <p className="text-sm text-slate-100 font-semibold mb-1">
          {receipt.label || receipt.vendor || "Receipt"}
        </p>
      )}
      <p className="text-xs text-slate-500 mb-3">
        {[
          receipt.vendor && (receipt.label || !heading) && `Vendor: ${receipt.vendor}`,
          receipt.receiptDate && `Date: ${receipt.receiptDate}`,
          receipt.poNumber && `PO: ${receipt.poNumber}`,
        ]
          .filter(Boolean)
          .join(" · ") || "No further details recorded"}
      </p>
      {receipt.photoUrl ? (
        <>
          <button
            onClick={() => setViewingIndex(0)}
            className="w-full rounded-lg overflow-hidden border border-slate-800"
          >
            <img src={receipt.photoUrl} alt="Receipt" className="w-full max-h-64 object-cover" />
          </button>
          {(receipt.extraPhotoUrls || []).length > 0 && (
            <div className="grid grid-cols-4 gap-1.5 mt-1.5">
              {receipt.extraPhotoUrls.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setViewingIndex(i + 1)}
                  className="rounded-md overflow-hidden border border-slate-800"
                >
                  <img src={url} alt={`Page ${i + 2}`} className="w-full h-14 object-cover" />
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-500 text-center py-6">No photo saved with this receipt.</p>
      )}
      {viewingIndex !== null && (
        <PhotoLightbox
          photos={allPhotos.map((url) => ({ url, alt: "Receipt" }))}
          index={viewingIndex}
          onIndexChange={setViewingIndex}
          onClose={() => setViewingIndex(null)}
        />
      )}
    </div>
  );
}

// `receipts` is everything backing one item (see itemReceipts) — an item can
// carry several once deliveries or duplicate items have been merged together.
export function SourceReceiptModal({ receipts, onClose }) {
  const many = receipts.length > 1;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-100 font-semibold text-base">
            {many ? `${receipts.length} receipts` : receipts[0].label || receipts[0].vendor || "Receipt"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0 ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-5">
          {receipts.map((r, i) => (
            <div key={i} className={many && i > 0 ? "pt-5 border-t border-slate-800" : ""}>
              <SourceReceiptBlock receipt={r} heading={many} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function VendorBreakdownModal({ catalogItem, onClose, onChange }) {
  const [history, setHistory] = useState(catalogItem.vendorHistory || []);
  const [showIndividual, setShowIndividual] = useState(false);
  const [deleteRecordTarget, setDeleteRecordTarget] = useState(null);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);

  const persist = async (nextHistory) => {
    const nextVendor = computeUsualVendor(nextHistory) || "";
    // Tells whichever screen opened this modal right away — without
    // this, closing and reopening (a fresh instance, since this modal
    // fully unmounts rather than just hiding) would read the parent's
    // still-stale catalog data and show the old entries again, even
    // though storage was already correctly updated.
    if (onChange) onChange(catalogItem.id, { vendorHistory: nextHistory, vendor: nextVendor });
    const result = await getWithRetry(CATALOG_KEY);
    if (result.ok && result.value) {
      const next = JSON.parse(result.value).map((c) =>
        c.id === catalogItem.id ? { ...c, vendorHistory: nextHistory, vendor: nextVendor } : c
      );
      await saveWithRetry(CATALOG_KEY, JSON.stringify(next));
    }
  };

  const deleteRecord = (recordId) => {
    const next = history.filter((r) => r.id !== recordId);
    setHistory(next);
    persist(next);
  };

  const clearAll = () => {
    setHistory([]);
    persist([]);
  };

  const grouped = {};
  history.forEach((r) => {
    if (!r.vendor) return;
    if (!grouped[r.vendor]) grouped[r.vendor] = { qty: 0, amount: 0 };
    grouped[r.vendor].qty += r.qty || 0;
    grouped[r.vendor].amount += r.amount || 0;
  });
  const rows = Object.entries(grouped)
    .map(([vendor, data]) => ({ vendor, ...data }))
    .sort((a, b) => b.amount - a.amount);
  const totalSpent = rows.reduce((sum, r) => sum + r.amount, 0);
  const individualSorted = [...history].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-slate-100 font-semibold text-base truncate">{catalogItem.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0 ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Purchase history by vendor{totalSpent > 0 ? ` · $${totalSpent.toFixed(2)} total` : ""}
        </p>
        <div className="flex-1 overflow-y-auto space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              No purchase history recorded yet — this fills in automatically as receipts linked
              to this item get approved with a vendor and price on them.
            </p>
          ) : (
            <>
              {rows.map((r) => (
                <div
                  key={r.vendor}
                  className="border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-slate-100 truncate">
                      {r.vendor}
                      {catalogItem.vendor === r.vendor && (
                        <span className="ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 border bg-amber-500/15 text-amber-300 border-amber-500/40">
                          Usual
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{r.qty} received</p>
                  </div>
                  <p className="text-sm font-semibold text-emerald-400 shrink-0">
                    {r.amount > 0 ? `$${r.amount.toFixed(2)}` : "—"}
                  </p>
                </div>
              ))}

              <button
                onClick={() => setShowIndividual((v) => !v)}
                className="text-xs text-slate-500 hover:text-slate-300 pt-1"
              >
                {showIndividual ? "▲ Hide" : "▼ Show"} individual purchases ({history.length}) — for
                removing duplicates or bad entries
              </button>

              {showIndividual && (
                <div className="space-y-1.5 pt-1">
                  {individualSorted.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 text-xs border border-slate-800 rounded-md px-2.5 py-2 bg-slate-900/60"
                    >
                      <span className="text-slate-300 truncate">
                        {r.vendor} · {r.qty} · {r.date || "no date"}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-emerald-400 font-medium">
                          {r.amount > 0 ? `$${r.amount.toFixed(2)}` : "—"}
                        </span>
                        <button
                          onClick={() => setDeleteRecordTarget(r)}
                          className="text-slate-600 hover:text-red-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setConfirmingClearAll(true)}
                className="text-xs text-slate-600 hover:text-red-400 pt-2 block"
              >
                Clear all history for this item
              </button>
            </>
          )}
        </div>
      </div>

      {deleteRecordTarget && (
        <ConfirmDelete
          title="Remove this purchase record?"
          message={`${deleteRecordTarget.vendor} · ${deleteRecordTarget.qty} · ${
            deleteRecordTarget.date || "no date"
          } will be permanently removed from this item's history. This can't be undone.`}
          onConfirm={() => {
            deleteRecord(deleteRecordTarget.id);
            setDeleteRecordTarget(null);
          }}
          onCancel={() => setDeleteRecordTarget(null)}
        />
      )}

      {confirmingClearAll && (
        <ConfirmDelete
          title="Clear all history for this item?"
          message="Every vendor purchase record for this catalog item is permanently removed, and its Usual Vendor resets until new receipts come in. This can't be undone."
          onConfirm={() => {
            clearAll();
            setConfirmingClearAll(false);
          }}
          onCancel={() => setConfirmingClearAll(false)}
        />
      )}
    </div>
  );
}
export function PullFromReceivingModal({ targetType, targetLabel, target, onApplyToTarget, onClose }) {
  const [queue, setQueue] = useState([]);
  // Same fix as ReceivingApp's queueRef — keeps every mutation reading
  // the truly latest state instead of whatever a given closure happened
  // to capture, which is what was causing the debounced catalog-match
  // update to silently revert the last character typed.
  const queueRef = useRef([]);
  const [catalog, setCatalog] = useState([]);
  const [nameMemory, setNameMemory] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [relinkingLine, setRelinkingLine] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [qResult, cResult, nResult] = await Promise.all([
          getWithRetry(RECEIVING_QUEUE_KEY),
          getWithRetry(CATALOG_KEY),
          getWithRetry(RECEIVING_NAME_MEMORY_KEY),
        ]);
        if (qResult.ok && qResult.value) {
          const loaded = JSON.parse(qResult.value);
          setQueue(loaded);
          queueRef.current = loaded;
        }
        if (cResult.ok && cResult.value) setCatalog(JSON.parse(cResult.value));
        if (nResult.ok && nResult.value) setNameMemory(JSON.parse(nResult.value));
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Local state updates immediately on every call (typing stays
  // responsive, and queueRef.current is always the true latest for
  // anything that reads it mid-typing, like approve()). The actual write
  // to Supabase is debounced instead of firing per call — a name or
  // quantity field calls this on every keystroke, and with no debounce,
  // each keystroke fired its own independent save with no ordering
  // guarantee; a slow connection could let an earlier, half-typed request
  // land *after* the final one and silently overwrite it, so the value
  // that actually persisted was a mid-typing snapshot, not what was last
  // on screen. Waiting for a pause means exactly one save goes out, with
  // whatever queueRef.current holds by then — always the final value.
  const queueSaveTimer = useRef(null);
  const saveQueue = (next) => {
    queueRef.current = next;
    setQueue(next);
    if (queueSaveTimer.current) clearTimeout(queueSaveTimer.current);
    queueSaveTimer.current = setTimeout(() => {
      saveWithRetry(RECEIVING_QUEUE_KEY, JSON.stringify(queueRef.current)).catch(() => {});
    }, 600);
  };

  const learnAlias = (catalogId, aliasText) => {
    if (!catalogId || !aliasText || !aliasText.trim()) return;
    setCatalog((prev) => {
      const next = withLearnedAlias(prev, catalogId, aliasText);
      if (next !== prev) saveWithRetry(CATALOG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  // Same vendor-spend logging as the standalone Receiving screen — see
  // that one for the full explanation.
  const recordVendorPurchases = (lines) => {
    const eligible = lines.filter((l) => l.catalogId && l.vendor && l.vendor.trim() && l.shippedQty > 0);
    if (eligible.length === 0) return;
    setCatalog((prev) => {
      const next = prev.map((c) => {
        const linesForThis = eligible.filter((l) => l.catalogId === c.id);
        if (linesForThis.length === 0) return c;
        const newRecords = linesForThis.map((l) => ({
          id: uniqueId(),
          vendor: l.vendor.trim(),
          qty: l.shippedQty,
          amount: Math.round((l.unitPrice || 0) * l.shippedQty * 100) / 100,
          date: l.receiptDate || new Date().toISOString().slice(0, 10),
        }));
        const updatedHistory = [...(c.vendorHistory || []), ...newRecords];
        return { ...c, vendorHistory: updatedHistory, vendor: computeUsualVendor(updatedHistory) || c.vendor };
      });
      saveWithRetry(CATALOG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const pending = queue.filter((b) => b.status === "pending");
  const selectedBatch = queue.find((b) => b.id === selectedBatchId) || null;

  const updateSelectedBatch = (changes) => {
    // Looked up fresh from queueRef rather than closing over the
    // `selectedBatch` derived value — same fix as ReceivingApp's
    // updateBatch, and for the same reason: a debounced callback can
    // hold onto a closure from before the most recent keystroke landed.
    const current = queueRef.current.find((b) => b.id === selectedBatchId);
    if (!current) return;
    const updated = { ...current, ...changes };
    saveQueue(queueRef.current.map((b) => (b.id === updated.id ? updated : b)));
  };
  const updateLine = (lineId, changes) => {
    const current = queueRef.current.find((b) => b.id === selectedBatchId);
    if (!current) return;
    updateSelectedBatch({
      lines: current.lines.map((l) => (l.id === lineId ? { ...l, ...changes } : l)),
    });
  };

  // Catalog matching waits for a pause in typing instead of re-checking on
  // every keystroke — matching off just the first letter or two almost
  // never finds the right thing, and locking onto that first guess made
  // it impossible to ever find a better one later. Each pause re-evaluates
  // fresh against the *current* full text, and only ever touches an
  // auto-found link — a deliberate pick from the catalog picker
  // (catalogLinkedManually) is never silently replaced or cleared.
  const nameDebounceTimers = useRef({});

  const handleNameChange = (lineId, newName) => {
    updateLine(lineId, { name: newName });
    if (nameDebounceTimers.current[lineId]) clearTimeout(nameDebounceTimers.current[lineId]);
    nameDebounceTimers.current[lineId] = setTimeout(() => {
      const currentBatch = queueRef.current.find((b) => b.id === selectedBatchId);
      const currentLine = currentBatch && currentBatch.lines.find((l) => l.id === lineId);
      if (!currentLine || currentLine.catalogLinkedManually) return;
      const found = findCatalogMatch(currentLine.name, catalog);
      if (found && found.id !== currentLine.catalogId) {
        updateLine(lineId, { catalogId: found.id });
      } else if (!found && currentLine.catalogId) {
        updateLine(lineId, { catalogId: null });
      }
    }, 900);
  };

  const removeLine = (lineId) => {
    updateSelectedBatch({ lines: selectedBatch.lines.filter((l) => l.id !== lineId) });
  };
  const cloneLine = (lineId) => {
    const idx = selectedBatch.lines.findIndex((l) => l.id === lineId);
    if (idx === -1) return;
    const clone = { ...selectedBatch.lines[idx], id: uniqueId() };
    const nextLines = [
      ...selectedBatch.lines.slice(0, idx + 1),
      clone,
      ...selectedBatch.lines.slice(idx + 1),
    ];
    updateSelectedBatch({ lines: nextLines });
  };

  // Only lines nobody's already claimed for a different job/list, and
  // that haven't already been processed, show up here — this is a
  // claiming action scoped to whatever job/list you opened this from,
  // not a takeover of the whole receipt.
  const availableLines = selectedBatch ? selectedBatch.lines.filter((l) => !l.targetId && !l.approved) : [];

  const approve = () => {
    const validLines = availableLines.filter((l) => l.name.trim());
    recordVendorPurchases(validLines);
    let updatedTarget = target;
    validLines.forEach((line) => {
      updatedTarget =
        targetType === "job"
          ? applyReceiptLineToJob(updatedTarget, line, catalog, selectedBatch)
          : applyReceiptLineToLoveList(updatedTarget, line, catalog, selectedBatch);
    });
    if (validLines.length > 0) {
      updatedTarget =
        targetType === "job"
          ? attachReceiptPhotoToJob(updatedTarget, selectedBatch)
          : attachReceiptPhotoToLoveList(updatedTarget, selectedBatch);
    }
    onApplyToTarget(updatedTarget);

    const nextMemory = { ...nameMemory };
    validLines.forEach((line) => {
      if (line.rawName) nextMemory[normalizeText(line.rawName)] = line.name.trim();
    });
    saveWithRetry(RECEIVING_NAME_MEMORY_KEY, JSON.stringify(nextMemory)).catch(() => {});

    playSaveChime();
    // Claimed lines stay on the batch, marked done with exactly which
    // target claimed them — an approved receipt keeps its real contents
    // on record this way, instead of the claimed lines just vanishing.
    const updatedLines = selectedBatch.lines.map((l) =>
      validLines.includes(l) ? { ...l, targetType, targetId: target.id, approved: true } : l
    );
    const stillPending = updatedLines.some((l) => l.name.trim() && !l.approved);
    const updatedBatch = stillPending
      ? { ...selectedBatch, lines: updatedLines }
      : { ...selectedBatch, lines: updatedLines, status: "approved", approvedAt: new Date().toISOString() };
    saveQueue(queueRef.current.map((b) => (b.id === selectedBatch.id ? updatedBatch : b)));
    setConfirmingApprove(false);
    onClose();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Step 1 — pick which pending receipt this is
  if (!selectedBatch) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-8">
        <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <h2 className="text-slate-100 font-semibold text-base">Pull from Receiving</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {pending.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                Nothing waiting in Receiving right now.
              </p>
            ) : (
              <div className="space-y-2">
                {pending.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBatchId(b.id)}
                    className="w-full text-left bg-slate-800/40 border border-slate-800 rounded-lg p-3 hover:border-slate-700 flex items-center gap-3"
                  >
                    {b.photoUrl && (
                      <img src={b.photoUrl} alt="" className="w-11 h-11 rounded-md object-cover border border-slate-800 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-slate-100 truncate">
                        {b.label ? b.label : `${b.lines.length} item${b.lines.length === 1 ? "" : "s"} scanned`}
                      </p>
                      <p className="text-xs text-slate-500">{formatTaskTimestamp(b.scannedAt)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Step 2 — edit lines, then approve straight into this job/list
  return (
    <div className="fixed inset-0 z-[70] bg-slate-950 text-slate-100 overflow-y-auto">
      <header className="border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur z-10">
        <button
          onClick={() => setSelectedBatchId(null)}
          className="text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Back</span>
        </button>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
          <X className="w-5 h-5" />
        </button>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5">
        <p className="text-xs text-slate-500 mb-4">
          Adding to <span className="text-slate-300">{targetLabel}</span> — nothing's added
          until you approve below.
        </p>
        {selectedBatch.photoUrl && (
          <button
            onClick={() => setViewingPhoto(selectedBatch.photoUrl)}
            className="w-full mb-4 rounded-lg overflow-hidden border border-slate-800"
          >
            <img src={selectedBatch.photoUrl} alt="Receipt" className="w-full max-h-48 object-cover" />
          </button>
        )}
        <div className="space-y-2 mb-6">
          {availableLines.map((line) => {
            const match = line.catalogId ? catalog.find((c) => c.id === line.catalogId) : null;
            return (
              <div key={line.id} className="border border-slate-800 rounded-lg p-2.5 bg-slate-900/60">
                <div className="flex items-center gap-2 mb-1.5">
                  <input
                    value={line.name}
                    onChange={(e) => handleNameChange(line.id, e.target.value)}
                    className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                  />
                  <button
                    onClick={() => cloneLine(line.id)}
                    title="Clone this line"
                    className="text-slate-500 hover:text-amber-400 shrink-0 p-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeLine(line.id)}
                    className="text-slate-500 hover:text-red-400 shrink-0 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Shipped</label>
                    <input
                      type="number"
                      min="0"
                      onFocus={selectOnFocus}
                      onClick={selectOnFocus}
                      value={line.shippedQty}
                      onChange={(e) => updateLine(line.id, { shippedQty: Number(e.target.value) || 0 })}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Backorder</label>
                    <input
                      type="number"
                      min="0"
                      onFocus={selectOnFocus}
                      onClick={selectOnFocus}
                      value={line.backorderQty}
                      onChange={(e) => updateLine(line.id, { backorderQty: Number(e.target.value) || 0 })}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-red-500/60"
                    />
                  </div>
                </div>
                {match ? (
                  <button
                    onClick={() => {
                      setRelinkingLine(line);
                      setCatalogSearch("");
                    }}
                    className="text-[11px] text-emerald-400 hover:underline decoration-dotted"
                  >
                    🔗 linked to "{match.name}" · Change
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setRelinkingLine(line);
                      setCatalogSearch("");
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-300 hover:underline decoration-dotted"
                  >
                    No catalog match — 🔍 link manually
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </main>

      <div className="sticky bottom-0 bg-slate-950/95 backdrop-blur border-t border-slate-800 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setConfirmingApprove(true)}
            disabled={!availableLines.some((l) => l.name.trim())}
            className="w-full text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
          >
            Approve &amp; add to {targetLabel}
          </button>
        </div>
      </div>

      {relinkingLine && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold text-sm truncate">
                Link "{relinkingLine.name}" to...
              </h3>
              <button
                onClick={() => {
                  setRelinkingLine(null);
                  setCatalogSearch("");
                }}
                className="text-slate-400 hover:text-slate-200 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 pt-4 shrink-0">
              <input
                autoFocus
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search catalog..."
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {relinkingLine.catalogId && (
                <button
                  onClick={() => {
                    updateLine(relinkingLine.id, { catalogId: null, catalogLinkedManually: false });
                    setRelinkingLine(null);
                    setCatalogSearch("");
                  }}
                  className="w-full text-left text-sm rounded-md px-3 py-2 border border-red-800/40 text-red-400 hover:bg-red-500/10 mb-2"
                >
                  Unlink from catalog
                </button>
              )}
              {catalog
                .filter((c) => c.name.toLowerCase().includes(catalogSearch.trim().toLowerCase()))
                .slice(0, 50)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      updateLine(relinkingLine.id, { catalogId: c.id, catalogLinkedManually: true });
                      learnAlias(c.id, relinkingLine.rawName);
                      setRelinkingLine(null);
                      setCatalogSearch("");
                    }}
                    className="w-full text-left text-sm rounded-md px-3 py-2 border border-slate-800 hover:border-slate-700 mb-1.5"
                  >
                    <p className="text-slate-100">{c.name}</p>
                    <p className="text-xs text-slate-500">
                      {c.storage}
                      {c.needsTransfer ? " · 🚚 needs transfer" : ""}
                    </p>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {viewingPhoto && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center px-4 py-8"
          onClick={() => setViewingPhoto(null)}
        >
          <button
            onClick={() => setViewingPhoto(null)}
            className="absolute top-4 right-4 text-slate-300 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
          <ZoomableImage key={viewingPhoto} src={viewingPhoto} alt="Receipt" />
        </div>
      )}

      {confirmingApprove && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1.5">Approve this receipt?</h3>
            <p className="text-slate-400 text-sm mb-5">
              {availableLines.filter((l) => l.name.trim()).length} item(s) will be added to{" "}
              {targetLabel}. Review carefully — this writes real inventory changes.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingApprove(false)}
                className="flex-1 text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={approve}
                className="flex-1 text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Receipt photos and reference documents (PDFs, submittals) attached to
// a job, a Requisitions category, or a Love List — 'entity'/'field' make
// this generic across whichever record actually owns the document array.
export function ReferenceDocsModal({ entity, entityLabel, isEditor, onUpdateEntity, onClose, field = "referenceDocuments" }) {
  const docs = entity[field] || [];
  const photoDocs = docs.filter((d) => (d.type || "").startsWith("image/"));
  const fileDocs = docs.filter((d) => !(d.type || "").startsWith("image/"));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewingIndex, setViewingIndex] = useState(null);
  const [pdfQueue, setPdfQueue] = useState([]); // PDFs still waiting on a convert-vs-keep decision
  const pdfPrompt = pdfQueue[0] || null;
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const addDoc = (result) => {
    const isPhoto = (result.type || "").startsWith("image/");
    onUpdateEntity((prevEntity) => ({
      ...prevEntity,
      [field]: [
        ...(prevEntity[field] || []),
        {
          id: uniqueId(),
          name: result.name,
          url: result.url,
          path: result.path,
          type: result.type || "",
          uploadedAt: timeStamp(),
        },
      ],
      activityLog: [
        {
          id: uniqueId(),
          time: timeStamp(),
          message: isPhoto ? "Added a photo" : `Uploaded reference document "${result.name}"`,
        },
        ...(prevEntity.activityLog || []),
      ].slice(0, 50),
    }));
  };

  const doUpload = async (file) => {
    const result = await uploadReferenceDocument(entity.id, file);
    if (!result.ok) {
      setUploadError((prev) => (prev ? `${prev} · ${result.error}` : result.error || "Upload failed"));
      return;
    }
    addDoc(result);
  };

  // Handles any number of selected files at once — images upload straight
  // away in sequence, and any PDFs get queued up for their own
  // convert-vs-keep decision, one at a time, since that choice genuinely
  // depends on what each specific PDF actually is.
  const handleFilesChosen = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow choosing the same files again later
    if (files.length === 0) return;

    const pdfs = files.filter((f) => f.type === "application/pdf");
    const others = files.filter((f) => f.type !== "application/pdf");

    if (others.length > 0) {
      setUploadError(null);
      setUploading(true);
      for (const file of others) {
        await doUpload(file);
      }
      setUploading(false);
    }
    if (pdfs.length > 0) setPdfQueue((prev) => [...prev, ...pdfs]);
  };

  const keepPdfAsIs = async () => {
    if (!pdfPrompt) return;
    setPdfQueue((prev) => prev.slice(1));
    setUploadError(null);
    setUploading(true);
    await doUpload(pdfPrompt);
    setUploading(false);
  };

  const convertPdfToPhotos = async () => {
    if (!pdfPrompt) return;
    const file = pdfPrompt;
    setPdfQueue((prev) => prev.slice(1));
    setUploadError(null);
    setUploading(true);
    try {
      const imageFiles = await pdfToImageFiles(file);
      for (const imgFile of imageFiles) {
        const result = await uploadReferenceDocument(entity.id, imgFile);
        if (result.ok) addDoc(result);
      }
    } catch (err) {
      setUploadError(
        "Couldn't convert that PDF — " + (err && err.message ? err.message : String(err))
      );
    }
    setUploading(false);
  };

  const confirmDelete = async () => {
    const doc = deleteTarget;
    setDeleteTarget(null);
    await deleteReferenceDocument(doc.path);
    onUpdateEntity((prevEntity) => ({
      ...prevEntity,
      [field]: (prevEntity[field] || []).filter((d) => d.id !== doc.id),
    }));
  };

  if (viewingIndex !== null) {
    return (
      <PhotoLightbox
        photos={photoDocs.map((d) => ({ url: d.url, alt: "Reference photo" }))}
        index={viewingIndex}
        onIndexChange={setViewingIndex}
        onClose={() => setViewingIndex(null)}
      />
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <div>
              <h2 className="text-slate-100 font-semibold text-base">Reference documents</h2>
              <p className="text-xs text-slate-500">
                Original sheets, orders, drawings, or receipts for {entityLabel}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {docs.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                Nothing here yet — attach the original PDF {entityLabel} came from, or snap
                a photo of a receipt, so it's easy to reference later.
              </p>
            ) : (
              <>
                {fileDocs.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {fileDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-2 border border-slate-800 rounded-md p-3"
                      >
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 min-w-0 flex-1 hover:text-amber-400"
                        >
                          <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                          <span className="text-sm text-slate-100 truncate">{doc.name}</span>
                        </a>
                        {isEditor && (
                          <button
                            onClick={() => setDeleteTarget(doc)}
                            className="text-slate-600 hover:text-red-400 shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {photoDocs.length > 0 && (
                  <div className="grid grid-cols-2 gap-2.5 mb-4">
                    {photoDocs.map((doc) => (
                      <div key={doc.id} className="relative group">
                        <button
                          onClick={() => setViewingIndex(photoDocs.findIndex((d) => d.id === doc.id))}
                          className="block w-full aspect-square rounded-lg overflow-hidden border border-slate-800"
                        >
                          <img src={doc.url} alt="" className="w-full h-full object-cover" />
                        </button>
                        {isEditor && (
                          <button
                            onClick={() => setDeleteTarget(doc)}
                            className="absolute top-1.5 right-1.5 bg-slate-950/80 text-slate-300 hover:text-red-400 rounded-full p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {uploadError && (
              <p className="text-xs text-red-400 mt-3">Couldn't upload: {uploadError}</p>
            )}
          </div>

          {isEditor && (
            <div className="px-5 py-4 border-t border-slate-800 shrink-0 space-y-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFilesChosen}
                className="hidden"
              />
              <button
                onClick={() => photoInputRef.current && photoInputRef.current.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                {uploading ? "Uploading..." : "Take a photo"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                multiple
                onChange={handleFilesChosen}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {uploading ? "Uploading..." : "Upload a file"}
              </button>
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDelete
          title="Remove this document?"
          message={`"${deleteTarget.name}" will be removed. This can't be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {pdfPrompt && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1">
              That's a PDF{pdfQueue.length > 1 ? ` (1 of ${pdfQueue.length})` : ""}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              A phone's "scan to PDF" is usually just a photo wrapped in a PDF — converting
              keeps it easy to zoom into and cuts the file size, with one photo per page. If
              this is a real multi-page document, keeping it as a PDF makes more sense.
              {pdfQueue.length > 1 && " You'll get this same choice for each PDF you picked."}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={convertPdfToPhotos}
                className="w-full text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Convert to photo(s)
              </button>
              <button
                onClick={keepPdfAsIs}
                className="w-full text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Keep as PDF
              </button>
              <button
                onClick={() => setPdfQueue((prev) => prev.slice(1))}
                className="w-full text-xs text-slate-500 hover:text-slate-300"
              >
                Skip this one
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// The "Back up / Restore" control pair, factored out once it was about to
// be copy-pasted onto a sixth screen (Receipt Archive had the original,
// full version). Each caller owns its own backUpNow/handleRestoreFileChosen/
// confirmRestore logic (that part is genuinely domain-specific — different
// storage key, different payload, different validator) and just hands this
// the UI state to render.
export function BackupRestoreBar({
  onBackUp,
  backupDisabled,
  backupTitle,
  onRestoreFileChosen,
  backupNotice,
  restoreError,
  onDismissRestoreError,
  restorePending, // { summary, warning, onConfirm, onCancel } | null
  className = "flex items-center gap-3",
}) {
  const restoreInputRef = useRef(null);
  return (
    <>
      <div className={className}>
        <button
          onClick={onBackUp}
          disabled={backupDisabled}
          title={backupTitle}
          className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
        >
          Back up
        </button>
        <button
          onClick={() => restoreInputRef.current?.click()}
          className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
        >
          Restore
        </button>
        <input
          ref={restoreInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files && e.target.files[0];
            e.target.value = "";
            if (file) onRestoreFileChosen(file);
          }}
        />
      </div>
      {backupNotice && <p className="text-xs text-emerald-400 mt-2">{backupNotice}</p>}
      {restoreError && (
        <p className="text-xs text-red-400 mt-2">
          {restoreError}{" "}
          <button onClick={onDismissRestoreError} className="underline text-red-300">
            Dismiss
          </button>
        </p>
      )}
      {restorePending && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4"
          onClick={restorePending.onCancel}
        >
          <div
            className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-slate-100 font-semibold text-base mb-2">Restore from backup?</h2>
            <p className="text-sm text-slate-400 mb-1">{restorePending.summary}</p>
            <p className="text-sm text-slate-400 mb-4">{restorePending.warning}</p>
            <div className="flex gap-2">
              <button
                onClick={restorePending.onCancel}
                className="flex-1 text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={restorePending.onConfirm}
                className="flex-1 text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

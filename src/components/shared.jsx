import { useState, useEffect, useRef } from "react";
import {
  X,
  Plus,
  Camera,
  ChevronLeft,
  ChevronRight,
  Lock,
  LayoutGrid,
  Briefcase,
  Heart,
  Inbox,
  BookOpen,
  Printer,
} from "lucide-react";
import QRCode from "qrcode";
import { selectOnFocus, uniqueId } from "../lib/utils";
import { uploadReferenceDocument } from "../lib/api";
import { newTool, logToolEvent } from "../lib/tools";

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
  const url = `${window.location.origin}${window.location.pathname}?section=${section}&id=${id}`;
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

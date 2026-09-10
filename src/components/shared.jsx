import { useState, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

// Small, self-contained UI pieces shared across several screens — a
// zoomable full-screen image, a multi-photo lightbox built on top of it,
// a generic "pick one from a flat list" modal shell, and the multi-page
// group-preview stepper used before combining scanned receipt pages.
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

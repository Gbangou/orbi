"""
Orbi Logo Cleanup & Regeneration
- Strips Illustrator artboard guide artifacts (isolated edge pixels)
- Crops to tight content bounding box
- Regenerates all logo variants at proper specs
"""

from PIL import Image, ImageFilter, ImageEnhance
import numpy as np
import os

SRC = "design/logo/clean/orbi-logo-transparent.png"
OUT_DIR = "design/logo/clean"
os.makedirs(OUT_DIR, exist_ok=True)

# Brand color: Orbi blue
ORBI_BLUE = (0, 115, 206)       # primary blue
DARK_BG   = (8, 18, 38)         # deep navy (preview background)
WHITE_BG  = (255, 255, 255)


# ── 1. Load & clean ────────────────────────────────────────────────────────────

def remove_guide_lines(arr: np.ndarray) -> np.ndarray:
    """
    Remove Illustrator artboard guide artifacts.
    Guide pixels are light gray (R≈G≈B > 215, spread < 20).
    Logo pixels are blue (B > R, max-min > 20) so this never touches real content.
    """
    r, g, b, a = arr[:,:,0].astype(int), arr[:,:,1].astype(int), arr[:,:,2].astype(int), arr[:,:,3]
    rgb_min = np.minimum(np.minimum(r, g), b)
    rgb_max = np.maximum(np.maximum(r, g), b)
    # Light gray: all channels bright, very low saturation
    is_gray = (a > 0) & (rgb_min > 215) & ((rgb_max - rgb_min) < 20)
    cleaned = arr.copy()
    cleaned[is_gray] = [0, 0, 0, 0]
    return cleaned


def remove_isolated_pixels(arr: np.ndarray, min_neighbors: int = 1) -> np.ndarray:
    """Zero-out any pixel with fewer than min_neighbors non-transparent 8-directional neighbours."""
    alpha = arr[:, :, 3].astype(np.int32)
    left  = np.zeros_like(alpha); left[:, :-1]  = alpha[:, 1:]
    right = np.zeros_like(alpha); right[:, 1:]  = alpha[:, :-1]
    up    = np.zeros_like(alpha); up[:-1, :]    = alpha[1:, :]
    down  = np.zeros_like(alpha); down[1:, :]   = alpha[:-1, :]
    ul    = np.zeros_like(alpha); ul[:-1, :-1]  = alpha[1:, 1:]
    ur    = np.zeros_like(alpha); ur[:-1, 1:]   = alpha[1:, :-1]
    dl    = np.zeros_like(alpha); dl[1:, :-1]   = alpha[:-1, 1:]
    dr    = np.zeros_like(alpha); dr[1:, 1:]    = alpha[:-1, :-1]
    neighbor_sum = ((left>0).astype(int) + (right>0).astype(int)
                  + (up>0).astype(int)   + (down>0).astype(int)
                  + (ul>0).astype(int)   + (ur>0).astype(int)
                  + (dl>0).astype(int)   + (dr>0).astype(int))
    cleaned = arr.copy()
    cleaned[(alpha > 0) & (neighbor_sum < min_neighbors)] = [0, 0, 0, 0]
    return cleaned


def unmatte_white(arr: np.ndarray) -> np.ndarray:
    """
    Convert baked-in white-matte anti-aliasing to proper alpha transparency.

    The source logo was exported on a white background; edge pixels are
    blue/white mixes stored as opaque RGBA. Formula (per-channel):
        alpha = 1 - min(R,G,B) / 255
        fg_c  = (P_c - (1 - alpha) * 255) / alpha    [clipped to [0,255]]

    This is lossless for solid blue pixels and correctly converts
    near-white edge pixels to the right colour with partial alpha.
    Pure-white areas (interiors that should be transparent) become alpha=0.
    """
    r = arr[:,:,0].astype(np.float32)
    g = arr[:,:,1].astype(np.float32)
    b = arr[:,:,2].astype(np.float32)
    orig_a = arr[:,:,3].astype(np.float32)

    rgb_min = np.minimum(np.minimum(r, g), b)
    new_alpha = 1.0 - rgb_min / 255.0          # 0.0 for white, ~1.0 for solid blue

    # Only process pixels that were non-transparent in the original
    mask = orig_a > 0
    # Avoid division by zero
    safe_alpha = np.where((mask) & (new_alpha > 0), new_alpha, 1.0)

    def unmatte_channel(ch):
        unmatted = (ch - (1.0 - new_alpha) * 255.0) / safe_alpha
        return np.clip(unmatted, 0, 255)

    new_r = np.where(mask & (new_alpha > 0.01), unmatte_channel(r), 0.0)
    new_g = np.where(mask & (new_alpha > 0.01), unmatte_channel(g), 0.0)
    new_b = np.where(mask & (new_alpha > 0.01), unmatte_channel(b), 0.0)
    final_alpha = np.where(mask, (new_alpha * 255.0).clip(0, 255), 0.0)

    result = np.stack([new_r, new_g, new_b, final_alpha], axis=-1).astype(np.uint8)
    return result


def tight_crop(arr: np.ndarray, threshold: int = 30) -> np.ndarray:
    """Crop to the bounding box of non-transparent content."""
    alpha = arr[:, :, 3]
    rows = np.where((alpha > threshold).any(axis=1))[0]
    cols = np.where((alpha > threshold).any(axis=0))[0]
    return arr[rows[0]:rows[-1]+1, cols[0]:cols[-1]+1]


print("Loading source...")
img_src = Image.open(SRC).convert("RGBA")
arr = np.array(img_src)

print(f"Original size: {img_src.size}")

# Step 1: remove gray guide line pixels by color signature
arr = remove_guide_lines(arr)
# Step 2: remove white matte — convert baked-in white anti-aliasing to true alpha
arr = unmatte_white(arr)
# Step 3: clean up any remaining isolated stray pixels
arr = remove_isolated_pixels(arr, min_neighbors=2)
arr = remove_isolated_pixels(arr, min_neighbors=1)

# Crop to real content (now using lower threshold since alpha is properly set)
arr = tight_crop(arr, threshold=10)
print(f"After cleanup & crop: {arr.shape[1]} x {arr.shape[0]}")

logo_clean = Image.fromarray(arr, "RGBA")


# ── 2. Helper: centre logo on canvas ───────────────────────────────────────────

def place_on_canvas(
    logo: Image.Image,
    canvas_size: int,
    padding_pct: float = 0.10,
    bg_color: tuple | None = None,
) -> Image.Image:
    """Place logo centred on a square canvas with uniform padding."""
    pad = int(canvas_size * padding_pct)
    target_w = canvas_size - 2 * pad
    target_h = canvas_size - 2 * pad

    # Scale preserving aspect ratio
    lw, lh = logo.size
    scale = min(target_w / lw, target_h / lh)
    new_w = round(lw * scale)
    new_h = round(lh * scale)
    resized = logo.resize((new_w, new_h), Image.LANCZOS)

    if bg_color:
        canvas = Image.new("RGBA", (canvas_size, canvas_size), (*bg_color, 255))
    else:
        canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))

    x = (canvas_size - new_w) // 2
    y = (canvas_size - new_h) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def sharpen(img: Image.Image, factor: float = 1.3) -> Image.Image:
    """Mild sharpening to restore edge crispness after LANCZOS resize."""
    return ImageEnhance.Sharpness(img).enhance(factor)


# ── 3. Generate all variants ───────────────────────────────────────────────────

outputs = {}

# Full logo – transparent, tight crop, no padding
outputs["orbi-logo-transparent.png"] = logo_clean

# App icon – 1024×1024, ~12% padding, transparent (iOS/general)
icon_1024 = place_on_canvas(logo_clean, 1024, padding_pct=0.12)
icon_1024 = sharpen(icon_1024, 1.2)
outputs["orbi-app-icon-1024-transparent.png"] = icon_1024

# Adaptive icon – 1024×1024, content in safe zone (72% of canvas per Android spec)
# Safe zone = 73% → padding ≈ 13.5%
adaptive = place_on_canvas(logo_clean, 1024, padding_pct=0.135)
adaptive = sharpen(adaptive, 1.2)
outputs["orbi-adaptive-icon-1024-transparent.png"] = adaptive

# Favicon 256 – tight, crisp
favicon_256 = place_on_canvas(logo_clean, 256, padding_pct=0.06)
favicon_256 = sharpen(favicon_256, 1.4)
outputs["orbi-favicon-256-transparent.png"] = favicon_256

# Favicon 64 – small sizes need extra sharpening
favicon_64 = place_on_canvas(logo_clean, 64, padding_pct=0.05)
favicon_64 = sharpen(favicon_64, 1.6)
outputs["orbi-favicon-64-transparent.png"] = favicon_64

# Preview on deep navy – 1024×1024
preview_dark = place_on_canvas(logo_clean, 1024, padding_pct=0.12, bg_color=DARK_BG)
preview_dark = preview_dark.convert("RGB")  # flat, no alpha needed
outputs["orbi-preview-dark.png"] = preview_dark

# Preview on white – useful for print / light contexts
preview_light = place_on_canvas(logo_clean, 1024, padding_pct=0.12, bg_color=WHITE_BG)
preview_light = preview_light.convert("RGB")
outputs["orbi-preview-light.png"] = preview_light

# Social media / OG image – 1200×630 landscape banner
banner_w, banner_h = 1200, 630
pad_banner = int(banner_h * 0.10)
target_h_b = banner_h - 2 * pad_banner
lw, lh = logo_clean.size
scale_b = min((banner_w - 2 * pad_banner) / lw, target_h_b / lh)
new_w_b = round(lw * scale_b)
new_h_b = round(lh * scale_b)
resized_b = logo_clean.resize((new_w_b, new_h_b), Image.LANCZOS)
banner = Image.new("RGB", (banner_w, banner_h), DARK_BG)
banner.paste(resized_b, ((banner_w - new_w_b)//2, (banner_h - new_h_b)//2), resized_b)
outputs["orbi-social-banner-1200x630.png"] = banner


# ── 4. Save all ────────────────────────────────────────────────────────────────

for filename, img in outputs.items():
    path = os.path.join(OUT_DIR, filename)
    img.save(path, "PNG", optimize=True)
    size_kb = os.path.getsize(path) // 1024
    print(f"  OK {filename:50s} {img.size[0]}x{img.size[1]}  {size_kb} KB")

print(f"\nAll clean logos saved to {OUT_DIR}/")

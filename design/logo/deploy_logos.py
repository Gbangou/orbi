"""
Orbi Logo Deployment
Generates every app asset from the clean logo and deploys to both apps.
"""

from PIL import Image, ImageFilter, ImageEnhance
import numpy as np
import os, shutil

CLEAN_DIR   = "design/logo/clean"
RIDER_DIR   = "apps/rider-app"
DRIVER_DIR  = "apps/driver-app"

LOGO_FULL    = f"{CLEAN_DIR}/orbi-logo-transparent.png"   # 925×863, full vertical lockup
LOGO_ICON    = f"{CLEAN_DIR}/orbi-adaptive-icon-1024-transparent.png"  # 1024×1024 transparent

DARK_BG   = (7, 17, 29)    # #07111d — matches app.json backgroundColor

for d in [f"{RIDER_DIR}/assets", f"{DRIVER_DIR}/assets"]:
    os.makedirs(d, exist_ok=True)


# ── helpers ──────────────────────────────────────────────────────────────────

def load(path):
    return Image.open(path).convert("RGBA")


def sharpen(img, factor=1.25):
    return ImageEnhance.Sharpness(img).enhance(factor)


def on_canvas(logo, w, h, padding_pct=0.10, bg=None):
    pad_w = int(w * padding_pct)
    pad_h = int(h * padding_pct)
    target_w = w - 2 * pad_w
    target_h = h - 2 * pad_h
    lw, lh = logo.size
    scale   = min(target_w / lw, target_h / lh)
    new_w, new_h = round(lw * scale), round(lh * scale)
    resized = logo.resize((new_w, new_h), Image.LANCZOS)
    canvas  = Image.new("RGBA", (w, h), (*bg, 255) if bg else (0, 0, 0, 0))
    canvas.paste(resized, ((w - new_w) // 2, (h - new_h) // 2), resized)
    return canvas


def save(img, path, convert_rgb=False):
    if convert_rgb:
        img = img.convert("RGB")
    img.save(path, "PNG", optimize=True)
    kb = os.path.getsize(path) // 1024
    print(f"  OK  {path:65s} {img.size[0]}x{img.size[1]}  {kb} KB")


# ── crop icon mark only (top portion, above the wordmark) ────────────────────

def crop_icon_mark(logo_full_path, padding=20):
    """
    Detect the blank horizontal band between the icon mark and the wordmark,
    then return just the icon mark (top portion).
    """
    img  = load(logo_full_path)
    arr  = np.array(img)
    alpha = arr[:, :, 3]
    h    = arr.shape[0]

    # Row-wise content density: 1 if any pixel has alpha > 30 in that row
    row_has_content = (alpha > 30).any(axis=1)

    # Find the first entirely-empty band after the icon mark begins
    # (i.e., after we've seen some rows with content)
    in_content = False
    gap_start  = None
    for i, has in enumerate(row_has_content):
        if has and not in_content:
            in_content = True
        elif not has and in_content:
            # First empty row after content started — potential gap
            gap_start = i
            break

    if gap_start is None:
        # No gap found; use top 55%
        gap_start = int(h * 0.55)

    # Crop to icon mark + small padding
    top    = np.where(row_has_content[:gap_start])[0]
    if len(top) == 0:
        top_row = 0
    else:
        top_row = max(0, top[0] - padding)
    bottom = gap_start + padding

    # Column bounds
    col_has = (alpha[:gap_start, :] > 30).any(axis=0)
    cols    = np.where(col_has)[0]
    left    = max(0, cols[0] - padding) if len(cols) else 0
    right   = min(arr.shape[1], cols[-1] + 1 + padding) if len(cols) else arr.shape[1]

    cropped = arr[top_row:bottom, left:right]
    return Image.fromarray(cropped, "RGBA")


print("Cropping icon mark ...")
icon_mark = crop_icon_mark(LOGO_FULL)
print(f"  Icon mark size: {icon_mark.size}")
icon_mark.save(f"{CLEAN_DIR}/orbi-icon-mark-transparent.png", "PNG", optimize=True)


# ── load base assets ──────────────────────────────────────────────────────────

logo_full = load(LOGO_FULL)


# ── 1. icon.png  (1024×1024, opaque dark bg, used for iOS + Play Store) ──────

print("\nGenerating icon.png ...")
icon_png = on_canvas(logo_full, 1024, 1024, padding_pct=0.12, bg=DARK_BG).convert("RGB")
icon_png = sharpen(icon_png, 1.2)
for app_dir in [RIDER_DIR, DRIVER_DIR]:
    save(icon_png, f"{app_dir}/icon.png", convert_rgb=False)


# ── 2. adaptive-icon.png  (1024×1024, transparent — Android adaptive fg) ─────

print("\nGenerating adaptive-icon.png ...")
adaptive = on_canvas(logo_full, 1024, 1024, padding_pct=0.135)
adaptive = sharpen(adaptive, 1.2)
for app_dir in [RIDER_DIR, DRIVER_DIR]:
    save(adaptive, f"{app_dir}/adaptive-icon.png")


# ── 3. favicon.png  (32×32, icon mark only on transparent) ───────────────────

print("\nGenerating favicon.png ...")
fav_32 = on_canvas(icon_mark, 32, 32, padding_pct=0.04)
fav_32 = sharpen(fav_32, 1.8)
for app_dir in [RIDER_DIR, DRIVER_DIR]:
    save(fav_32, f"{app_dir}/favicon.png")


# ── 4. splash.png  (1284×2778 — Expo splash) ─────────────────────────────────

print("\nGenerating splash.png ...")
SW, SH = 1284, 2778
# Logo centred vertically, ~35% of screen width
target_logo_w = int(SW * 0.58)
lw, lh = logo_full.size
scale_s = target_logo_w / lw
new_w_s, new_h_s = round(lw * scale_s), round(lh * scale_s)
logo_resized = logo_full.resize((new_w_s, new_h_s), Image.LANCZOS)
logo_resized = sharpen(logo_resized, 1.15)

splash = Image.new("RGB", (SW, SH), DARK_BG)
sx = (SW - new_w_s) // 2
sy = (SH - new_h_s) // 2
splash.paste(logo_resized, (sx, sy), logo_resized)
for app_dir in [RIDER_DIR, DRIVER_DIR]:
    save(splash, f"{app_dir}/splash.png", convert_rgb=False)


# ── 5. In-app logo assets for React Native ───────────────────────────────────

print("\nDeploying in-app logo assets ...")

# Full vertical logo (icon mark + wordmark) — used in screens
in_app_full = on_canvas(logo_full, 512, 480, padding_pct=0.04)
for app_dir in [RIDER_DIR, DRIVER_DIR]:
    save(in_app_full, f"{app_dir}/assets/orbi-logo.png")

# Icon mark only — used for horizontal layouts and nav headers
in_app_mark = on_canvas(icon_mark, 256, 256, padding_pct=0.04)
for app_dir in [RIDER_DIR, DRIVER_DIR]:
    save(in_app_mark, f"{app_dir}/assets/orbi-icon.png")

print("\nDone. All assets deployed.")

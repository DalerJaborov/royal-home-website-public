"""Regenerate PWA icons: transparent background, logo cropped tight (larger/more prominent).
Source: public/images/logo_royal.png (highest-res original emblem).
Outputs: public/pwa-icon-192.png, public/pwa-icon-512.png (transparent, "any" purpose)
         public/pwa-icon-512-maskable.png (solid bg + safe-zone padding, for Android adaptive icons)
"""
from PIL import Image, ImageDraw, ImageFilter
import colorsys

SRC = "public/images/logo_royal.png"
MASKABLE_BG = (15, 46, 34, 255)  # matches manifest background_color #0f2e22

im = Image.open(SRC).convert("RGB")
w, h = im.size
px = im.load()

# Find the bright gold RING specifically (strict threshold) to locate its
# geometric center/radius -- the ambient background glow is gold-ish too but
# noticeably less bright/saturated than the metallic ring itself.
ring_mask = Image.new("L", (w, h), 0)
rpx = ring_mask.load()
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if 0.08 < hh < 0.18 and s > 0.55 and v > 0.75:
            rpx[x, y] = 255

bbox = ring_mask.getbbox()
if not bbox:
    raise SystemExit("Could not detect logo ring bounding box")

x0, y0, x1, y1 = bbox
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
radius = max(x1 - x0, y1 - y0) / 2 * 1.10  # ring radius + small breathing room

# Crop square around the detected circle so the logo fills the frame.
crop_half = radius * 1.04
cx0, cy0 = int(cx - crop_half), int(cy - crop_half)
cx1, cy1 = int(cx + crop_half), int(cy + crop_half)
cx0, cy0 = max(0, cx0), max(0, cy0)
cx1, cy1 = min(w, cx1), min(h, cy1)

crop = im.crop((cx0, cy0, cx1, cy1)).convert("RGBA")
cw, ch = crop.size

# Clean circular alpha mask (feathered edge) centered on the same circle,
# in crop-local coordinates.
local_cx, local_cy = cx - cx0, cy - cy0
local_r = radius

circle_mask = Image.new("L", (cw, ch), 0)
draw = ImageDraw.Draw(circle_mask)
draw.ellipse(
    [local_cx - local_r, local_cy - local_r, local_cx + local_r, local_cy + local_r],
    fill=255,
)
circle_mask = circle_mask.filter(ImageFilter.GaussianBlur(1.2))

crop.putalpha(circle_mask)

def save_square(img_rgba, size, path):
    resized = img_rgba.resize((size, size), Image.LANCZOS)
    resized.save(path)
    print("wrote", path, resized.size)

save_square(crop, 512, "public/pwa-icon-512.png")
save_square(crop, 192, "public/pwa-icon-192.png")

# Maskable variant: solid brand background + safe-zone padding so Android's
# adaptive-icon shape mask doesn't clip the emblem.
size = 512
pad = int(size * 0.14)
canvas = Image.new("RGBA", (size, size), MASKABLE_BG)
inner = size - pad * 2
logo_resized = crop.resize((inner, inner), Image.LANCZOS)
canvas.alpha_composite(logo_resized, (pad, pad))
canvas.convert("RGB").save("public/pwa-icon-512-maskable.png")
print("wrote public/pwa-icon-512-maskable.png", canvas.size)

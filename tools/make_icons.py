"""
Genera los iconos PNG de la PWA.

Dibuja una hoja/llama estilizada sobre un cuadrado con degradado verde,
en las variantes que pide Android e iOS:

    icons/icon-192.png        icono normal
    icons/icon-512.png        icono normal grande
    icons/maskable-512.png    con margen de seguridad para el recorte de Android
    icons/apple-touch-icon.png

Uso:  python tools/make_icons.py
"""

from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"

BG_TOP = (26, 189, 105)
BG_BOTTOM = (10, 130, 66)
LEAF = (255, 255, 255)
LEAF_SHADE = (222, 248, 233)


def vertical_gradient(size, top, bottom):
    """Cuadrado con degradado vertical."""
    img = Image.new("RGB", (1, size), top)
    px = img.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        px[0, y] = (
            round(top[0] + (bottom[0] - top[0]) * t),
            round(top[1] + (bottom[1] - top[1]) * t),
            round(top[2] + (bottom[2] - top[2]) * t),
        )
    return img.resize((size, size), Image.NEAREST)


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def draw_leaf(img, cx, cy, r):
    """Hoja simetrica: dos arcos que se cortan, con el nervio central."""
    d = ImageDraw.Draw(img)

    # Cuerpo de la hoja, como interseccion de dos circulos.
    layer = Image.new("L", img.size, 0)
    ld = ImageDraw.Draw(layer)
    off = r * 0.62
    ld.ellipse([cx - off - r * 0.5, cy - r, cx + off + r * 0.5 - r * 0.62, cy + r], fill=255)

    layer2 = Image.new("L", img.size, 0)
    ld2 = ImageDraw.Draw(layer2)
    ld2.ellipse([cx - off - r * 0.5 + r * 0.62, cy - r, cx + off + r * 0.5, cy + r], fill=255)

    from PIL import ImageChops
    leaf_mask = ImageChops.multiply(layer, layer2)

    # La hoja se inclina un poco para que no parezca un ojo.
    leaf_mask = leaf_mask.rotate(-22, resample=Image.BICUBIC, center=(cx, cy))

    solid = Image.new("RGB", img.size, LEAF)
    img.paste(solid, (0, 0), leaf_mask)

    # Nervio central.
    d.line(
        [(cx - r * 0.42, cy + r * 0.46), (cx + r * 0.30, cy - r * 0.52)],
        fill=BG_BOTTOM,
        width=max(2, int(r * 0.10)),
    )


def build(size, padding_ratio, radius_ratio, rounded=True):
    img = vertical_gradient(size, BG_TOP, BG_BOTTOM).convert("RGBA")
    inner = size * (1 - padding_ratio * 2)
    draw_leaf(img, size / 2, size / 2, inner * 0.34)

    if rounded:
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), rounded_mask(size, int(size * radius_ratio)))
        return out
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # Iconos normales: esquinas redondeadas suaves.
    build(192, 0.10, 0.22).save(OUT / "icon-192.png")
    build(512, 0.10, 0.22).save(OUT / "icon-512.png")

    # Maskable: el sistema recorta hasta un 20 %, asi que el dibujo va mas pequeno
    # y el fondo llega a los bordes sin redondear.
    build(512, 0.22, 0, rounded=False).save(OUT / "maskable-512.png")

    # iOS no aplica transparencia ni redondeo propio sobre PNG con alfa.
    build(180, 0.10, 0.22, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png")

    for f in sorted(OUT.iterdir()):
        print(f"  {f.name:24} {f.stat().st_size / 1024:6.1f} KB")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Generate icon.png for ActionsBoard-Duo.

Duo series icon grammar (see ~/workspace/projects/common-design/GUIDE.md):
  - ground: deep blue #1E4A7A (fixed for the whole Duo series), rounded
    square, corner radius ~22% (rx=118 on the 512 master)
  - motif: white only, drawn left of / above the badge
  - accent: exactly one — the coral #E86A4A signal badge at bottom-right,
    centre (408,408) on the 512 master, geometry taken verbatim from
    common-design/templates/duo-icon.svg (outer ring r=86 in the ground
    colour, coral disc r=78, white fan: arcs r=69/48/27 around (0,36)
    with stroke 12 and round caps, dot r=10 at (0,36))

Motif: three rows of (bar + status circle) — the board's watched
workflows and their latest state. The rows are a touch smaller/thinner
than the first drawing and are centred as a group on the canvas: the
middle row sits exactly on the vertical centre line (y=256).

Drawn at 4x the 512 master (2048) and downscaled to 256x256, the size
this repository ships.
"""

import math

from PIL import Image, ImageDraw

MASTER = 512
SS = 4  # supersampling over the master
OUT = 256

GROUND = (0x1E, 0x4A, 0x7A)
CORAL = (0xE8, 0x6A, 0x4A)
WHITE = (0xFF, 0xFF, 0xFF)

BADGE_CX, BADGE_CY = 408, 408  # master coordinates, fixed by the kit

ROWS_Y = (168, 256, 344)  # middle row on the centre line, group centred
BAR_X0, BAR_X1, BAR_H = 80, 248, 32
CIRCLE_CX, CIRCLE_R = 296, 29


def s(v: float) -> float:
    """Master units -> drawing units."""
    return v * SS


def main() -> None:
    img = Image.new("RGBA", (MASTER * SS, MASTER * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Ground: full-bleed rounded square, rx ~22% of 512 = 118.
    d.rounded_rectangle([0, 0, s(MASTER), s(MASTER)], radius=s(118), fill=GROUND + (255,))

    # Motif: white bars (capsules) and status circles, one row per row centre.
    for y in ROWS_Y:
        d.rounded_rectangle(
            [s(BAR_X0), s(y - BAR_H / 2), s(BAR_X1), s(y + BAR_H / 2)],
            radius=s(BAR_H / 2),
            fill=WHITE + (255,),
        )
        d.ellipse(
            [s(CIRCLE_CX - CIRCLE_R), s(y - CIRCLE_R), s(CIRCLE_CX + CIRCLE_R), s(y + CIRCLE_R)],
            fill=WHITE + (255,),
        )

    # Signal badge — geometry verbatim from templates/duo-icon.svg.
    bx, by = s(BADGE_CX), s(BADGE_CY)
    d.ellipse([bx - s(86), by - s(86), bx + s(86), by + s(86)], fill=GROUND + (255,))
    d.ellipse([bx - s(78), by - s(78), bx + s(78), by + s(78)], fill=CORAL + (255,))

    # White fan: three arcs around the local point (0, 36), radii 69/48/27,
    # spanning 205..335 degrees (PIL convention: 0 at 3 o'clock, clockwise,
    # y down) — the same span as the kit's arc paths — stroke 12, round caps.
    fan_cx, fan_cy = bx, by + s(36)
    for r in (69, 48, 27):
        pts = []
        a = 205.0
        while a <= 335.0:
            rad = math.radians(a)
            pts.append((fan_cx + s(r) * math.cos(rad), fan_cy + s(r) * math.sin(rad)))
            a += 1.0
        d.line(pts, fill=WHITE + (255,), width=int(s(12)), joint="curve")
        for px, py in (pts[0], pts[-1]):
            cap = s(6)
            d.ellipse([px - cap, py - cap, px + cap, py + cap], fill=WHITE + (255,))
    d.ellipse([fan_cx - s(10), fan_cy - s(10), fan_cx + s(10), fan_cy + s(10)], fill=WHITE + (255,))

    img = img.resize((OUT, OUT), Image.LANCZOS)
    img.save("icon.png")
    print(f"icon.png written ({OUT}x{OUT})")


if __name__ == "__main__":
    main()

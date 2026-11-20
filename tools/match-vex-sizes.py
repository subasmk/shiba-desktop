#!/usr/bin/env python3
"""Match every Vex animation's figure size in 6-sprites-vex.png.

Subash (Nov 20 2026): 'Check every gif size and match everyone size.'
Each vex-* animation was sliced from a different GIF export, so the
figure's height inside its 320px cell drifted (wave 258px, drop 212px,
idle 228px) and the pet visibly grew and shrank whenever the animation
changed. This script measures every animation's median content height,
then scales each animation's frames by ONE factor (target / median, so
the motion inside a clip is untouched) around each frame's own
bottom-centre point - feet stay planted, a hover stays hovering - and
rewrites the sheet in place. manifest.json rects do not change.

Run from the repo root:  python3 tools/match-vex-sizes.py [target_px]
Re-running is safe: once matched, every median already equals the
target and the factors come out ~1.0.
"""
import json
import statistics
import sys

from PIL import Image

TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 230
CELL = 320
ALPHA_MIN = 40  # same threshold the app's silhouette gate uses


def content_bbox(cell):
    alpha = cell.getchannel('A').point(lambda a: 255 if a > ALPHA_MIN else 0)
    return alpha.getbbox()


def measure(sheet, frames):
    boxes = []
    for f in frames:
        cell = sheet.crop((f['x'], f['y'], f['x'] + CELL, f['y'] + CELL))
        bb = content_bbox(cell)
        boxes.append(bb)
    heights = [bb[3] - bb[1] for bb in boxes if bb]
    return boxes, (statistics.median(heights) if heights else 0)


def main():
    sheet = Image.open('6-sprites-vex.png').convert('RGBA')
    manifest = json.load(open('manifest.json'))
    out = sheet.copy()
    print(f"{'anim':16} {'before':>6} {'factor':>6} {'after':>6}")
    for name in sorted(manifest):
        if not name.startswith('vex-'):
            continue
        frames = manifest[name]
        boxes, median_h = measure(sheet, frames)
        if not median_h:
            continue
        factor = TARGET / median_h
        for f, bb in zip(frames, boxes):
            if not bb:
                continue
            cell = sheet.crop((f['x'], f['y'], f['x'] + CELL, f['y'] + CELL))
            content = cell.crop(bb)
            bw, bh = bb[2] - bb[0], bb[3] - bb[1]
            s = min(factor, (CELL - 4) / bw, (CELL - 4) / bh)
            sw, sh = max(1, round(bw * s)), max(1, round(bh * s))
            scaled = content.resize((sw, sh), Image.LANCZOS)
            cx = (bb[0] + bb[2]) / 2
            left = min(max(0, round(cx - sw / 2)), CELL - sw)
            top = min(max(0, bb[3] - sh), CELL - sh)
            new_cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
            new_cell.alpha_composite(scaled, (left, top))
            out.paste(new_cell, (f['x'], f['y']))
        _, after_h = measure(out, frames)
        print(f"{name:16} {median_h:6.0f} {factor:6.3f} {after_h:6.0f}")
    out.save('6-sprites-vex.png')
    print('sheet rewritten; manifest rects unchanged')


if __name__ == '__main__':
    main()

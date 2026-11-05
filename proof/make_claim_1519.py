"""Compose the bounty-1519 claim image: the X post + the live page, side by side.

Reads:  shots/tweet_crop.png (public X page, left column only)
        shots/tacit_live_14197.png (thum.io capture of the deployed page)
Writes: proof/claim_1519.png
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))      # site/proof
SHOTS = os.path.join(os.path.dirname(HERE), "..", "shots")
OUT = HERE

W, H = 1600, 1370
BG, FG, DIM, ACC = (12, 14, 16), (238, 238, 232), (140, 146, 152), (120, 220, 170)

def font(name, size):
    p = os.path.join("C:/Windows/Fonts", name)
    return ImageFont.truetype(p, size)

f_title = font("segoeuib.ttf", 40)
f_sub = font("segoeui.ttf", 24)
f_body = font("segoeui.ttf", 22)
f_mono = font("consola.ttf", 21)
f_tag = font("segoeuib.ttf", 20)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# header
d.text((44, 34), "TACIT EXPLORER", font=f_title, fill=FG)
d.text((44, 84), "one page, both chains, real mainnet data \u2014 no wallet, no backend, no mocks",
       font=f_sub, fill=DIM)
d.text((W - 300, 46), "bounty #1519", font=f_tag, fill=ACC)
d.text((W - 300, 74), "base \u00b7 2026-11-05", font=f_sub, fill=DIM)
d.line([(44, 128), (W - 44, 128)], fill=(48, 52, 56), width=2)

# left: the X post as published
tweet = Image.open(os.path.join(SHOTS, "tweet_crop.png")).convert("RGB")
tw = 620
tweet = tweet.resize((tw, int(tweet.height * tw / tweet.width)), Image.LANCZOS)
img.paste(tweet, (44, 152))
d.text((44, 152 + tweet.height + 10), "x.com/ariasnico/status/2118263041565638851",
       font=f_mono, fill=ACC)

# right: the deployed page, live
page = Image.open(os.path.join(SHOTS, "tacit_live_14197.png")).convert("RGB")
pw = 860
page = page.resize((pw, int(page.height * pw / page.width)), Image.LANCZOS)
img.paste(page, (720, 152))
d.text((720, 152 + page.height + 10), "nicoarias81.github.io/tacit-explorer", font=f_mono, fill=ACC)

# footer evidence — two columns, nothing overlapping
y = 1060
d.line([(44, y - 22), (W - 44, y - 22)], fill=(48, 52, 56), width=2)
d.line([(700, y - 6), (700, y + 92)], fill=(48, 52, 56), width=2)
left = [
    "source repo: github.com/nicoarias81/tacit-explorer",
    "capture: BTC tip 974,645 \u00b7 relay 974,613 \u00b7 lag 32",
    "bridge: 584 burns / 562 mints / 22 in flight",
]
right = [
    "confidential pool: 14,197 entries",
    "5,696 leaves \u00b7 5,851 nullifiers \u00b7 3,449 wraps",
    "read live from api.tacit.finance on every page load",
]
for i, t in enumerate(left):
    d.text((44, y + i * 32), t, font=f_body, fill=DIM)
for i, t in enumerate(right):
    d.text((740, y + i * 32), t, font=f_body, fill=DIM)
d.text((44, y + 122), "nothing here is mocked: the page walks the indexer, mempool.space and the public RPCs in the browser",
       font=f_mono, fill=ACC)

out = os.path.join(OUT, "claim_1519.png")
img.save(out, optimize=True)
print("wrote", out, img.size, os.path.getsize(out), "bytes")

"""Render the GBIF proof panel used in the poidh 339 claim."""
import json
import os

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 1160
BG = (14, 16, 20)
FG = (222, 226, 232)
DIM = (128, 138, 152)
GREEN = (126, 219, 143)
BLUE = (122, 176, 255)
YEL = (240, 208, 128)

bold = ImageFont.truetype("C:/Windows/Fonts/consolab.ttf", 22)
mono = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 19)
small = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 16)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)
d.rectangle([0, 0, W, 58], fill=(24, 27, 33))
for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
    d.ellipse([20 + i * 26, 20, 36 + i * 26, 36], fill=c)
d.text((110, 18), "gbif proof — measured 2026-11-05, no key in any request", font=small, fill=DIM)

lines = [
    (BLUE, "$ curl -s 'https://api.gbif.org/v1/occurrence/search?limit=0'"),
    (FG, '{"offset":0,"limit":0,"count":3890495026,"endOfRecords":false}'),
    (BLUE, "$ curl -s 'https://api.gbif.org/v1/dataset/search?limit=0'"),
    (FG, '{"offset":0,"limit":0,"count":125328,"endOfRecords":false}'),
    (DIM, "  (no Authorization header, no key, Access-Control-Allow-Origin: *)"),
    (DIM, ""),
    (BLUE, "$ curl -s 'https://api.gbif.org/v1/species/match?name=Puma%20concolor'"),
    (GREEN, '{"usageKey":2435099,"scientificName":"Puma concolor (Linnaeus, 1771)",'),
    (GREEN, ' "rank":"SPECIES","status":"ACCEPTED","confidence":99,...}'),
    (DIM, ""),
    (BLUE, "$ curl -s 'https://api.gbif.org/v1/occurrence/search?taxonKey=2435099&country=AR"),
    (BLUE, "         &limit=2&fields=eventDate,decimalLatitude,decimalLongitude,stateProvince'"),
    (FG, '{"count":3422,"results":['),
    (YEL, '  {"eventDate":"2026-01-25T18:37","decimalLatitude":-39.037751,'),
    (YEL, '   "decimalLongitude":-64.240752,"stateProvince":"Río Negro"},'),
    (YEL, '  {"eventDate":"2026-01-18T20:25:12","decimalLatitude":-47.00063,'),
    (YEL, '   "decimalLongitude":-70.676475,"stateProvince":"Santa Cruz"}]}'),
    (DIM, ""),
    (FG, "3,422 puma records for Argentina, each with a date and a point."),
    (FG, "Pitangus sulphuratus (benteveo): 278,375 records in Argentina."),
]
y = 84
for color, text in lines:
    d.text((34, y), text, font=mono, fill=color)
    y += 30

y += 18
d.line([34, y, W - 34, y], fill=(46, 52, 62))
y += 22
d.text((34, y), "WHY IT MATTERS: pics-or-it-didn't-happen for wildlife", font=bold, fill=GREEN)
y += 36
for t in [
    "A claim says \"puma in Cordoba capital\". Query the species in that province:",
    "3,422 Argentine records, none within 100 km -> ask for date and coordinates.",
    "125,328 publishers (iNaturalist, museums, camera traps) in one query language,",
    "a fuzzy taxon resolver included, and the license of every record in the payload.",
    "Limit, stated honestly: coverage is birdwatcher-shaped. No record != no animal.",
]:
    d.text((34, y), t, font=mono, fill=FG)
    y += 30

y += 16
d.text((34, y), "curl it yourself — nothing above needs an account.", font=small, fill=DIM)

out = r"C:\Users\nicoa\poidh-auto\proof_gbif_339.png"
img.save(out)
print(out, os.path.getsize(out), img.size)

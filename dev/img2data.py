# img2data.py
# Converts an image into binary data
#
# 2025-07-20

from PIL import Image

FONT_SRC_PATH = "../assets/font.png"
FONT_DAT_PATH = "../data/font.bin"


def convert_image(path: str, save_to: str) -> None:
    img = Image.open(path)

    rawdata = []
    data = []
    width, height = img.size
    for ty in range(height // 8):
        for tx in range(width // 8):
            tile = []
            for y in range(8):
                strip = 0
                for x in range(8):
                    r, _, _, _ = img.getpixel((tx * 8 + x, ty * 8 + y))
                    bit = 1 if r > 127 else 0
                    strip = (strip << 1) | bit

                tile.append(strip)
                rawdata.append(strip)

            data.append(tile)

    with open(save_to, "wb") as f:
        b = bytes(rawdata)
        f.write(b)


#    print("[")
#   for i, tile in enumerate(data):
#      as_str = ", ".join(map(lambda c: f"0x{c:02x}", tile))
#     print(f"{as_str}, /* {chr(i)} */")


def main() -> None:
    convert_image(FONT_SRC_PATH, FONT_DAT_PATH)


if __name__ == "__main__":
    main()

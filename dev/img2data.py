# img2data.py
# Converts an image into binary data
#
# 2025-07-20

from PIL import Image

FONT_PATH = "../assets/font.png"


def convert_image(path: str) -> None:
    img = Image.open(path)

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
            data.append(tile)

    print("[")
    for i, tile in enumerate(data):
        as_str = ", ".join(map(lambda c: f"0x{c:02x}", tile))
        print(f"{as_str}, /* {chr(i)} */")


def main() -> None:
    convert_image(FONT_PATH)


if __name__ == "__main__":
    main()

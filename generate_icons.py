import os
from PIL import Image, ImageDraw, ImageFont

build_dir = r"c:\Users\Administrator\Desktop\momo\build"
os.makedirs(build_dir, exist_ok=True)

size = 512
img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# 1. Background Rounded Rectangle with Blue Gradient
# Draw rounded rect
corner_radius = 110

# Create gradient mask
gradient = Image.new("RGBA", (size, size), (0, 0, 0, 0))
g_draw = ImageDraw.Draw(gradient)

for y in range(size):
    # Gradient from #2563eb to #1d4ed8
    r = int(37 + (29 - 37) * (y / size))
    g = int(99 + (78 - 99) * (y / size))
    b = int(235 + (216 - 235) * (y / size))
    g_draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

# Mask with rounded rectangle
mask = Image.new("L", (size, size), 0)
m_draw = ImageDraw.Draw(mask)
m_draw.rounded_rectangle([(16, 16), (size - 16, size - 16)], radius=corner_radius, fill=255)

# Composite gradient into img
img.paste(gradient, (0, 0), mask)

# 2. Draw subtle border & inner glow
draw.rounded_rectangle([(16, 16), (size - 16, size - 16)], radius=corner_radius, outline=(255, 255, 255, 60), width=4)

# 3. Draw stylized bold "M"
# Points for thick modern 'M'
m_color = (255, 255, 255, 255)
# Left pillar
draw.rounded_rectangle([(120, 150), (165, 370)], radius=12, fill=m_color)
# Right pillar
draw.rounded_rectangle([(347, 150), (392, 370)], radius=12, fill=m_color)

# Center diagonal left
draw.polygon([(140, 150), (256, 275), (256, 310), (165, 175), (140, 150)], fill=m_color)
# Center diagonal right
draw.polygon([(372, 150), (256, 275), (256, 310), (347, 175), (372, 150)], fill=m_color)

# 4. Draw sparkling memory dot / node at top right
sparkle_color = (253, 224, 71, 255) # Bright yellow sparkle
draw.ellipse([(380, 105), (425, 150)], fill=sparkle_color)
draw.ellipse([(390, 115), (415, 140)], fill=(255, 255, 255, 255))

# Save PNG
png_path = os.path.join(build_dir, "icon.png")
img.save(png_path, "PNG")
print(f"Generated {png_path}")

# Save Windows Multi-resolution ICO
ico_path = os.path.join(build_dir, "icon.ico")
img.save(ico_path, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(f"Generated {ico_path}")

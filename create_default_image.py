from PIL import Image, ImageDraw, ImageFont
import os

# Create directory if it doesn't exist
os.makedirs("static/images", exist_ok=True)

# Create a new image with a light gray background
img = Image.new('RGB', (512, 512), color=(240, 240, 240))
draw = ImageDraw.Draw(img)

# Try to use a system font, fall back to default if not available
try:
    font = ImageFont.truetype("arial.ttf", 20)
except IOError:
    font = ImageFont.load_default()

# Add text to the image
text = "No satellite image available"
textwidth, textheight = draw.textsize(text, font=font) if hasattr(draw, 'textsize') else (200, 20)
x = (512 - textwidth) // 2
y = (512 - textheight) // 2

# Draw text in the center
draw.text((x, y), text, font=font, fill=(100, 100, 100))

# Add a border
draw.rectangle([(0, 0), (511, 511)], outline=(200, 200, 200), width=2)

# Save the image
img.save("static/images/default_satellite.png")

print("Default satellite image created at static/images/default_satellite.png") 
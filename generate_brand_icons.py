from PIL import Image, ImageDraw

def generate_logo():
    # Dimensions
    width, height = 1024, 1024
    
    # 1. Create transparent base image
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    
    # 2. Draw rounded rectangle background (Squircle shape)
    # Background color is #051126 (rich dark navy)
    bg_color = (5, 17, 38, 255)
    
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([32, 32, 992, 992], radius=220, fill=bg_color)
    
    # 3. Create a mask for the green logo
    mask = Image.new("L", (width, height), 0)
    mask_draw = ImageDraw.Draw(mask)
    
    # Scale and offset mapping to center the logo perfectly
    S = 8.5
    OX = (width - 100 * S) / 2
    OY = (height - 100 * S) / 2
    
    def scale_point(pt):
        return (OX + pt[0] * S, OY + pt[1] * S)
    
    # V-shape path
    v_path = [(15, 15), (32, 15), (50, 60), (68, 15), (85, 15), (50, 90)]
    v_scaled = [scale_point(pt) for pt in v_path]
    mask_draw.polygon(v_scaled, fill=255)
    
    # House outer shape with chimney
    house_path = [
        (50, 22), (37, 34), (41, 34), (41, 52), (59, 52), (59, 34), (63, 34),
        (58, 29.4), (58, 23), (55.5, 23), (55.5, 27)
    ]
    house_scaled = [scale_point(pt) for pt in house_path]
    mask_draw.polygon(house_scaled, fill=255)
    
    # 4. Generate the green linear gradient (diagonal)
    # Start: #10b981 = (16, 185, 129)
    # End: #14452F = (20, 69, 47)
    c1 = (16, 185, 129)
    c2 = (20, 69, 47)
    c_mid = ((c1[0] + c2[0]) // 2, (c1[1] + c2[1]) // 2, (c1[2] + c2[2]) // 2)
    
    grad_small = Image.new("RGBA", (2, 2))
    grad_small.putpixel((0, 0), c1 + (255,))
    grad_small.putpixel((1, 0), c_mid + (255,))
    grad_small.putpixel((0, 1), c_mid + (255,))
    grad_small.putpixel((1, 1), c2 + (255,))
    
    grad_img = grad_small.resize((width, height), Image.Resampling.BILINEAR)
    
    # 5. Composite the gradient using the mask
    logo_img = Image.new("RGBA", (width, height))
    logo_img.paste(grad_img, (0, 0), mask)
    
    # 6. Draw the window panes on top of the logo image
    logo_draw = ImageDraw.Draw(logo_img)
    
    window_panes = [
        # Top-left
        ((47.5, 42.5), (49.5, 44.5)),
        # Top-right
        ((50.5, 42.5), (52.5, 44.5)),
        # Bottom-left
        ((47.5, 45.5), (49.5, 47.5)),
        # Bottom-right
        ((50.5, 45.5), (52.5, 47.5)),
    ]
    
    for p1, p2 in window_panes:
        p1_scaled = scale_point(p1)
        p2_scaled = scale_point(p2)
        logo_draw.rectangle([p1_scaled[0], p1_scaled[1], p2_scaled[0], p2_scaled[1]], fill=bg_color)
        
    # 7. Composite the logo on the background
    final_img = Image.alpha_composite(img, logo_img)
    
    # Save the files
    final_img.save("frontend/public/logo.png", format="PNG")
    print("Saved logo.png")
    
    # Resize and save other formats
    final_img.resize((192, 192), Image.Resampling.LANCZOS).save("frontend/public/icons/icon-192.png", format="PNG")
    print("Saved icon-192.png")
    final_img.resize((512, 512), Image.Resampling.LANCZOS).save("frontend/public/icons/icon-512.png", format="PNG")
    print("Saved icon-512.png")
    final_img.resize((180, 180), Image.Resampling.LANCZOS).save("frontend/public/apple-icon.png", format="PNG")
    print("Saved apple-icon.png")

if __name__ == "__main__":
    generate_logo()

# Piuma

Lighter pictures for Cleitext, free.

- **New pictures**: when a picture is uploaded, it is made smaller if it is larger than needed (2560 pixels on the longest side by default) and saved again with good compression (quality 82 for JPEG and WebP; PNG stays lossless). PNG photos without transparency become JPEG when that is much lighter; logos and screenshots stay PNG. A picture already light is left as it is.
- **The library**: the pictures already uploaded are made lighter in the background, a few each minute, with the space saved shown. Their addresses do not change, so pages keep working.

Cleitext itself removes the camera data (GPS position, camera, date) from uploaded photos and makes the WebP and AVIF copies pages use: Piuma works on the original files.

Settings: **Media → Lighter pictures**. Needs Cleitext 0.120 or later (plugin API 1.82).

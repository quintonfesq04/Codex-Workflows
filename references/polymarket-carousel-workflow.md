# Polymarket Baseball Carousel Workflow

Use this reference when a user asks for a Polymarket baseball Instagram carousel, drops a brief with team colors and slide copy, or asks for a new carousel from player/team images.

## Production Rules

- Build 4:5 Instagram carousel graphics only.
- Export every slide as a 1080x1350 PNG.
- Use provided images in the exact order supplied unless the user explicitly says otherwise.
- If the user provides a separate cover image plus slide images, use the cover image for `01_cover.png` and the following images for slides in order.
- If the user provides one image per slide and no separate cover image, use the first image for the cover and slide 1 only when needed.
- Always include one meme still slide unless the user explicitly says not to.
- Ignore video files for meme slides.
- Do not verify stats if the user already supplied final copy and bottom stat lines.
- Save the finished post in a dedicated folder and mirror the finished folder into `Documents` when running locally.

## Cover Style

- Use a full-bleed sports image.
- Center the player and push the face/upper body into the top 55-60% of the frame.
- Keep the headline centered across the bottom third.
- No subtext unless explicitly requested.
- No outline, shadow, or backdrop on cover headline text.
- Use bold condensed sports type.
- Cover headlines should be no more than two lines unless the brief requires a three-line concept.
- Preferred current look: smaller top line, bigger hook word on the bottom line.
- Use a deep, vivid gradient behind the headline. It should feel solid at the bottom and fade cleanly upward.
- Rotate between team-color gradient and black-gradient cover styles when appropriate.
- For black-gradient covers, make the strongest hook word a team color when contrast works.
- Keep the Polymarket logo small and readable in a top corner. Move it right if the left side is visually busy.

## Info Slide Style

- Top text block is white, tight, and centered.
- Top white band should be around 18-22% of the slide height.
- Image occupies the lower portion and should feel dominant.
- Bottom gradient should be softer than the cover gradient, roughly 40% less intense than the old heavy treatment.
- Stat text sits inside the dense part of the bottom gradient.
- Stat line is centered, bold, and easy to read.

## Meme Slide Style

- Use a real meme still image only.
- Top white caption band should be tight, around 15-18% of slide height.
- Caption sits vertically centered in the white band.
- Meme image should be large and dominant below.
- Do not replace the meme with a baseball action photo.

## File Naming

Use clear names:

```text
01_cover.png
02_slide.png
03_slide.png
04_slide.png
05_slide.png
06_meme.png
```

When the slide topic is obvious, descriptive names are preferred:

```text
02_walkoff_grand_slam.png
03_homegrown_bat.png
06_meme.png
```

## Portable Renderer

Use:

```bash
python3 scripts/polymarket-carousel.py templates/polymarket-carousel-brief.json
```

The JSON brief must provide local paths for the input images, optional logo, optional font files, team colors, slide text, and output folder. Do not commit local images, fonts, logos, exported PNGs, or private asset banks.

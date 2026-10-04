# The New Urban Kid

The portfolio of The New Urban Kid, Shashank Penumatcha.

**v2** (the site root) is a hip-hop producer's home studio at night, seen first person. It is built from real
photos on planes and simple boxes at real depths in one WebGL scene (three.js 0.170.0 from jsDelivr), lit only by
the practical lights: the desk lamp, the glow of the CRT, the MPC pads and two red LEDs. At the centre, the producer
sits at the desk in a black snapback, seen from behind, still apart from a slow breath while the MPC pads pulse. Focus or tap them for **About**: Shashank Penumatcha, The New Urban Kid, what the projects are, and GitHub.
Each piece of gear is a project:

- **Orbit**: the CRT, glowing with the Orbit space scene
- **A Vibe Called Quest**: the record on the turntable; it spins up when you hover or open it
- **Bring The Ruckus**: the flyer on the wall
- **Line framework**: the MPC. Two of its pads are **Construct** (warm) and **Vision** (cyan)
- **The crate** on the floor: flip through one record per project, with liner notes on the back. It is also the
  plain list of everything, and what you get if WebGL is not available

**v1** (`v1/`) is the earlier solar-system site, kept as it was apart from the owner's name under the title and
one typeface for every project. The small "v1 / v2" switch in the top right corner links between them.

## Run it

It is a static site: no build step and no npm dependencies. Serve the folder with any static server:

```bash
python3 -m http.server 8080   # then open http://localhost:8080/ (v2) or /v1/
```

Opening `index.html` straight from disk will not work, because browsers block ES modules on `file://`.

## Using it

- Move the mouse to look around. On phones, tilt (iOS asks for permission when you tap "tilt").
- Hover, or Tab to, a piece of gear: it glows and a small label names it. Click, tap or Enter pushes the camera in,
  with a lens blur, and the project fades in over the photo. Escape, the back gesture or a tap outside goes back.
- Deep links: `#producer`, `#orbit`, `#quest`, `#ruckus`, `#line`, `#construct`, `#vision`, `#crate`.
- In the crate: swipe, scroll or the arrow keys flip records; tap or Enter turns the sleeve over.
- "sound" (bottom right) plays a quiet synthesised vinyl crackle and room hum. It is off until you turn it on.
- `prefers-reduced-motion`: no parallax, no camera moves (the panel crossfades in), no spinning, the producer
  holds still, static grain.

## Files

- `index.html`, `style.css`: the page, the panel, the crate and the corners
- `js/data.js`: every project's text and links. Facts come from each project's README, HANDOFF or live site
- `js/room.js`: the studio scene, its layout for portrait and landscape, lights, pads, record and CRT shaders
- `js/post.js`: the film look: depth of field, bloom with a warm halation, grade, grain, vignette, light leak
- `js/paper.js`: the cork board polaroids, the credit card, the flyer and the record label, drawn in Jost
- `js/crate.js`, `js/sound.js`, `js/main.js`: the crate, the optional sound, camera and interaction
- `assets/room/{lg,sm}/`: textures for desktops and phones (phones load `sm`, at most 1024 px)
- `assets/CREDITS.md`: source, author, licence and edits for every photo and texture
- `tools/build_assets.py`: makes `assets/room/` from the source photos (Pillow, numpy, scipy)
- `tools/build_producer.py`: makes the producer cut-out from `assets/src/` (not committed; also needs rembg)
- `tools/shoot-v2.cjs`, `tools/shoot-v1.cjs`: Playwright screenshots into `qa/` (kept local)
- `v1/`: the solar-system site

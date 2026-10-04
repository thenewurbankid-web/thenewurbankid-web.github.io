# The New Urban Kid

A portfolio of The New Urban Kid's projects, shown as worlds in one star system. It is a single WebGL
scene (three.js 0.170.0 from jsDelivr) with plain HTML text laid over it, so the type stays sharp.

- **Orbit**: dark teal ocean world with a ring
- **A Vibe Called Quest**: violet-grey rocky world with icy poles
- **Bring The Ruckus**: rust and ember desert world (its text uses Sedgwick Ave Display)
- **Line framework**: ice giant with two moons, **Construct** and **Vision**
- **The star**: a short line about The New Urban Kid and a link to the GitHub profile

## Run it

It is a static site: no build step and no npm dependencies. Serve the folder with any static server:

```bash
npx serve .            # or: python3 -m http.server 8080
```

Opening `index.html` straight from disk will not work, because browsers block ES modules on `file://`.

## Using it

- Drag or swipe to orbit the system. Tap a world to fly to it. Double-tap, pinch in or press Esc to go back.
- Arrow keys cycle the worlds. Enter flies to the selected world, or opens the live site when you are at one.
- `?list` (or a long press on the top-left corner) shows a plain list of every project with links. The same
  list is always in the page for screen readers.
- Phones: the Tilt glyph (top right) turns on gyroscope parallax. iOS asks for permission first.
- Deep links: `#orbit`, `#quest`, `#ruckus`, `#line`, `#construct`, `#vision`, `#about`.
- `?q=high|mid|low` forces a quality tier. By default, desktops get high, phones get mid (2x pixel ratio and
  bloom), and weak or software GPUs get low (1x, no bloom). If the first seconds run slow, it steps down on its own.
- `prefers-reduced-motion` skips the fly-in, the letter animation, the parallax and the lightning.

## Files

- `index.html`, `style.css`: overlays, the plain list, fonts (Google Fonts)
- `js/data.js`: every project's text and links. Facts come from each project's README, HANDOFF or live site.
- `js/main.js`: scene, camera, gestures, overlays
- `js/shaders.js`: planet, ring, sun, star, nebula and post-processing shaders. Planet surfaces and the nebula
  are baked once into textures at load, so each frame only does the lighting.
- `assets/*.webp`: preview images (screenshots of the live sites and the game's own QA captures)
- `qa/`: screenshots from the last test run at 375x812 and 1440x900

## When the Vision status page goes live

The Vision moon shows "Status page coming" because https://thenewurbankid-web.github.io/construct/vision/
returned 404 on 2026-10-04. Once it is published, set `live: true` on that link in `js/data.js`.

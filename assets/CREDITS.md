# Image credits

Every photo and texture in `assets/room/` comes from a free source with a licence that allows reuse.
Each file exists twice: `assets/room/lg/` for desktops (at most 1600 px) and `assets/room/sm/` for
phones (at most 1024 px). `tools/build_assets.py` makes both from the source files listed here.
Licences were checked on each file's Wikimedia Commons or ambientCG page on 2026-10-04.

| File | What it is | Source | Author | Licence | Edits |
|---|---|---|---|---|---|
| `crt.webp` | CRT television (Orbit) | [Vintage Rank-Arena television set (Model C1210)](https://commons.wikimedia.org/wiki/File:Vintage_Rank-Arena_television_set_(Model_C1210)_(25065374823).jpg) | Matthew Paul Argall | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | Cut out from the background (alpha), glass darkened so the screen can be drawn on top, maker's name under the screen blurred, cropped, resized, WebP |
| `mpc.webp` | Sampler (Line framework) | [MPC 3000 Limited Edition (crop)](https://commons.wikimedia.org/wiki/File:MPC_3000_Limited_Edition_(crop).jpg), Smithsonian National Museum of African American History and Culture | The Smithsonian Institution | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Maker's logo, signature, edition badge and model name blurred out; cropped with rounded corners (alpha), resized, WebP |
| `record.webp` | Vinyl record (A Vibe Called Quest) | [12in Vinyl LP Record Angle](https://commons.wikimedia.org/wiki/File:12in-Vinyl-LP-Record-Angle.jpg) | Evan-Amos | Public domain (released by the author) | Rebuilt as concentric grooves from the photo's own rings so it can spin, label cut out (the project art is drawn there), WebP |
| `speaker.webp` | Studio monitor front | [Mackie MR8mk2 speaker cones](https://commons.wikimedia.org/wiki/File:Mackie_MR8mk2_speaker_cones.jpg) | Tim Sheerman-Chase | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | Cropped above the maker's logo (logo removed), contrast, resized, WebP |
| `lamp.webp` | Desk lamp and books | [Vintage lamp and books (Unsplash)](https://commons.wikimedia.org/wiki/File:Vintage_lamp_and_books_(Unsplash).jpg) | Jez Timms | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cropped, alpha made from the light (the background is black), resized, WebP |
| `window.webp` | City lights out of focus, seen through the window | [City lights night street](https://commons.wikimedia.org/wiki/File:City-lights-night-street_(24326520255).jpg) | Pixel.la Free Stock Photos | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cropped, resized, WebP; the window frame is drawn in the shader |
| `crate.webp` | Records in a crate | [Vinyl collection at a record store (Unsplash)](https://commons.wikimedia.org/wiki/File:Vinyl_collection_at_a_record_store_(Unsplash).jpg) | Fabien Barral (Mr Cup) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cropped away the shop signs, resized, WebP |
| `gloves.webp` | Boxing gloves on the Bring The Ruckus flyer | [Black boxing gloves](https://commons.wikimedia.org/wiki/File:Black_boxing_gloves.jpg) | Airman 1st Class Kerelin Molina, U.S. Air Force | Public domain (work of the U.S. federal government) | Greyscale, contrast, resized, WebP |
| `producer.webp` | The producer at the desk, seen from behind | [Back View of Black Man in Baseball Hat and T-Shirt](https://www.pexels.com/photo/back-view-of-black-man-in-baseball-hat-and-t-shirt-18708554/) (Pexels 18708554) | Mustapha Damilola | [Pexels licence](https://www.pexels.com/license/) (free use and modification; credit not required, given anyway) | White script on the cap and the logo on the back of the shirt painted out to plain black with the fabric texture kept; gold chain glare toned down; cut out with rembg (isnet-general-use, alpha matting); edge colour pulled in from the interior to remove the light-wall fringe; cropped, resized, WebP. Relit in the browser (warm lamp key, thin cool CRT rim, falloff); only a slow breath, no head motion. Skin tone not altered. Source kept out of git in `assets/src/`; `tools/build_producer.py` |
| `wall.webp` | Wall plaster | [Plaster001](https://ambientcg.com/view?id=Plaster001) | ambientCG | [CC0 1.0](https://docs.ambientcg.com/license/) | Colour map only, resized, WebP; tinted dark in the shader |
| `desk.webp` | Desk wood (also the plinth, cables and speaker sides, tinted) | [Wood051](https://ambientcg.com/view?id=Wood051) | ambientCG | [CC0 1.0](https://docs.ambientcg.com/license/) | Colour map only, resized, WebP |
| `cork.webp` | Cork board | [Cork002](https://ambientcg.com/view?id=Cork002) | ambientCG | [CC0 1.0](https://docs.ambientcg.com/license/) | Colour map only, resized, WebP |
| `paper.webp` | Paper for the polaroids and the card | [Paper001](https://ambientcg.com/view?id=Paper001) | ambientCG | [CC0 1.0](https://docs.ambientcg.com/license/) | Colour map only, resized, WebP |

Not photos from outside:

- `assets/previews/*.webp`: screenshots of the projects' own live sites and the game's own QA captures (from v1).
- The polaroids, the credit card, the flyer's type and the record label are drawn in the browser (`js/paper.js`)
  in Jost, the site's typeface.
- The turntable plinth, platter and tonearm, the speaker cabinets, the cables and the pad lights are simple
  geometry with the textures above.
- The vinyl crackle and room hum are synthesised in the browser; there are no audio files.

The only person is the producer above, seen from behind with no face visible. Brand names and logos were removed or cropped out as noted.

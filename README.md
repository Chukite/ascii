# ASCII Art by Chukite

Two interactive ASCII artworks: **Annulus** and **Singularity**.

[Open the gallery](https://ascii-art-showcase.vercel.app) · [Download both projects](https://ascii-art-showcase.vercel.app/downloads/ascii-field-notes.zip)

## Annulus

An annular eclipse over a moving sea.

[![Annulus — an ASCII eclipse above the ocean](assets/annulus.jpg)](https://ascii-art-showcase.vercel.app/annulus-cinematic/dist/index.html)

[Open Annulus](https://ascii-art-showcase.vercel.app/annulus-cinematic/dist/index.html) · [Download project](https://ascii-art-showcase.vercel.app/downloads/annulus-cinematic.zip)

## Singularity

A black hole and its gravitationally lensed accretion disk.

[![Singularity — an ASCII black hole with a glowing accretion disk](assets/singularity.jpg)](https://ascii-art-showcase.vercel.app/singularity-zoom-text/dist/index.html)

[Open Singularity](https://ascii-art-showcase.vercel.app/singularity-zoom-text/dist/index.html) · [Download project](https://ascii-art-showcase.vercel.app/downloads/singularity-zoom-text.zip)

## Run locally

Clone this repository and start a static server from the root:

```sh
python -m http.server 8000
```

Visit `http://localhost:8000`. No build step or package installation is needed.

For an individual project download, extract the ZIP and run the same command from its `dist/` folder. Use a modern browser with WebGL 2 support. Annulus uses JavaScript modules and needs a web server rather than a `file://` URL.

## Controls

Drag to explore; scroll or pinch to zoom. Zoom closer to reveal text. Click the artwork to focus it, then use **Space** to pause or resume, **R** to reset, **S** to save a PNG, or **F** for full screen. Singularity also supports the arrow keys for orbiting.

## License

Released under the [MIT License](LICENSE). You may reuse, modify, and redistribute the projects under its terms.

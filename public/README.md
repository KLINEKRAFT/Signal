Brand assets. Both are rendered exactly as supplied — never redrawn,
recoloured, or reconstructed.

- `klinekraft-logo.png` — the KLINEKRAFT maker's mark, shown small in the
  footer. 466×127, light artwork on transparency, lifted unmodified from the
  footer of colinkline.com where it lives as an inline base64 PNG. Replace it
  with an SVG if a vector original turns up; `MakerMark` only needs its `src`
  and intrinsic dimensions updated.
- `signal-logo.svg` — the SIGNAL product mark, shown in the header. **Not yet
  supplied.** Until it exists, `BrandMark` falls back to the wordmark set in the
  display face, which is typography rather than an invented logo.

Both components detect a missing or broken asset and fall back to a typographic
wordmark, so the layout holds either way. That check runs on mount as well as on
the error event — a 404 fires before React hydrates, and relying on `onError`
alone leaves a broken-image icon on screen.

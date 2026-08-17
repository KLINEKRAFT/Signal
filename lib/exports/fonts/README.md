Fonts embedded in exported PDFs. These are the same two faces the web app
uses, so a recap that is downloaded and forwarded still looks like the product
that made it.

- `SpaceGrotesk-{Regular,Medium,Bold}.ttf` — display face, matches `--font-display`
- `IBMPlexMono-Regular.ttf` — technical labels, matches `--font-mono`

Both families are licensed under the SIL Open Font License 1.1, which permits
embedding and redistribution. Space Grotesk © Florian Karsten. IBM Plex Mono
© IBM Corp.

**Why TTF, and why committed.** `@fontsource/*` ships only WOFF and WOFF2, and
pdf-lib cannot embed either. WOFF1 is a zlib-compressed wrapper around the same
sfnt tables a TTF holds, so these were reconstructed from the WOFF files in
`node_modules` — table directory rebuilt, each table inflated and re-aligned to
four bytes. They are byte-for-byte the same outlines, in the container pdf-lib
accepts.

They live in the repo rather than being derived at build time because the
conversion needs `@fontsource` present at build, and a build-step dependency on
a transform this obscure is worse than four small binaries under version
control. Each is ~30 KB, and pdf-lib subsets on embed, so a finished PDF carries
only the glyphs it actually used.

`next.config.ts` lists this directory in `outputFileTracingIncludes` for the
export route. Next traces imports, not `readFileSync` paths, so without that
entry these are absent from the deployed function and every export fails in
production while working in dev.

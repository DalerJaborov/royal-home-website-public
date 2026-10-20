# Public cloud checks

The fresh public source is checked on a standard GitHub Linux runner: types,
unit tests, production build and a checksum-verified secret scan. The old
private history and unfinished branches remain in the verified recovery archive.

The first real cloud run exposed an outdated font test: it expected 35 font-face
rules and six URLs, predating the core-Latin and catalogue font additions.
The assertion now checks the useful invariant for each body/display family:
all expected weights and Tajik glyph subsets, four shared binaries reused across
weights, and actual existing font files. It does not weaken image-loading tests.

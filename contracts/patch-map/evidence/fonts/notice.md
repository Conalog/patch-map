# Contract Fixture Fonts

The international-text contract uses unmodified fixture fonts so semantic metrics do
not depend on host-installed fonts.

- `unifont-16.0.04.otf` and `unifont-upper-16.0.04.otf` are GNU Unifont 16.0.04,
  obtained as direct font files from
  `https://ftp.gnu.org/pub/gnu/unifont/unifont-16.0.04/`.
- GNU Unifont 13.0.04 and later is dual-licensed under SIL Open Font License 1.1 and
  GPL 2 or later with the GNU Font Embedding Exception. The unmodified license text is
  stored as `UNIFONT-LICENSE.txt`; project code is not derived from the font.
- `FiraCode-Regular.woff2` is the byte-preserved existing public fixture font. It is
  retained for the broader text matrix but is not required to obtain the exact cell
  metrics in the international corpus.

The evidence manifest pins file byte size and SHA-256. Updating a font requires a new
contract evidence revision and analysis-owner review.

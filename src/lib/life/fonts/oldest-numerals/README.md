# Oldest Numerals

The oldest known symbols for 1 and 0, as a font for the Game of Life background.

| Glyph | Code points | Symbol | Oldest evidence | Outline |
|---|---|---|---|---|
| 1 | U+0031, U+1D377 TALLY MARK ONE | One straight incision (tally notch) | Les Pradelles hyena femur, France, 72–60 ka; Border Cave baboon fibula ("Lebombo bone"), South Africa, 44–42 ka | Drawn: a thin V-section cut, tilted 6° |
| 0 | U+0030, U+12472 CUNEIFORM PUNCTUATION SIGN DIAGONAL COLON | Two slanted wedges: the Late Babylonian placeholder | Seleucid tablets from Uruk, c. 300 BCE, e.g. Louvre AO 6484 | Traced from Thureau-Dangin's 1922 hand copy of AO 6456 (see Build) |

- Whether the notches record numbers is an interpretation: d'Errico et al. (2018) conclude that the Les Pradelles incisions "may have been produced to record, in a single session, homologous units of numerical information". The oldest certain written 1 is the proto-cuneiform unit sign N01 on numerical tablets from Uruk and Susa, c. 3300 BCE.
- The Babylonian sign only marks an empty place inside a number; it is not yet the number zero. A three-hook placeholder on a tablet from Kish, c. 700 BCE, appears in popular accounts (Kaplan 1999) without a published tablet reference. The oldest dated zero among our decimal digits is the dot in inscription K-127 from Sambor, Cambodia, 683 CE (Cœdès 1931).

## Build

    uv run --with fonttools --with brotli python src/lib/life/fonts/oldest-numerals/build.py

Writes `OldestNumerals-Regular.ttf`, `OldestNumerals-Regular.woff2` and `glyphs/{zero,one}.svg`. The zero comes from `trace_zero.py` (run it first if you change the source): it fits the copyist's pen strokes (two triangle outlines with tails, a spike, the pen width) to the scan crop `sources/ao6456-zero.png` by least squares, saves them as `sources/zero-strokes.svg` and the filled outline as `sources/zero-trace.svg`: `uv run --with resvg-py --with potracer --with pillow --with numpy python src/lib/life/fonts/oldest-numerals/trace_zero.py`
    (the backslashes above only escape backticks in this message; the file contains plain backticks.)

## References

- d'Errico, F., Doyon, L., Colagé, I., Queffelec, A., Le Vraux, E., Giacobini, G., Vandermeersch, B. & Maureille, B. (2018). From number sense to number symbols. An archaeological perspective. *Phil. Trans. R. Soc. B* 373: 20160518. https://doi.org/10.1098/rstb.2016.0518
- d'Errico, F., Backwell, L., Villa, P., et al. (2012). Early evidence of San material culture represented by organic artifacts from Border Cave, South Africa. *PNAS*. https://doi.org/10.1073/pnas.1204213109
- Nissen, H. J., Damerow, P. & Englund, R. K. (1993). *Archaic Bookkeeping*. University of Chicago Press.
- Englund, R. K. (1998). Texts from the Late Uruk Period. *Orbis Biblicus et Orientalis* 160/1.
- Neugebauer, O. (1957). *The Exact Sciences in Antiquity*, 2nd ed. Brown University Press.
- Boyer, C. B. (1944). Zero: The Symbol, the Concept, the Number. *National Mathematics Magazine* 18(8): 323–330. https://www.jstor.org/stable/3030083
- Kaplan, R. (1999). *The Nothing That Is: A Natural History of Zero*. Oxford University Press.
- Robson, E. (2008). *Mathematics in Ancient Iraq: A Social History*. Princeton University Press.
- Thureau-Dangin, F. (1922). *Tablettes d'Uruk à l'usage des prêtres du Temple d'Anu au temps des Séleucides*. Textes cunéiformes du Louvre 6. Paris: Geuthner. Hand copy of AO 6456: CDLI P254386.
- Cœdès, G. (1931). À propos de l'origine des chiffres arabes. *Bulletin of the School of Oriental Studies* 6(2). https://doi.org/10.1017/S0041977X00092806
- Plofker, K., Keller, A., Hayashi, T., Montelle, C. & Wujastyk, D. (2017). The Bakhshālī Manuscript: A Response to the Bodleian Library's Radiocarbon Dating. *History of Science in South Asia* 5. https://doi.org/10.18732/h2xt07

Reference photo of AO 6484 (not traced): Zunkir, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Tablette_zero_Uruk_AO_6484.jpg

## License

SIL Open Font License 1.1 (`OFL.txt`). The zero is traced from a public-domain hand copy (Thureau-Dangin 1922; scan: CDLI P254386).

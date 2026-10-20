"""Split common Latin glyphs without changing outlines, features or weight axes.

Maintenance only: pip install fonttools[woff] (not a production dependency).
Run after self-host-fonts.mjs. Original files cover the remaining characters.
"""
from pathlib import Path
import re
from fontTools.ttLib import TTFont
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
CORE_RANGES = "U+0000-00BF, U+00D7, U+00F7, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
REST_RANGES = "U+00C0-00D6, U+00D8-00F6, U+00F8-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329"
CORE = set(range(0xC0)) | set(range(0x2000, 0x2070)) | {0xD7, 0xF7, 0x20AC, 0x2122, 0x2191, 0x2193, 0x2212, 0x2215, 0xFEFF, 0xFFFD}

css_path = ROOT / "public/fonts.css"
css = css_path.read_text(encoding="utf-8")
for name in ("inter-400-latin", "unbounded-700-latin"):
    original = TTFont(ROOT / "public/fonts" / (name + ".woff2"))
    original_map = original.getBestCmap()
    axes = [(axis.axisTag, axis.minValue, axis.defaultValue, axis.maxValue) for axis in original["fvar"].axes]
    options = subset.Options()
    options.layout_features = ["*"]
    options.flavor = "woff2"
    options.recalc_timestamp = False
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=CORE)
    worker.subset(original)
    target = ROOT / "public/fonts" / (name + "-core-v1.woff2")
    original.save(target)
    result = TTFont(target)
    assert set(result.getBestCmap()) == set(original_map) & CORE
    assert axes == [(axis.axisTag, axis.minValue, axis.defaultValue, axis.maxValue) for axis in result["fvar"].axes]
    # Running twice must not duplicate the split declarations.
    css = re.sub(r"/\* latin-core \*/\s*@font-face\s*\{[^}]*" + re.escape(name) + r"-core-v1\.woff2[^}]*\}\s*", "", css)
    pattern = r"/\* latin \*/\s*(@font-face\s*\{[^}]*" + re.escape(name) + r"\.woff2[^}]*\})"
    def split_rule(match):
        rule = match.group(1)
        core = re.sub(r"unicode-range:[^;]+;", "unicode-range: " + CORE_RANGES + ";", rule.replace(name + ".woff2", name + "-core-v1.woff2"))
        rest = re.sub(r"unicode-range:[^;]+;", "unicode-range: " + REST_RANGES + ";", rule)
        return "/* latin-core */\n" + core + "\n\n/* latin */\n" + rest
    css = re.sub(pattern, split_rule, css)
    print(target.name, target.stat().st_size)
css_path.write_text(css, encoding="utf-8", newline="\n")

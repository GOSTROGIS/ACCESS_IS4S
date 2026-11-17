//! XFL document → AniCraft document.
//!
//! What maps (first slice of M4): stage size, frame rate and colour; the first scene's
//! layers (name, colour, visibility, lock, outline; guide layers; folders flattened); frames
//! and keyframes with durations, labels and classic tweens with their ease; shapes (solid,
//! linear and radial fills, solid, dashed and dotted strokes with their caps, joints and
//! miter limit), groups (flattened), rectangle and oval
//! primitives; symbol instances with their matrix, colour effect (every style, ADR 0056), loop mode and first frame;
//! library symbols (graphic, movie clip, button) with their own timelines, nested to any
//! depth; bitmaps (library items, instances and bitmap fills) whose image is stored as PNG or
//! JPEG in the package; text fields, laid out with this computer's fonts (`text`, ADR 0014);
//! frame scripts, symbol linkage classes and the document class, kept verbatim (ADR 0013 tier
//! 1); frame scripts in the ActionScript 3.0 subset run in Test Movie (tier 2), and the report
//! lists which run and which are only kept; sounds whose file is in the package as WAV, Ogg
//! Vorbis or MP3, and the sounds on frames that use them, buttons' states included, with their
//! sync, repeats and effect or envelope (ADR 0057, ADR 0086); Screen Video videos as a still of
//! their first frame (`video`, ADR 0086). Sounds and videos that don't come across are named in
//! the report with why. Everything else (bitmaps kept only in Animate's own storage, video playback,
//! motion tweens with property curves, unknown filters) is counted in the report instead of guessed at,
//! and so is whatever is drawn the nearest way AniCraft can (ragged, stipple and hatched
//! strokes, reflecting gradients, …). The self-authored corpus in `tests/corpus/` covers
//! every feature listed here, with golden renders (ADR 0035).

use crate::edges::{self, Edge};
use crate::xml::{self, Element as X};
use craft_xfl::filters::{Filter as NativeFilter, FilterKind as NativeFilterKind, FilterList as NativeFilterList, FilterSide as NativeFilterSide};
use anicraft_doc::{
    Cap, Dash, Join, StrokeStyle, Bitmap, BitmapId, BlendMode, ColorEffect, ColorTransform, Filter, FilterEntry, FilterSide, Document, Easing, Element, ElementId, ElementKind, GradientStop, Keyframe, Layer, LayerId, LayerKind, LoopMode, Paint, Rgba, Shape, Stage, Stroke, Symbol, SymbolId,
    Scene, ShapeHint, SymbolKind, Timeline, Tween, TweenKind, CustomEase, EaseGroup, FrameScript, FrameSound, Language, Linkage, ScaleGrid, SoundSync, SourceScript, Spread, MAX_FOCAL,
};
use anicraft_doc::sound::{EnvelopePoint, SoundEffect, clean_points};
use anicraft_geom::{Affine, FillRule, Path, Vec2};
use anicraft_text::{FaceMatch, Fonts};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::sync::Arc;

/// A shape hint as one keyframe of a file lists it (see `Importer::raw_hints`).
struct RawHint {
    order: usize,
    /// Its point on this keyframe, and the end point when the file gives both together.
    here: Vec2,
    end: Option<Vec2>,
}

struct PendingSymbol {
    id: SymbolId,
    name: String,
    kind: SymbolKind,
    linkage: Option<Linkage>,
    item: X,
    timeline: Option<craft_xfl::document::TimelineModel>,
}

#[derive(Debug, thiserror::Error)]
pub enum XflError {
    #[error("{0}")]
    Xml(#[from] xml::XmlError),
    #[error("{}", ani_zip_error(.0))]
    Zip(#[from] crate::zip::ZipError),
    #[error("I/O: {0}")]
    Io(#[from] std::io::Error),
    #[error("this isn't an Animate document: {0}")]
    NotXfl(String),
}

/// Keep AniCraft's established import diagnostics while the shared XFL reader stays neutral.
fn ani_zip_error(error: &crate::zip::ZipError) -> String {
    match error {
        crate::zip::ZipError::UnsupportedArchive(feature) => {
            format!("the archive uses a zip feature AniCraft can't read ({feature})")
        }
        crate::zip::ZipError::Unsupported(name, feature) => {
            format!("'{name}' uses a zip feature AniCraft can't read ({feature})")
        }
        other => other.to_string(),
    }
}

/// What the import couldn't bring across, by kind ("3 bitmaps"), the scripts it brought that
/// run and those it kept without running, and the fonts it couldn't find.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Report {
    pub skipped: BTreeMap<String, usize>,
    /// Frame scripts in the ActionScript 3.0 subset, which run in Test Movie and the HTML
    /// canvas export ("2 frame scripts in ActionScript 3.0"; ADR 0013 tier 2).
    pub runs: BTreeMap<String, usize>,
    /// Kept in the document but not run, by kind ("2 frame scripts in ActionScript 3.0", for
    /// those outside the subset; ADR 0013 tier 1).
    pub kept: BTreeMap<String, usize>,
    pub notes: Vec<String>,
    /// Font families the document's text asks for that aren't on this computer.
    pub missing_fonts: BTreeSet<String>,
    /// The family that text was laid out in instead.
    pub fallback_font: Option<String>,
    /// The items behind some kinds of `skipped`, by name ("intro.flv, On2 VP6, 4.0 s"), so an
    /// artist can tell which sound or video didn't come across (ADR 0086). At most
    /// [`MAX_NAMED`] per kind; the count in `skipped` is always whole.
    pub names: BTreeMap<String, Vec<String>>,
}

/// Most names kept per kind of skipped item.
pub const MAX_NAMED: usize = 64;
/// Most names the summary line shows per kind.
const SHOWN_NAMES: usize = 3;

impl Report {
    pub(crate) fn skip(&mut self, what: &str) {
        *self.skipped.entry(what.to_string()).or_default() += 1;
    }
    /// Counts `what` and keeps the item's `name` for the report.
    pub(crate) fn skip_named(&mut self, what: &str, name: String) {
        self.skip(what);
        let names = self.names.entry(what.to_string()).or_default();
        if names.len() < MAX_NAMED {
            names.push(name);
        }
    }
    pub(crate) fn keep(&mut self, what: &str) {
        *self.kept.entry(what.to_string()).or_default() += 1;
    }
    pub(crate) fn run(&mut self, what: &str) {
        *self.runs.entry(what.to_string()).or_default() += 1;
    }
    /// One line for a status bar: "Imported. Runs in Test Movie: 2 frame scripts in
    /// ActionScript 3.0. Kept, not run: 1 frame scripts in ActionScript 3.0. Not yet supported:
    /// 2 sounds. Fonts not on this computer, drawn in Inter: Futura, Gotham."
    pub fn summary(&self) -> String {
        let list = |m: &BTreeMap<String, usize>| m.iter().map(|(k, n)| format!("{n} {k}")).collect::<Vec<String>>().join(", ");
        let mut kept = String::new();
        if !self.runs.is_empty() {
            kept.push_str(&format!(" Runs in Test Movie: {}.", list(&self.runs)));
        }
        if !self.kept.is_empty() {
            kept.push_str(&format!(" Kept, not run: {}.", list(&self.kept)));
        }
        if self.skipped.is_empty() && self.notes.is_empty() && self.missing_fonts.is_empty() {
            return format!("Imported everything in the file.{kept}");
        }
        let mut out = format!("Imported.{kept}");
        let mut parts: Vec<String> = self
            .skipped
            .iter()
            .map(|(k, n)| match self.names.get(k).filter(|v| !v.is_empty()) {
                Some(names) => {
                    let mut shown: Vec<&str> = names.iter().take(SHOWN_NAMES).map(String::as_str).collect();
                    let more = n.saturating_sub(shown.len());
                    let more = if more > 0 { format!(" and {more} more") } else { String::new() };
                    shown.truncate(SHOWN_NAMES);
                    format!("{n} {k} ({}{more})", shown.join("; "))
                }
                None => format!("{n} {k}"),
            })
            .collect();
        parts.extend(self.notes.iter().cloned());
        if !parts.is_empty() {
            out.push_str(&format!(" Not yet supported: {}.", parts.join(", ")));
        }
        if !self.missing_fonts.is_empty() {
            let names: Vec<&str> = self.missing_fonts.iter().map(String::as_str).collect();
            let instead = self.fallback_font.as_deref().map(|f| format!(", drawn in {f}")).unwrap_or_default();
            out.push_str(&format!(" Fonts not on this computer{instead}: {}.", names.join(", ")));
        }
        out
    }
}

/// Reads files of the XFL package by their path inside it (`DOMDocument.xml`, `LIBRARY/x.xml`).
pub type Reader<'a> = dyn Fn(&str) -> Result<Option<Vec<u8>>, XflError> + 'a;

const MAX_SYMBOLS: usize = 20_000;
const MAX_LAYERS: usize = 5_000;
const MAX_FRAME: u32 = 100_000;
const MAX_BITMAPS: usize = 10_000;
const MAX_SOUNDS: usize = 10_000;
const MAX_VIDEOS: usize = 10_000;

/// Names the format of sound data that didn't decode, and why when it is a kind AniCraft reads:
/// "AIFF", "WAV in IMA ADPCM", "Animate's own sound data".
fn sound_format(data: &[u8], from_bin: bool, err: &anicraft_doc::audio::AudioError) -> String {
    use anicraft_doc::audio::{AudioError, Format};
    if data.starts_with(b"OggS") && data.windows(8).any(|w| w == b"OpusHead") {
        return "Ogg Opus".into();
    }
    if let Some(f) = Format::sniff(data) {
        let kind = match f {
            Format::Wav => "WAV",
            Format::Vorbis => "Ogg",
            Format::Mp3 => "MP3",
        };
        return match err {
            AudioError::Unsupported(_) if let Some(codec) = wav_codec(data).filter(|c| !matches!(c, 1 | 3 | 0xFFFE)) => {
                let name = match codec {
                    0x0002 => "Microsoft ADPCM".to_string(),
                    0x0006 => "A-law".to_string(),
                    0x0007 => "µ-law".to_string(),
                    0x0011 => "IMA ADPCM".to_string(),
                    0x0031 => "GSM 6.10".to_string(),
                    0x0055 => "MP3".to_string(),
                    c => format!("codec 0x{c:04X}"),
                };
                format!("WAV in {name}")
            }
            AudioError::Unsupported(what) => format!("{kind} with {what}"),
            AudioError::TooLong => format!("{kind} longer than AniCraft plays"),
            AudioError::Empty => format!("{kind} holding no audio"),
            _ => format!("a damaged {kind} file"),
        };
    }
    let name = if data.starts_with(b"FORM") && matches!(data.get(8..12), Some(b"AIFF" | b"AIFC")) {
        "AIFF"
    } else if data.starts_with(b"fLaC") {
        "FLAC"
    } else if data.get(4..8) == Some(b"ftyp") {
        "AAC or MPEG-4 audio"
    } else if data.starts_with(b".snd") {
        "Sun AU"
    } else if from_bin {
        "Animate's own sound data"
    } else {
        "an unknown format"
    };
    name.into()
}

/// The codec of a WAV file's `fmt ` chunk (1 PCM, 3 float, 0x11 IMA ADPCM, …), looked for in
/// its first chunks.
fn wav_codec(data: &[u8]) -> Option<u16> {
    let mut at = 12usize;
    for _ in 0..64 {
        let id = data.get(at..at + 4)?;
        let size = u32::from_le_bytes(data.get(at + 4..at + 8)?.try_into().ok()?) as usize;
        if id == b"fmt " {
            return Some(u16::from_le_bytes(data.get(at + 8..at + 10)?.try_into().ok()?));
        }
        at = at.checked_add(8)?.checked_add(size)?.checked_add(size & 1)?;
    }
    None
}

/// Bitmap fill matrices scale image pixels by twips (1/20 px): `a = 20` is one pixel per pixel.
const TWIPS: f32 = 20.0;

struct Builder<'a> {
    doc: Document,
    read: &'a Reader<'a>,
    /// Library item name → symbol id (allocated before timelines are built, so instances can
    /// refer to any symbol).
    ids: HashMap<String, SymbolId>,
    /// Parsed symbol files waiting to be built, with their script class.
    pending: Vec<PendingSymbol>,
    /// The language the document's frame scripts are written in (from its publish settings).
    language: Language,
    /// Library item name → bitmap id, for the bitmaps that could be read.
    bitmaps: HashMap<String, BitmapId>,
    /// Library item name → sound id, for the sounds whose file is in the package (ADR 0057).
    sounds: HashMap<String, anicraft_doc::SoundId>,
    /// Library item name -> the still of its first frame, for every video item (`None` when the
    /// video could not be read; ADR 0086).
    videos: HashMap<String, Option<BitmapId>>,
    report: Report,
    /// The fonts text is laid out with; the computer's, found on the first text field.
    fonts: Option<&'a Fonts>,
    /// Face name → what it is on this computer, looked up once per name.
    faces: HashMap<String, FaceMatch>,
}

/// Maps a neutral shared XFL filter side into the document model, applying the consumer's
/// established default when the wire value is absent or unknown.
fn filter_side(side: Option<NativeFilterSide>, default: FilterSide) -> FilterSide {
    match side {
        Some(NativeFilterSide::Inner) => FilterSide::Inner,
        Some(NativeFilterSide::Outer) => FilterSide::Outer,
        Some(NativeFilterSide::Full) => FilterSide::Full,
        None => default,
    }
}

fn rgba(color: craft_xfl::shape::Color) -> Rgba {
    Rgba::hex(color.rgb).with_alpha(color.alpha)
}

/// Converts the neutral native ramp into AniCraft's sorted, normalized paint stops.
fn ramp(filter: &NativeFilter<'_, X>) -> Vec<GradientStop> {
    let raw: Vec<(f32, Rgba)> = filter
        .ramp_entries()
        .take(anicraft_doc::MAX_RAMP_STOPS)
        .map(|entry| (entry.ratio().unwrap_or(0.0), rgba(entry.color())))
        .collect();
    // One scale for the whole ramp: any ratio past 1 means bytes.
    let scale = if raw.iter().any(|(ratio, _)| *ratio > 1.0) { 1.0 / 255.0 } else { 1.0 };
    let mut stops: Vec<GradientStop> = raw.into_iter().map(|(ratio, color)| GradientStop { offset: (ratio * scale).clamp(0.0, 1.0), color }).collect();
    stops.sort_by(|a, b| a.offset.total_cmp(&b.offset));
    stops
}

pub(crate) fn color(el: &X, key: &str, alpha_key: &str) -> Rgba {
    let parsed = craft_xfl::shape::color(el, key, alpha_key);
    Rgba::hex(parsed.rgb).with_alpha(parsed.alpha)
}

fn matrix(el: &X) -> Affine {
    let m = craft_xfl::shape::matrix(el);
    Affine { m: [m.a, m.b, m.c, m.d, m.tx, m.ty] }
}

/// Half the side of the square XFL gradients are defined on, in pixels (16384 twips / 20).
const GRADIENT_HALF: f32 = 819.2;

/// A fill definition (`SolidColor`, `LinearGradient`, `RadialGradient`, `BitmapFill`) as a
/// paint.
fn paint(def: &X, bitmaps: &HashMap<String, BitmapId>, report: &mut Report) -> Option<Paint> {
    let fill = craft_xfl::shape::Fill::new(def);
    match fill.kind() {
        craft_xfl::shape::FillKind::SolidColor => Some(Paint::Solid(color(def, "color", "alpha"))),
        craft_xfl::shape::FillKind::LinearGradient | craft_xfl::shape::FillKind::RadialGradient => {
            let m = matrix(def);
            let stops: Vec<GradientStop> = fill
                .gradient_entries()
                .map(|g| {
                    let color = g.color_value();
                    GradientStop { offset: g.ratio().unwrap_or(0.0).clamp(0.0, 1.0), color: Rgba::hex(color.rgb).with_alpha(color.alpha) }
                })
                .collect();
            if stops.is_empty() {
                return None;
            }
            // Overflow, interpolation and the focal point carry over as they are (ADR 0074).
            let spread = fill.spread_method().and_then(|s| Spread::from_key(s.trim())).unwrap_or_default();
            let linear_rgb = fill.interpolation_method().is_some_and(|s| s.trim() == "linearRGB");
            let frame = m.mul(&Affine::scale(GRADIENT_HALF, GRADIENT_HALF));
            let mut p = if fill.kind() == craft_xfl::shape::FillKind::LinearGradient { Paint::linear(Vec2::new(-1.0, 0.0), Vec2::new(1.0, 0.0), stops) } else { Paint::radial(Vec2::ZERO, 1.0, stops) };
            match &mut p {
                Paint::Linear { spread: s, linear_rgb: l, .. } => {
                    *s = spread;
                    *l = linear_rgb;
                }
                Paint::Radial { spread: s, linear_rgb: l, focal, .. } => {
                    *s = spread;
                    *l = linear_rgb;
                    *focal = fill.focal_point_ratio().unwrap_or(0.0).clamp(-MAX_FOCAL, MAX_FOCAL);
                }
                _ => {}
            }
            Some(p.with_frame(&frame, None))
        }
        craft_xfl::shape::FillKind::Bitmap => {
            let Some(&bitmap) = fill.bitmap_path().and_then(|n| bitmaps.get(n)) else {
                report.skip("bitmap fills of missing bitmaps");
                return None;
            };
            let m = matrix(def).m;
            let matrix = Affine { m: [m[0] / TWIPS, m[1] / TWIPS, m[2] / TWIPS, m[3] / TWIPS, m[4], m[5]] };
            // Animate repeats a bitmap fill unless it is clipped (then the edge pixels extend,
            // which AniCraft draws as the image shown once).
            Some(Paint::Bitmap { bitmap, repeat: !fill.bitmap_is_clipped().unwrap_or(false), matrix })
        }
        craft_xfl::shape::FillKind::Other => None,
    }
}

/// A stroke definition (`SolidStroke` and friends) as a stroke: weight, its fill colour, caps,
/// joints and miter limit, and the dashes of `DashedStroke` and dots of `DottedStroke`
/// (ADR 0046). Ragged, stipple and hatched strokes are drawn solid.
pub(crate) fn stroke(def: &X, bitmaps: &HashMap<String, BitmapId>, report: &mut Report) -> Option<Stroke> {
    let native = craft_xfl::shape::Stroke::new(def);
    use craft_xfl::shape::StrokeKind as NativeStroke;
    if native.kind() == NativeStroke::Other {
        return None;
    }
    // Round caps and joints are the format's default, and a miter limit of 3.
    let cap = match native.caps().map(str::trim) {
        Some("none") => Cap::Butt,
        Some("square") => Cap::Square,
        _ => Cap::Round,
    };
    let join = match native.joints().map(str::trim) {
        Some("miter") => Join::Miter,
        Some("bevel") => Join::Bevel,
        _ => Join::Round,
    };
    let miter_limit = native.miter_limit().unwrap_or(anicraft_doc::stroke_style::DEFAULT_MITER_LIMIT);
    let dash = match native.kind() {
        NativeStroke::Dashed => Dash::dashed(native.dash1().unwrap_or(6.0), native.dash2().unwrap_or(3.0)),
        NativeStroke::Dotted => Dash::dotted(native.dot_space().unwrap_or(3.0)),
        NativeStroke::Solid => None,
        _ => {
            report.skip("ragged, stipple and hatched strokes (drawn solid)");
            None
        }
    };
    let style = StrokeStyle { cap, join, miter_limit, dash };
    let width = native.weight().unwrap_or(1.0).clamp(0.05, 1000.0);
    let fill = native.fill();
    let c = fill.map_or(Rgba::BLACK, |f| {
        if f.kind() == craft_xfl::shape::FillKind::SolidColor {
            let value = f.color_value();
            Rgba::hex(value.rgb).with_alpha(value.alpha)
        } else {
            report.skip("gradient and bitmap strokes (drawn in one colour)");
            paint(f.element(), bitmaps, report).map_or(Rgba::BLACK, |p| p.primary_color())
        }
    });
    Some(Stroke::new(c, width).with_style(style))
}

impl<'a> Builder<'a> {
    fn element(&mut self, kind: ElementKind, transform: Affine, color: ColorEffect) -> Arc<Element> {
        Arc::new(Element { id: ElementId(self.doc.alloc_id()), name: String::new(), transform, color, kind })
    }

    /// Shapes for one `DOMShape`: a fill-only shape per fill style (bottom), then a stroke-only
    /// shape per stroke style, as Animate draws them. A shape loose on a frame (not in a group,
    /// not a drawing object) is raw artwork: its shapes are marked to merge (ADR 0042), and the
    /// engine merges each keyframe's raw shapes into one drawing when it opens the file.
    fn shape(&mut self, el: &X, parent: &Affine, out: &mut Vec<Arc<Element>>, loose: bool) {
        let Some(schema) = craft_xfl::shape::Shape::new(el) else { return };
        let m = parent.mul(&matrix(el));
        let merge = loose && !schema.is_drawing_object().unwrap_or(false);
        let fills: Vec<(u32, Option<Paint>)> = schema.fills().map(|style| {
            let paint = style.definition().and_then(|definition| paint(definition.element(), &self.bitmaps, &mut self.report));
            (style.index().unwrap_or(0), paint)
        }).collect();
        let strokes: Vec<(u32, Option<Stroke>)> = schema.strokes().map(|style| {
            let stroke = style.definition().and_then(|definition| stroke(definition.element(), &self.bitmaps, &mut self.report));
            (style.index().unwrap_or(0), stroke)
        }).collect();
        let edges: Vec<Edge> = schema.edges().map(|edge| Edge {
            fill_left: edge.fill_style0().unwrap_or(0),
            fill_right: edge.fill_style1().unwrap_or(0),
            stroke: edge.stroke_style().unwrap_or(0),
            segs: edge.encoded_segments().map(edges::parse).unwrap_or_default(),
        }).collect();
        for (index, p) in fills {
            let (Some(p), true) = (p, index > 0) else { continue };
            let path = edges::fill_path(&edges, index);
            if !path.is_empty() {
                out.push(self.element(ElementKind::Shape(Shape { path: Arc::new(path), fill: Some(p), stroke: None, fill_rule: FillRule::EvenOdd, merge, warp: None }), m, ColorEffect::default()));
            }
        }
        for (index, s) in strokes {
            let (Some(s), true) = (s, index > 0) else { continue };
            let path = edges::stroke_path(&edges, index);
            if !path.is_empty() {
                out.push(self.element(ElementKind::Shape(Shape { path: Arc::new(path), fill: None, stroke: Some(s), fill_rule: FillRule::NonZero, merge, warp: None }), m, ColorEffect::default()));
            }
        }
    }

    /// Rectangle and oval primitives.
    fn primitive(&mut self, el: &X, parent: &Affine, out: &mut Vec<Arc<Element>>) {
        let Some(primitive) = craft_xfl::shape::Primitive::new(el) else { return };
        let (x, y) = (primitive.x().unwrap_or(0.0), primitive.y().unwrap_or(0.0));
        let (w, h) = (primitive.width().unwrap_or(0.0), primitive.height().unwrap_or(0.0));
        if !(w > 0.0 && h > 0.0) {
            return;
        }
        let path = if primitive.kind() == craft_xfl::shape::PrimitiveKind::Oval {
            Path::ellipse(x + w / 2.0, y + h / 2.0, w / 2.0, h / 2.0)
        } else {
            Path::rounded_rect(x, y, w, h, primitive.top_left_radius().unwrap_or(0.0).max(0.0))
        };
        let fill = primitive.fill().and_then(|definition| paint(definition.element(), &self.bitmaps, &mut self.report));
        let stroke = primitive.stroke().and_then(|definition| stroke(definition.element(), &self.bitmaps, &mut self.report));
        if fill.is_some() || stroke.is_some() {
            let native = primitive.matrix();
            let m = parent.mul(&Affine { m: [native.a, native.b, native.c, native.d, native.tx, native.ty] });
            out.push(self.element(ElementKind::Shape(Shape { path: Arc::new(path), fill, stroke, fill_rule: FillRule::NonZero, merge: false, warp: None }), m, ColorEffect::default()));
        }
    }

    /// A bitmap instance: a rectangle of the image's size showing it, as Import to Stage makes.
    fn bitmap_instance(&mut self, el: &X, parent: &Affine, out: &mut Vec<Arc<Element>>) {
        let found = el.attr("libraryItemName").and_then(|n| self.bitmaps.get(n)).and_then(|&id| self.doc.bitmap(id).map(|b| (id, b.width as f32, b.height as f32)));
        let Some((bitmap, w, h)) = found else {
            self.report.skip("instances of missing bitmaps");
            return;
        };
        let shape = Shape { path: Arc::new(Path::rect(0.0, 0.0, w, h)), fill: Some(Paint::Bitmap { bitmap, repeat: false, matrix: Affine::IDENTITY }), stroke: None, fill_rule: FillRule::NonZero, merge: false, warp: None };
        out.push(self.element(ElementKind::Shape(shape), parent.mul(&matrix(el)), ColorEffect::default()));
    }

    /// A video instance (ADR 0086): its video's first frame, as a bitmap rectangle sized to the
    /// instance's frame (`frameRight` and `frameBottom`, in twips) when the video came across
    /// as a still; otherwise counted, the video itself being named in the report.
    fn video_instance(&mut self, el: &X, parent: &Affine, out: &mut Vec<Arc<Element>>) {
        let still = el.attr("libraryItemName").and_then(|n| self.videos.get(n)).copied();
        let found = still.flatten().and_then(|id| self.doc.bitmap(id).map(|b| (id, b.width as f32, b.height as f32)));
        let Some((bitmap, w, h)) = found else {
            self.report.skip(if still.is_some() { "instances of videos AniCraft can't play" } else { "instances of missing videos" });
            return;
        };
        let size = |k: &str, natural: f32| el.f32(k).map(|t| t / TWIPS).filter(|v| v.is_finite() && *v > 0.0 && *v <= 100_000.0).unwrap_or(natural);
        let (fw, fh) = (size("frameRight", w), size("frameBottom", h));
        let fit = Affine::scale(fw / w, fh / h);
        let shape = Shape { path: Arc::new(Path::rect(0.0, 0.0, w, h)), fill: Some(Paint::Bitmap { bitmap, repeat: false, matrix: Affine::IDENTITY }), stroke: None, fill_rule: FillRule::NonZero, merge: false, warp: None };
        out.push(self.element(ElementKind::Shape(shape), parent.mul(&matrix(el)).mul(&fit), ColorEffect::default()));
    }

    /// An instance's filters, by Animate's element names, in order; switched-off filters
    /// (`enabled="false"`) come in switched off with their settings (ADR 0091), and unknown ones
    /// are reported.
    fn filters(&mut self, el: &X) -> Vec<FilterEntry> {
        let mut out = Vec::new();
        for f in NativeFilterList::new(el).iter() {
            let enabled = f.enabled();
            let quality = f.quality();
            let num = |value: Option<f32>, default: f32| value.unwrap_or(default);
            let flag = |value: Option<bool>| value.unwrap_or(false);
            let filter = match f.kind() {
                Some(NativeFilterKind::Blur) => Filter::Blur { blur_x: num(f.blur_x(), 5.0), blur_y: num(f.blur_y(), 5.0), quality },
                Some(NativeFilterKind::DropShadow) => Filter::DropShadow {
                    blur_x: num(f.blur_x(), 5.0),
                    blur_y: num(f.blur_y(), 5.0),
                    strength: num(f.strength(), 1.0),
                    quality,
                    angle: num(f.angle(), 45.0),
                    distance: num(f.distance(), 4.0),
                    color: rgba(f.color()),
                    inner: flag(f.inner()),
                    knockout: flag(f.knockout()),
                    hide_object: flag(f.hide_object()),
                },
                Some(NativeFilterKind::Glow) => Filter::Glow {
                    blur_x: num(f.blur_x(), 5.0),
                    blur_y: num(f.blur_y(), 5.0),
                    strength: num(f.strength(), 1.0),
                    quality,
                    color: rgba(f.color()),
                    inner: flag(f.inner()),
                    knockout: flag(f.knockout()),
                },
                Some(NativeFilterKind::AdjustColor) => Filter::AdjustColor {
                    brightness: num(f.brightness(), 0.0),
                    contrast: num(f.contrast(), 0.0),
                    saturation: num(f.saturation(), 0.0),
                    hue: num(f.hue(), 0.0),
                },
                Some(NativeFilterKind::Bevel) => Filter::Bevel {
                    blur_x: num(f.blur_x(), 5.0),
                    blur_y: num(f.blur_y(), 5.0),
                    strength: num(f.strength(), 1.0),
                    quality,
                    angle: num(f.angle(), 45.0),
                    distance: num(f.distance(), 5.0),
                    shadow_color: rgba(f.shadow_color()),
                    highlight_color: f.highlight_color().map(rgba).unwrap_or_else(|| Rgba::WHITE.with_alpha(num(f.highlight_alpha(), 1.0).clamp(0.0, 1.0))),
                    side: filter_side(f.side(), FilterSide::Inner),
                    knockout: flag(f.knockout()),
                },
                Some(NativeFilterKind::GradientGlow) => {
                    let stops = ramp(&f);
                    Filter::GradientGlow {
                        blur_x: num(f.blur_x(), 5.0),
                        blur_y: num(f.blur_y(), 5.0),
                        strength: num(f.strength(), 1.0),
                        quality,
                        angle: num(f.angle(), 45.0),
                        distance: num(f.distance(), 5.0),
                        stops: if stops.is_empty() { anicraft_doc::default_glow_ramp() } else { stops },
                        side: filter_side(f.side(), FilterSide::Outer),
                        knockout: flag(f.knockout()),
                    }
                }
                Some(NativeFilterKind::GradientBevel) => {
                    let stops = ramp(&f);
                    Filter::GradientBevel {
                        blur_x: num(f.blur_x(), 5.0),
                        blur_y: num(f.blur_y(), 5.0),
                        strength: num(f.strength(), 1.0),
                        quality,
                        angle: num(f.angle(), 45.0),
                        distance: num(f.distance(), 5.0),
                        stops: if stops.is_empty() { anicraft_doc::default_bevel_ramp() } else { stops },
                        side: filter_side(f.side(), FilterSide::Inner),
                        knockout: flag(f.knockout()),
                    }
                }
                None => {
                    self.report.skip("unknown filters");
                    continue;
                }
            };
            out.push(FilterEntry { filter: filter.sanitized(), enabled });
        }
        out
    }

    /// A text field: one text element per block (`text::field`), placed by the field's matrix.
    fn text_field(&mut self, el: &X, parent: &Affine, out: &mut Vec<Arc<Element>>) {
        let fonts: &'a Fonts = match self.fonts {
            Some(f) => f,
            None => Fonts::get(),
        };
        self.fonts = Some(fonts);
        let m = parent.mul(&matrix(el));
        let name: String = el.attr("name").unwrap_or("").chars().take(256).collect();
        for (i, p) in crate::text::field(el, fonts, &mut self.faces, &mut self.report).into_iter().enumerate() {
            let mut e = Element { id: ElementId(self.doc.alloc_id()), name: String::new(), transform: m.mul(&Affine::translate(p.offset.x, p.offset.y)), color: ColorEffect::default(), kind: ElementKind::Text(Arc::new(p.block)) };
            // A dynamic or input field's instance name goes on it (its first block for static
            // text, which keeps the name for a later conversion).
            if i == 0 {
                e.name.clone_from(&name);
            }
            out.push(Arc::new(e));
        }
    }

    /// An instance's `Color` (ADR 0056): Animate's style comes from which attributes it has: a
    /// tint (`tintMultiplier`, `tintColor`), a brightness (`brightness`, −1..1), Advanced (any
    /// channel's multiplier other than 1 or an offset, −255..255), or alpha alone. Values are
    /// clamped into Animate's ranges.
    fn color_effect(&mut self, c: &X) -> ColorEffect {
        let native = craft_xfl::shape::NativeColorEffect::new(c);
        let multipliers = native.multipliers();
        let alpha = multipliers[3];
        let fx = if let Some(t) = native.tint_multiplier() {
            let tint_color = native.tint_color();
            let tint = ColorEffect::Tint { color: Rgba::hex(tint_color.rgb).with_alpha(1.0), amount: t };
            if alpha != 1.0 { tint.with_alpha(alpha) } else { tint }
        } else if let Some(b) = native.brightness().filter(|b| *b != 0.0) {
            let bright = ColorEffect::Brightness(b);
            if alpha != 1.0 { bright.with_alpha(alpha) } else { bright }
        } else {
            let offsets = native.offsets().map(|value| value / 255.0);
            let t = ColorTransform { mul: multipliers, add: offsets };
            if t.changes_colour() || t.add[3] != 0.0 {
                ColorEffect::Advanced(t)
            } else if alpha != 1.0 {
                ColorEffect::Alpha(alpha)
            } else {
                ColorEffect::None
            }
        };
        fx.sanitized()
    }

    fn instance(&mut self, el: &X, parent: &Affine, out: &mut Vec<Arc<Element>>) {
        let Some(&symbol) = el.attr("libraryItemName").and_then(|n| self.ids.get(n)) else {
            self.report.skip("instances of missing symbols");
            return;
        };
        let loop_mode = match el.attr("loop").map(str::trim) {
            Some("play once") => LoopMode::PlayOnce,
            Some("single frame") => LoopMode::SingleFrame,
            Some(r @ ("play once reverse" | "loop reverse")) => {
                self.report.skip("reverse loop modes (played forward)");
                if r == "loop reverse" { LoopMode::Loop } else { LoopMode::PlayOnce }
            }
            _ => LoopMode::Loop,
        };
        let first_frame = el.u32("firstFrame").unwrap_or(0).min(MAX_FRAME);
        let fx = el.child("color").and_then(|c| c.child("Color")).map_or_else(ColorEffect::default, |c| self.color_effect(c));
        let m = parent.mul(&matrix(el));
        // Blend modes by Animate's names; unknown ones stay Normal.
        let blend = el.attr("blendMode").and_then(BlendMode::from_key).unwrap_or_default();
        let filters = self.filters(el);
        let mut e = Element { id: ElementId(self.doc.alloc_id()), name: String::new(), transform: m, color: fx, kind: ElementKind::Symbol { symbol, loop_mode, first_frame, blend, filters, events: Vec::new() } };
        // The instance name actions address it by (ADR 0024); one they couldn't is reported.
        if let Some(name) = el.attr("name").map(str::trim).filter(|n| !n.is_empty()) {
            if anicraft_doc::actions::valid_instance_name(name) {
                e.name = name.to_string();
            } else {
                self.report.skip("instance names actions can't use (left out)");
            }
        }
        // Older documents put handlers (`on (release) { … }`) on instances; only frame
        // scripts have a place yet.
        if el.child("Actionscript").is_some() {
            self.report.skip("scripts on instances (left out; frame scripts are kept)");
        }
        out.push(Arc::new(e));
    }

    fn elements(&mut self, list: &[X], parent: &Affine, out: &mut Vec<Arc<Element>>, depth: usize) {
        if depth > 64 {
            return;
        }
        for el in list {
            match el.name.as_str() {
                // Shapes loose on a frame, or in a group, are raw shapes (a group's merge only with
                // each other, ADR 0073); drawing objects say so.
                "DOMShape" => self.shape(el, parent, out, true),
                // A group (ADR 0073): its members in its own space, placed by its matrix.
                "DOMGroup" if depth < anicraft_doc::MAX_GROUP_DEPTH => {
                    let mut members = Vec::new();
                    self.elements(el.list("members"), &Affine::IDENTITY, &mut members, depth + 1);
                    if !members.is_empty() {
                        let layer = LayerId(self.doc.alloc_id());
                        let g = self.element(ElementKind::group(layer, members), parent.mul(&matrix(el)), ColorEffect::default());
                        out.push(g);
                    }
                }
                "DOMGroup" => self.report.skip("groups nested more than 32 deep"),
                "DOMSymbolInstance" => self.instance(el, parent, out),
                "DOMRectangleObject" | "DOMOvalObject" => self.primitive(el, parent, out),
                "DOMBitmapInstance" => self.bitmap_instance(el, parent, out),
                "DOMStaticText" | "DOMDynamicText" | "DOMInputText" => self.text_field(el, parent, out),
                "DOMVideoInstance" => self.video_instance(el, parent, out),
                _ => self.report.skip("other elements"),
            }
        }
    }

    fn timeline(&mut self, tl: &X, schema: &craft_xfl::document::TimelineModel) -> Timeline {
        let mut layers = Vec::new();
        // Layers by their position in the file's layer list: `parentLayerIndex` points at a
        // layer's folder or mask. Links that don't fit AniCraft's rules are dropped by
        // `repair_masks` below.
        let mut by_index: Vec<LayerId> = Vec::new();
        for (l, schema_layer) in tl.list("layers").iter().filter(|l| l.name == "DOMLayer").take(MAX_LAYERS).zip(&schema.layers) {
            let kind = match schema_layer.layer_type {
                craft_xfl::document::LayerType::Folder => LayerKind::Folder,
                craft_xfl::document::LayerType::Guide => LayerKind::Guide,
                craft_xfl::document::LayerType::Mask => LayerKind::Mask,
                craft_xfl::document::LayerType::Normal | craft_xfl::document::LayerType::Other => LayerKind::Normal,
            };
            let id = LayerId(self.doc.alloc_id());
            by_index.push(id);
            let mut layer = Layer::new(id, l.attr("name").unwrap_or("Layer"));
            layer.kind = kind;
            layer.parent = schema_layer.parent_layer_index.and_then(|i| by_index.get(i as usize).copied()).filter(|p| *p != id);
            if kind == LayerKind::Folder {
                // A folder holds layers, never frames.
                layer.keyframes.clear();
                layer.visible = schema_layer.visible.unwrap_or(true);
                layer.locked = schema_layer.locked.unwrap_or(false);
                layer.color = color(l, "color", "__none");
                layers.push(Arc::new(layer));
                continue;
            }
            layer.visible = schema_layer.visible.unwrap_or(true);
            layer.locked = schema_layer.locked.unwrap_or(false);
            layer.outline = schema_layer.outline.unwrap_or(false);
            layer.color = color(l, "color", "__none");
            // Layer Properties' height, 100 / 200 / 300 % (ADR 0061), as a multiple of a row.
            layer.height_rows = schema_layer.height_multiplier.map_or(1, |h| h.clamp(1, u32::from(anicraft_doc::MAX_LAYER_HEIGHT)) as u8);
            let mut keys = Vec::new();
            let mut raw_hints: HashMap<u32, Vec<RawHint>> = HashMap::new();
            for (f, schema_frame) in l.list("frames").iter().filter(|f| f.name == "DOMFrame").zip(&schema_layer.frames) {
                let start = schema_frame.index.unwrap_or(0).min(MAX_FRAME);
                let duration = schema_frame.duration.unwrap_or(1).clamp(1, MAX_FRAME);
                let mut k = Keyframe::new(start, duration);
                // A frame's name is a label (or an anchor, a label too); a comment is a note
                // to the animator that nothing can go to, which AniCraft has no place for yet.
                if schema_frame.is_comment {
                    self.report.skip("frame comments");
                } else {
                    k.label = f.attr("name").unwrap_or("").chars().take(256).collect();
                }
                match schema_frame.tween_type {
                    craft_xfl::document::TweenType::Motion | craft_xfl::document::TweenType::Shape => {
                        let kind =
                            if schema_frame.tween_type == craft_xfl::document::TweenType::Shape { TweenKind::Shape } else { TweenKind::Classic };
                        let native_tween = craft_xfl::tween::FrameTween::new(f);
                        let orient = native_tween.orient_to_path().unwrap_or(false);
                        if kind == TweenKind::Classic
                            && native_tween.rotate().is_some_and(|r| matches!(r.trim(), "clockwise" | "counter-clockwise"))
                        {
                            self.report.skip("tween spins (turned the shortest way)");
                        }
                        let (easing, groups) = self.easing(f);
                        k.tween = Some(Tween { easing, kind, orient, groups });
                    }
                    craft_xfl::document::TweenType::MotionObject => self.report.skip("motion tweens (kept as keyframes)"),
                    craft_xfl::document::TweenType::Other => {}
                }
                // Shape hints sit on both keyframes of a shape tween; they are paired up below.
                let shape_hints = craft_xfl::shape_hints::ShapeHints::new(f);
                if !shape_hints.is_empty() {
                    raw_hints.insert(start, self.raw_hints(f));
                }
                // Frame scripts are kept verbatim (ADR 0013 tier 1); those in the subset run.
                if let Some(a) = f.child("Actionscript") {
                    k.script = self.frame_script(a);
                }
                if craft_xfl::sound::FrameSound::new(f).name().is_some_and(|name| !name.trim().is_empty()) {
                    k.sound = self.frame_sound(f);
                }
                let mut els = Vec::new();
                self.elements(f.list("elements"), &Affine::IDENTITY, &mut els, 0);
                k.elements = els;
                keys.push(Arc::new(k));
            }
            if !keys.is_empty() {
                layer.keyframes = keys;
            }
            layer.normalize();
            if !raw_hints.is_empty() {
                self.pair_hints(&mut layer, &raw_hints);
            }
            layers.push(Arc::new(layer));
        }
        if layers.is_empty() {
            layers.push(Arc::new(Layer::new(LayerId(self.doc.alloc_id()), "Layer 1")));
        }
        let mut tl = Timeline { layers };
        // Links that do not form an unbroken run under their mask are dropped.
        tl.repair_masks();
        tl
    }

    /// A frame's `<Actionscript><script>` text, exactly as written (its `<script>` elements in
    /// order, though files have one), in the document's language.
    fn frame_script(&mut self, a: &X) -> Option<FrameScript> {
        let parts: Vec<&str> = a.children.iter().filter(|c| c.name == "script").map(|c| c.text.as_str()).collect();
        let text = parts.join("\n");
        if text.trim().is_empty() {
            return None;
        }
        let script = SourceScript::new(self.language, text);
        if script.check().is_err() {
            self.report.skip("frame scripts over 1 MiB (left out)");
            return None;
        }
        // Compiling here also fills the script's cache for Test Movie (ADR 0013 tier 2).
        let what = format!("frame scripts in {}", self.language.label());
        if script.runs() { self.report.run(&what) } else { self.report.keep(&what) }
        Some(FrameScript::Source(Arc::new(script)))
    }

    /// A tween's ease (ADR 0081): the classic single-slider `acceleration`, or its custom ease
    /// curves exactly. A curve is `3n + 1` points (each segment's start, two handles, …, the
    /// end) from (0, 0) to (1, 1); one segment is a cubic Bézier, more a custom ease. With
    /// `useSingleEaseCurve="false"` each property group (`position`, `rotation`, `scale`,
    /// `color`, `filters`) has its own curve, and `all` (or the slider) eases the rest.
    fn easing(&mut self, f: &X) -> (Easing, Vec<(EaseGroup, Easing)>) {
        let native_tween = craft_xfl::tween::FrameTween::new(f);
        let acc = native_tween.acceleration().unwrap_or(0.0).clamp(-100.0, 100.0);
        let classic = if acc == 0.0 { Easing::Linear } else { Easing::Classic(acc) };
        if native_tween.has_custom_ease() != Some(true) {
            return (classic, Vec::new());
        }
        let curves: Vec<_> = native_tween.custom_eases().collect();
        if curves.is_empty() {
            self.report.skip("custom eases without their curve (drawn with the simple ease)");
            return (classic, Vec::new());
        }
        let single = native_tween.use_single_ease_curve() != Some(false) || curves.len() == 1;
        let mut main = None;
        let mut groups: Vec<(EaseGroup, Easing)> = Vec::new();
        for (n, c) in curves.iter().enumerate() {
            let target = c.target();
            // One curve for everything: the first.
            if single && n > 0 {
                break;
            }
            let group = if single || target == "all" { None } else { EaseGroup::from_key(target) };
            if group.is_none() && !single && target != "all" {
                self.report.skip("custom eases of unknown properties (left out)");
                continue;
            }
            let Some(e) = self.ease_curve(c) else { continue };
            match group {
                Some(g) if !groups.iter().any(|(x, _)| *x == g) => groups.push((g, e)),
                None if main.is_none() => main = Some(e),
                _ => {}
            }
        }
        let mut t = Tween { easing: main.unwrap_or(classic), ..Tween::default() };
        for (g, e) in groups {
            t.set_ease(g, Some(e));
        }
        (t.easing, t.groups)
    }

    /// One `<CustomEase>` curve; `None` (reported) when its points don't make a curve.
    fn ease_curve(&mut self, c: &craft_xfl::tween::CustomEase<'_, X>) -> Option<Easing> {
        // Far more than a curve keeps (longer ones are thinned), and one more to tell.
        const MAX_READ: usize = anicraft_doc::MAX_EASE_POINTS * 3 * 16 + 1;
        let pts: Vec<Vec2> = c.points().take(MAX_READ + 1).map(|point| Vec2::new(point.x().unwrap_or(0.0), point.y().unwrap_or(0.0))).collect();
        if pts.len() > MAX_READ {
            self.report.skip("custom ease curves too long to read (drawn with the simple ease)");
            return None;
        }
        let Some(curve) = CustomEase::from_flat(&pts) else {
            self.report.skip("custom ease curves with a broken point list (drawn with the simple ease)");
            return None;
        };
        let near = |p: Option<&Vec2>, x: f32, y: f32| p.is_some_and(|p| (p.x - x).abs() < 1e-3 && (p.y - y).abs() < 1e-3);
        if !near(pts.first(), 0.0, 0.0) || !near(pts.last(), 1.0, 1.0) {
            self.report.skip("custom ease curves not from (0, 0) to (1, 1) (ends moved there)");
        }
        if pts.len() / 3 + 1 > anicraft_doc::MAX_EASE_POINTS {
            self.report.skip("custom ease curves over 64 points (thinned)");
        }
        Some(match curve.points() {
            [a, b] => Easing::CubicBezier(a.out.x, a.out.y, b.at.x + b.h_in.x, b.at.y + b.h_in.y),
            _ => Easing::Custom(Arc::new(curve)),
        })
    }

    /// The hints listed in a frame's `shapeHints`, in letter order (ADR 0023). Each child is a
    /// hint; it gives its point on this keyframe as `x`/`y` (or `startPoint="x, y"`, or
    /// `startX`/`startY`), and may carry its end point too (`endPoint`, or `endX`/`endY`);
    /// otherwise the end comes from the same hint on the next keyframe. Points are in pixels.
    /// The order is `index` (or a letter `name`), else the order in the file.
    fn raw_hints(&mut self, frame: &X) -> Vec<RawHint> {
        let hints = craft_xfl::shape_hints::ShapeHints::new(frame);
        let to_vec = |point: Option<craft_xfl::shape_hints::Point>| {
            point.map(|point| Vec2::new(point.x, point.y)).filter(|point| point.x.abs() < 1e6 && point.y.abs() < 1e6)
        };
        let mut out: Vec<RawHint> = Vec::new();
        for (n, hint) in hints.iter().enumerate().take(anicraft_doc::MAX_SHAPE_HINTS * 4) {
            let order = hint.index().unwrap_or(n);
            let Some(here) = to_vec(hint.start_point()) else {
                self.report.skip("shape hints without a position");
                continue;
            };
            out.push(RawHint { order, here, end: to_vec(hint.end_point()) });
        }
        out.sort_by_key(|h| h.order);
        if out.len() > anicraft_doc::MAX_SHAPE_HINTS {
            self.report.skip("shape hints past z");
            out.truncate(anicraft_doc::MAX_SHAPE_HINTS);
        }
        out
    }

    /// Gives each shape tween on `layer` the hints its keyframes list, snapped onto the edges
    /// when they sit within a couple of pixels of one (the file's points are rounded).
    fn pair_hints(&mut self, layer: &mut Layer, raw: &HashMap<u32, Vec<RawHint>>) {
        const SNAP: f32 = 2.0;
        let snap = |els: &[Arc<anicraft_doc::Element>], p: Vec2| match anicraft_doc::nearest_outline(els, p) {
            Some((_, q, d)) if d <= SNAP => q,
            _ => p,
        };
        for i in 0..layer.keyframes.len() {
            let (Some(k), Some(next)) = (layer.keyframes.get(i), layer.keyframes.get(i + 1)) else { continue };
            let Some(list) = raw.get(&k.start) else { continue };
            if !layer.is_shape_tween(i) {
                continue;
            }
            let ends = raw.get(&next.start);
            let mut hints = Vec::new();
            for (n, h) in list.iter().enumerate() {
                // The same hint on the end keyframe: by position in its list.
                let Some(end) = h.end.or_else(|| ends.and_then(|e| e.get(n)).map(|e| e.here)) else {
                    self.report.skip("shape hints missing on the end keyframe");
                    continue;
                };
                hints.push(ShapeHint { start: snap(&k.elements, h.here), end: snap(&next.elements, end) });
            }
            if let Some(k) = layer.keyframes.get_mut(i) {
                Arc::make_mut(k).hints = hints;
            }
        }
    }

    /// Reads the document's bitmap library items. Each one's image is looked for as the
    /// original file in `LIBRARY/` (XFL folders keep it there) and then as its data file in
    /// `bin/`; either is used when it is a PNG or JPEG. Animate's own encodings of the data
    /// file are not public, so those bitmaps are reported instead.
    fn register_bitmaps(&mut self, root: &X) -> Result<(), XflError> {
        for item in craft_xfl::media::Catalog::new(root).bitmaps().take(MAX_BITMAPS) {
            let Some(name) = item.name().filter(|n| !self.bitmaps.contains_key(*n)) else { continue };
            let mut candidates = Vec::new();
            if let Some(href) = item.href() {
                candidates.push(craft_xfl::media::library_member(href));
            }
            if let Some(data) = item.data_href() {
                candidates.push(craft_xfl::media::data_member(data));
            }
            let short: String = name.rsplit('/').next().unwrap_or(name).chars().take(256).collect();
            let (mut found_data, mut unreadable) = (false, false);
            let mut bitmap = None;
            for path in candidates {
                let bytes = match (self.read)(&path) {
                    Ok(Some(bytes)) => bytes,
                    Ok(None) => continue,
                    // Damaged or over the archive's limits: this bitmap is left out, not
                    // the whole document (#226).
                    Err(_) => {
                        unreadable = true;
                        continue;
                    }
                };
                found_data = true;
                if let Ok(b) = Bitmap::from_image(BitmapId(0), short.clone(), bytes) {
                    bitmap = Some(b);
                    break;
                }
            }
            match bitmap {
                Some(mut b) => {
                    b.id = BitmapId(self.doc.alloc_id());
                    // Animate leaves out the default (smoothing on in current versions).
                    b.smoothing = item.allow_smoothing().unwrap_or(true);
                    self.place_in_folder(name, anicraft_doc::LibraryItem::Bitmap(b.id));
                    self.bitmaps.insert(name.to_string(), b.id);
                    self.doc.bitmaps.push(Arc::new(b));
                }
                None if found_data => self.report.skip("bitmaps stored in Animate's own format"),
                None if unreadable => self.report.skip("bitmaps whose files couldn't be read"),
                None => self.report.skip("missing bitmap files"),
            }
        }
        Ok(())
    }

    /// Reads the document's sound library items (ADR 0057, ADR 0086). Like a bitmap, each one's
    /// sound is looked for as the original file in `LIBRARY/` and then as its data file in
    /// `bin/`, and is used when it is a WAV, Ogg Vorbis or MP3 file the decoders read. Animate's
    /// own encoding of the data file is not public, so those sounds are reported by name, as is
    /// every other sound that doesn't come across, with its format and why (ADR 0039).
    fn register_sounds(&mut self, root: &X) -> Result<(), XflError> {
        for item in craft_xfl::media::Catalog::new(root).sounds().take(MAX_SOUNDS) {
            let Some(name) = item.name().filter(|n| !self.sounds.contains_key(*n)) else { continue };
            let mut candidates = Vec::new();
            if let Some(href) = item.href() {
                candidates.push((craft_xfl::media::library_member(href), false));
            }
            if let Some(data) = item.data_href() {
                candidates.push((craft_xfl::media::data_member(data), true));
            }
            let short: String = name.rsplit('/').next().unwrap_or(name).chars().take(256).collect();
            let shown: String = name.chars().take(256).collect();
            // Why the first file found didn't decode, and whether one couldn't be read at all.
            let (mut why, mut unreadable) = (None, false);
            let mut sound = None;
            for (path, from_bin) in candidates {
                let bytes = match (self.read)(&path) {
                    Ok(Some(bytes)) => bytes,
                    Ok(None) => continue,
                    // Damaged or over the archive's limits: this sound is left out, not
                    // the whole document (#226).
                    Err(_) => {
                        unreadable = true;
                        continue;
                    }
                };
                // Named from the first bytes, before the data moves into the sound.
                let head: Vec<u8> = bytes.iter().take(4096).copied().collect();
                match anicraft_doc::Sound::from_data(anicraft_doc::SoundId(0), short.clone(), bytes) {
                    Ok(s) => {
                        sound = Some(s);
                        break;
                    }
                    Err(e) => {
                        why.get_or_insert_with(|| sound_format(&head, from_bin, &e));
                    }
                }
            }
            match (sound, why) {
                (Some(mut s), _) => {
                    s.id = anicraft_doc::SoundId(self.doc.alloc_id());
                    self.place_in_folder(name, anicraft_doc::LibraryItem::Sound(s.id));
                    self.sounds.insert(name.to_string(), s.id);
                    self.doc.sounds.push(Arc::new(s));
                }
                (None, Some(why)) => self.report.skip_named("sounds in formats AniCraft can't decode", format!("{shown}: {why}")),
                (None, None) if unreadable => self.report.skip_named("sounds whose files couldn't be read", shown),
                (None, None) => self.report.skip_named("missing sound files", shown),
            }
        }
        Ok(())
    }

    /// Reads the document's video items (`DOMVideoItem`, ADR 0086). AniCraft has no video
    /// playback: a video whose data is an FLV file in the Screen Video codec comes across as a
    /// bitmap of its first frame (in the Library beside where the video was, named
    /// "<video> (first frame)"), which its instances show; every video is named in the report
    /// with its format and length, so nothing is dropped unseen. The data is looked for as the
    /// original file (`href`, or `sourceExternalFilepath` inside the package) in `LIBRARY/`, then
    /// as its data file in `bin/` (`videoDataHRef`).
    fn register_videos(&mut self, root: &X) {
        for item in craft_xfl::media::Catalog::new(root).videos().take(MAX_VIDEOS) {
            let Some(name) = item.name().filter(|n| !self.videos.contains_key(*n)) else { continue };
            let mut candidates = Vec::new();
            if let Some(href) = item.href() {
                candidates.push(craft_xfl::media::library_member(href));
            }
            if let Some(path) = item.external_path().and_then(craft_xfl::media::packaged_external_member) {
                candidates.push(path);
            }
            if let Some(data) = item.data_href() {
                candidates.push(craft_xfl::media::data_member(data));
            }
            let shown: String = name.chars().take(256).collect();
            let short: String = name.rsplit('/').next().unwrap_or(name).chars().take(240).collect();
            let (mut still, mut format, mut unreadable) = (None, None, false);
            for path in candidates {
                let bytes = match (self.read)(&path) {
                    Ok(Some(bytes)) => bytes,
                    Ok(None) => continue,
                    Err(_) => {
                        unreadable = true;
                        continue;
                    }
                };
                match crate::video::read(&bytes) {
                    crate::video::Video::Frame { width, height, rgba } => {
                        still = Bitmap::from_rgba(BitmapId(0), format!("{short} (first frame)"), width, height, rgba);
                        if still.is_some() {
                            break;
                        }
                    }
                    crate::video::Video::Unreadable(f) => {
                        format.get_or_insert(f);
                    }
                }
            }
            // Its length as the item gives it (seconds), else from its frames and rate.
            let seconds = item.length().filter(|s| *s >= 0.0).or_else(|| {
                let (frames, fps) = (item.frame_count()?, item.frames_per_second()?);
                (frames.is_finite() && fps.is_finite() && fps > 0.0).then(|| frames.max(0.0) / fps)
            });
            let length = seconds.map(|s| format!(", {:.1} s", s.min(1.0e7))).unwrap_or_default();
            let id = match still {
                Some(mut b) => {
                    b.id = BitmapId(self.doc.alloc_id());
                    let id = b.id;
                    let folder = name.rsplit_once('/').map(|(f, _)| f);
                    let path = match folder {
                        Some(f) => format!("{f}/{}", b.name),
                        None => b.name.clone(),
                    };
                    self.place_in_folder(&path, anicraft_doc::LibraryItem::Bitmap(id));
                    self.doc.bitmaps.push(Arc::new(b));
                    self.report.skip_named("videos (first frame kept as a still)", format!("{shown}: Screen Video{length}"));
                    Some(id)
                }
                None => {
                    let why = match (format, unreadable) {
                        (Some(f), _) => f,
                        (None, true) => "its file couldn't be read".into(),
                        (None, false) => "its file is missing".into(),
                    };
                    self.report.skip_named("videos AniCraft can't play", format!("{shown}: {why}{length}"));
                    None
                }
            };
            self.videos.insert(name.to_string(), id);
        }
    }

    /// The sound on a frame (`soundName`, the library item), with its sync (`soundSync`: event,
    /// start, stop or stream), repeats (`soundLoopMode` loop or repeat, `soundLoop` times) and
    /// effect (`soundEffect`, and the volume points of a custom one in `SoundEnvelope`).
    /// Buttons' frames included: they play as the pointer changes the button's state.
    fn frame_sound(&mut self, f: &X) -> Option<FrameSound> {
        let native = craft_xfl::sound::FrameSound::new(f);
        let name = native.name()?;
        let Some(id) = self.sounds.get(name).copied() else {
            self.report.skip("frame sounds whose sound isn't in the package");
            return None;
        };
        let mut fs = FrameSound::new(id);
        fs.sync = match native.sync_mode() {
            craft_xfl::sound::SyncMode::Start => SoundSync::Start,
            craft_xfl::sound::SyncMode::Stop => SoundSync::Stop,
            craft_xfl::sound::SyncMode::Stream => SoundSync::Stream,
            craft_xfl::sound::SyncMode::Event => SoundSync::Event,
        };
        fs.looping = native.looping();
        fs.repeat = native.repeat().unwrap_or(1).clamp(1, anicraft_doc::sound::MAX_REPEAT);
        fs.effect = self.sound_effect(&native);
        if native.has_in_point() || native.has_out_point() {
            self.report.skip("sound in and out points (played whole)");
        }
        Some(fs)
    }

    /// A frame sound's effect: a preset by its name in the Effect menu (`soundEffect`), or the
    /// volume points of its envelope (`SoundEnvelope`; each `SoundEnvelopePoint` a time in
    /// samples at 44.1 kHz, `mark44`, and a level per channel, `level0` left and `level1` right,
    /// `0..=32768`, as the SWF format's `SOUNDENVELOPE` keeps them).
    fn sound_effect(&mut self, frame: &craft_xfl::sound::FrameSound<'_, X>) -> SoundEffect {
        let key = frame.effect_key();
        let preset = match key.as_str() {
            "" | "none" => Some(SoundEffect::None),
            "left" | "leftchannel" => Some(SoundEffect::LeftChannel),
            "right" | "rightchannel" => Some(SoundEffect::RightChannel),
            "fadelefttoright" => Some(SoundEffect::FadeLeftToRight),
            "faderighttoleft" => Some(SoundEffect::FadeRightToLeft),
            "fadein" => Some(SoundEffect::FadeIn),
            "fadeout" => Some(SoundEffect::FadeOut),
            _ => None,
        };
        let points: Vec<EnvelopePoint> = frame
            .envelope_points()
            .take(anicraft_doc::sound::MAX_ENVELOPE_POINTS)
            .map(|point| {
                let level = |value: Option<f32>| value.map_or(1.0, |value| value / 32_768.0);
                EnvelopePoint::new(f64::from(point.mark44().unwrap_or(0.0)) / 44_100.0, level(point.level0()), level(point.level1()))
            })
            .collect();
        match preset {
            // An envelope without a preset name (or named "custom") plays as its points.
            Some(SoundEffect::None) | None if !points.is_empty() => SoundEffect::Custom(clean_points(&points)),
            Some(p) => p,
            None if key == "custom" => SoundEffect::None,
            None => {
                self.report.skip("unknown sound effects (played without)");
                SoundEffect::None
            }
        }
    }

    /// Allocates ids for every symbol the document lists, parsing their files.
    fn register_symbols(&mut self, root: &X) -> Result<(), XflError> {
        let mut seen = HashSet::new();
        for inc in craft_xfl::document::symbol_includes(root).take(MAX_SYMBOLS) {
            let Some(href) = inc.href() else { continue };
            if !seen.insert(href.to_string()) {
                continue;
            }
            // A damaged symbol file is left out (its instances with it), not the whole
            // document (#226).
            let bytes = match (self.read)(&format!("LIBRARY/{href}")) {
                Ok(Some(bytes)) => bytes,
                Ok(None) => {
                    self.report.skip("missing library files");
                    continue;
                }
                Err(_) => {
                    self.report.skip("library files that couldn't be read");
                    continue;
                }
            };
            let parsed = match craft_xfl::document::Document::parse(&bytes) {
                Ok(parsed) => parsed,
                Err(_) => {
                    self.report.skip("library files that couldn't be read");
                    continue;
                }
            };
            let (model, xml_root) = parsed.into_parts(craft_xfl::document::ModelLimits { max_timelines: 0, max_layers_per_timeline: MAX_LAYERS });
            let item = match xml::from_craft_xml_owned_local_names(xml_root) {
                Ok(item) => item,
                Err(_) => {
                    self.report.skip("library files that couldn't be read");
                    continue;
                }
            };
            if item.name != "DOMSymbolItem" {
                continue;
            }
            let symbol = craft_xfl::document::SymbolItem::new(&item);
            let name = symbol.name().map(str::to_string).unwrap_or_else(|| href.trim_end_matches(".xml").to_string());
            // The format leaves out default values, and a symbol's default type is movie clip:
            // only graphics and buttons say what they are.
            let kind = match symbol.symbol_type().map(str::trim) {
                Some("graphic") => SymbolKind::Graphic,
                Some("button") => SymbolKind::Button,
                _ => SymbolKind::MovieClip,
            };
            let id = SymbolId(self.doc.alloc_id());
            let linkage = self.linkage(symbol);
            self.ids.insert(name.clone(), id);
            self.pending.push(PendingSymbol { id, name, kind, linkage, item, timeline: model.symbol_timeline });
        }
        Ok(())
    }

    /// A library symbol's script class (`linkageClassName`, or an older document's
    /// `linkageIdentifier`, when `linkageExportForAS` doesn't turn it off) and its base class.
    fn linkage(&mut self, item: craft_xfl::document::SymbolItem<'_, X>) -> Option<Linkage> {
        if item.linkage_export_for_action_script().is_some_and(|v| v.trim() != "true") {
            return None;
        }
        let class = [item.linkage_class_name(), item.linkage_identifier()]
            .into_iter()
            .flatten()
            .map(str::trim)
            .find(|class| !class.is_empty())?;
        let base = item
            .linkage_base_class()
            .map(str::trim)
            .filter(|base| anicraft_doc::actions::valid_class_name(base))
            .unwrap_or("");
        let l = Linkage { class: class.to_string(), base: base.to_string() };
        if l.check().is_err() {
            self.report.skip("linkage classes that aren't class names (left out)");
            return None;
        }
        self.report.keep("linkage classes");
        Some(l)
    }

    /// A symbol's 9-slice guides (ADR 0055): `scaleGridLeft`, `scaleGridRight`, `scaleGridTop`
    /// and `scaleGridBottom` on the `DOMSymbolItem`, in the symbol's space, written when its
    /// guides are on. All four or none; guides given the wrong way round are put in order.
    fn scale_grid(&mut self, item: craft_xfl::document::SymbolItem<'_, X>) -> Option<ScaleGrid> {
        if !item.has_scale_grid() {
            return None;
        }
        let grid = match (item.scale_grid_left(), item.scale_grid_right(), item.scale_grid_top(), item.scale_grid_bottom()) {
            (Some(left), Some(right), Some(top), Some(bottom)) => Some(ScaleGrid {
                left: left.min(right),
                right: left.max(right),
                top: top.min(bottom),
                bottom: top.max(bottom),
            }),
            _ => None,
        };
        let grid = grid.filter(|g| g.check().is_ok());
        if grid.is_none() {
            self.report.skip("9-slice guides that aren't usable (left out)");
        }
        grid
    }

    /// The script settings of the package's publish profile (`PublishSettings.xml`): the
    /// language its frame scripts are written in (`ActionScriptVersion`; 3 when the file
    /// doesn't say) and the document class (`DocumentClass`). The profile marked current is
    /// used, else the first. A missing or unreadable file changes nothing: it is settings, not
    /// content.
    fn publish_settings(&mut self) -> Result<(), XflError> {
        // Optional: settings that can't be read leave the defaults (#226).
        let Ok(Some(bytes)) = (self.read)("PublishSettings.xml") else { return Ok(()) };
        let Ok(document) = craft_xfl::document::Document::parse(&bytes) else { return Ok(()) };
        let settings = document.publish_settings();
        self.language = match settings.action_script_version.as_deref() {
            Some("1" | "2") => Language::ActionScript1or2,
            _ => Language::ActionScript3,
        };
        if let Some(class) = settings.document_class {
            if anicraft_doc::actions::valid_class_name(&class) {
                self.doc.document_class = class.to_string();
                self.report.keep("document class");
            } else {
                self.report.skip("document classes that aren't class names (left out)");
            }
        }
        Ok(())
    }

    fn build_symbols(&mut self) {
        for PendingSymbol { id, name, kind, linkage, item, timeline: schema_timeline } in std::mem::take(&mut self.pending) {
            let timeline = match item.child("timeline").and_then(|t| t.child("DOMTimeline")).zip(schema_timeline.as_ref()) {
                Some((tl, schema)) => self.timeline(tl, schema),
                None => Timeline { layers: vec![Arc::new(Layer::new(LayerId(self.doc.alloc_id()), "Layer 1"))] },
            };
            let short = name.rsplit('/').next().unwrap_or(&name).to_string();
            let scale_grid = self.scale_grid(craft_xfl::document::SymbolItem::new(&item));
            self.doc.library.push(Arc::new(Symbol { id, name: short, kind, linkage, scale_grid, scale_grid_kept: None, timeline }));
            self.place_in_folder(&name, anicraft_doc::LibraryItem::Symbol(id));
        }
    }

    /// The Library's folders (`<folders>`, so empty ones come across too), each a path such as
    /// `Characters/Hero` (ADR 0050).
    fn register_folders(&mut self, root: &X) {
        for folder in craft_xfl::document::library_folders(root).take(anicraft_doc::library::MAX_FOLDERS) {
            if let Some(path) = folder.name() {
                self.doc.ensure_folder_path(path);
            }
        }
    }

    /// Puts `item` in the folder its library name's path names (`Characters/Ball` is in
    /// `Characters`), made if `<folders>` didn't list it.
    fn place_in_folder(&mut self, name: &str, item: anicraft_doc::LibraryItem) {
        if let Some((dir, _)) = name.rsplit_once('/')
            && let Some(f) = self.doc.ensure_folder_path(dir)
        {
            self.doc.place_entry(anicraft_doc::LibraryEntry::Item(item), Some(f));
        }
    }
}

/// Imports an XFL package through `read` (paths inside the package). Text is laid out with
/// the fonts on this computer.
pub fn import_with(read: &Reader<'_>) -> Result<(Document, Report), XflError> {
    import_from(read, None)
}

/// Imports an XFL package, laying text out with `fonts` (tests, and hosts with their own font
/// library).
pub fn import_with_fonts(read: &Reader<'_>, fonts: &Fonts) -> Result<(Document, Report), XflError> {
    import_from(read, Some(fonts))
}

fn import_from<'a>(read: &'a Reader<'a>, fonts: Option<&'a Fonts>) -> Result<(Document, Report), XflError> {
    let bytes = read("DOMDocument.xml")?.ok_or_else(|| XflError::NotXfl("no DOMDocument.xml".into()))?;
    let parsed = craft_xfl::document::Document::parse(&bytes).map_err(xml::from_craft_error)?;
    let (schema, xml_root) =
        parsed.into_parts(craft_xfl::document::ModelLimits { max_timelines: anicraft_doc::MAX_SCENES, max_layers_per_timeline: MAX_LAYERS });
    let root = xml::from_craft_xml_owned_local_names(xml_root)?;
    if root.name != "DOMDocument" {
        return Err(XflError::NotXfl(format!("the root element is <{}>", root.name)));
    }
    let mut b = Builder {
        doc: Document::default(),
        read,
        ids: HashMap::new(),
        pending: Vec::new(),
        language: Language::ActionScript3,
        bitmaps: HashMap::new(),
        sounds: HashMap::new(),
        videos: HashMap::new(),
        report: Report::default(),
        fonts,
        faces: HashMap::new(),
    };
    b.publish_settings()?;
    // Only symbols keep a script class yet.
    for _ in root.list("media").iter().filter(|m| m.attr("linkageClassName").is_some_and(|c| !c.trim().is_empty())) {
        b.report.skip("linkage classes on bitmaps and sounds (left out)");
    }
    b.doc.library.clear();
    b.doc.scenes.clear();
    let stage = schema.stage;
    b.doc.stage = Stage {
        width: stage.width.unwrap_or(550.0).clamp(1.0, 8192.0) as u32,
        height: stage.height.unwrap_or(400.0).clamp(1.0, 8192.0) as u32,
        fps: stage.frame_rate.unwrap_or(24.0).clamp(1.0, 120.0),
        // Animate leaves the default, white, out of the file (#163).
        background: if stage.has_background_color { color(&root, "backgroundColor", "__none") } else { Rgba::WHITE },
    };
    b.register_folders(&root);
    b.register_bitmaps(&root)?;
    b.register_sounds(&root)?;
    b.register_videos(&root);
    b.register_symbols(&root)?;
    b.build_symbols();
    // Every DOMTimeline is a scene, in order.
    let scenes: Vec<&X> = root.list("timelines").iter().filter(|t| t.name == "DOMTimeline").take(anicraft_doc::MAX_SCENES).collect();
    for (i, (tl, schema_timeline)) in scenes.iter().zip(&schema.timelines).enumerate() {
        let name: String =
            tl.attr("name").filter(|n| !n.trim().is_empty()).map_or_else(|| format!("Scene {}", i + 1), |n| n.chars().take(256).collect());
        let timeline = b.timeline(tl, schema_timeline);
        b.doc.scenes.push(Arc::new(Scene { name, timeline, guides: Vec::new() }));
    }
    if !b.doc.library_tree.folders.is_empty() {
        b.report.keep("library folders");
    }
    if b.doc.scenes.is_empty() {
        let timeline = Timeline { layers: vec![Arc::new(Layer::new(LayerId(b.doc.alloc_id()), "Layer 1"))] };
        b.doc.scenes.push(Arc::new(Scene { name: "Scene 1".into(), timeline, guides: Vec::new() }));
    }
    Ok((b.doc, b.report))
}

/// Largest `.fla` archive read.
pub const MAX_FLA_BYTES: u64 = crate::zip::MAX_ENTRY as u64 * 4;

/// The first bytes of a compound (OLE) file: a `.fla` saved by Flash CS4 or earlier.
const OLE_MAGIC: [u8; 8] = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

/// Imports a `.fla` archive from its bytes (a file the browser handed over, say). Text is laid
/// out with the fonts on this computer.
pub fn import_fla(data: &[u8]) -> Result<(Document, Report), XflError> {
    fla_from(data, None)
}

/// Imports a `.fla` archive, laying text out with `fonts` (tests, and hosts with their own
/// font library).
pub fn import_fla_with_fonts(data: &[u8], fonts: &Fonts) -> Result<(Document, Report), XflError> {
    fla_from(data, Some(fonts))
}

fn fla_from(data: &[u8], fonts: Option<&Fonts>) -> Result<(Document, Report), XflError> {
    if data.len() as u64 > MAX_FLA_BYTES {
        return Err(XflError::NotXfl("the file is too large".into()));
    }
    if data.starts_with(&OLE_MAGIC) {
        return Err(XflError::NotXfl(
            "this .fla was saved by Flash CS4 or earlier, in a format AniCraft can't read: open it in Animate and save it again".into(),
        ));
    }
    let archive = crate::zip::Archive::open(data)?;
    let root = package_root(&archive)?;
    let read = |p: &str| -> Result<Option<Vec<u8>>, XflError> { Ok(archive.read(&format!("{root}{p}"))?) };
    import_from(&read, fonts)
}

/// Where the package sits in an archive (ADR 0086): at its root, as Animate saves a `.fla`, or
/// inside one top folder (`walk/DOMDocument.xml`), as zipping an XFL folder makes it. The
/// `__MACOSX` folder some zip tools add beside it is ignored. An archive holding several
/// documents in top folders is refused with their names rather than one picked.
fn package_root(archive: &crate::zip::Archive<'_>) -> Result<String, XflError> {
    match archive.xfl_package_root() {
        crate::zip::XflPackageRoot::Document | crate::zip::XflPackageRoot::Missing => Ok(String::new()),
        crate::zip::XflPackageRoot::Folder(top) => Ok(format!("{top}/")),
        crate::zip::XflPackageRoot::Multiple(many) => {
            let names: Vec<String> = many.iter().take(5).map(|t| t.chars().take(80).collect()).collect();
            let more = if many.len() > 5 { format!(" and {} more", many.len() - 5) } else { String::new() };
            Err(XflError::NotXfl(format!("the archive holds {} Animate documents ({}{more}): unzip it and open one of them", many.len(), names.join(", "))))
        }
    }
}

/// Whether the file at `path` starts as a zip archive or an old binary `.fla` does.
fn looks_like_fla(path: &std::path::Path) -> bool {
    use std::io::Read;
    let mut head = [0u8; 8];
    let n = std::fs::File::open(path).and_then(|mut f| f.read(&mut head)).unwrap_or(0);
    head.get(..n).is_some_and(|h| h.starts_with(b"PK\x03\x04") || h.starts_with(b"PK\x05\x06") || h.starts_with(&OLE_MAGIC))
}

/// Imports from disk: an XFL folder, its `.xfl` file (or any file in the folder, such as its
/// `DOMDocument.xml`), or a `.fla` archive (recognised by its contents too, so a renamed one
/// opens).
pub fn import_path(path: &std::path::Path) -> Result<(Document, Report), XflError> {
    let meta = std::fs::metadata(path)?;
    let is_fla = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("fla"));
    if meta.is_file() && (is_fla || looks_like_fla(path)) {
        if meta.len() > MAX_FLA_BYTES {
            return Err(XflError::NotXfl("the file is too large".into()));
        }
        return import_fla(&std::fs::read(path)?);
    }
    let dir = if meta.is_dir() { path.to_path_buf() } else { path.parent().map(std::path::Path::to_path_buf).unwrap_or_default() };
    let read = |p: &str| -> Result<Option<Vec<u8>>, XflError> {
        // Only plain relative paths inside the package.
        if p.split('/').any(|c| c == ".." || c.is_empty()) || p.contains(':') {
            return Ok(None);
        }
        let full = dir.join(p);
        match std::fs::read(&full) {
            Ok(b) if b.len() <= xml::MAX_INPUT => Ok(Some(b)),
            Ok(_) => Err(XflError::NotXfl(format!("{p} is too large"))),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    };
    import_with(&read)
}

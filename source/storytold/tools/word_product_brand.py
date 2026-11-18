"""Narrow Word display/generator branding; never migrate personal document metadata."""
import json


DISPLAY = {
    'crates/ui-egui/src/dialogs/chrome.rs': {
        'About WordCraft': 'About {label}',
        'Dialog::SaveChanges { .. } => "WordCraft"': 'Dialog::SaveChanges {{ .. }} => "{label}"',
    },
    'crates/ui-egui/src/dialogs/dispatch.rs': {
        'tl!("WordCraft")': 'tl!("{label}")',
        'A free, open-source word processor written from scratch in Rust.\\nPart of the Crafting Apps from the ArtCraft team.':
            'A free, open-source document editor.\\nBased on the original WordCraft application by the ArtCraft team.',
        'getartcraft.com/apps/wordcraft': 'Upstream application: getartcraft.com/apps/wordcraft',
        'Join us on Discord: discord.gg/artcraft': 'Upstream community: discord.gg/artcraft',
        'Source code: github.com/storytold/wordcraft': 'Original source: github.com/storytold/wordcraft',
        'without it nobody, WordCraft included, can open the document.': 'without it nobody can open the document.',
    },
    'crates/ui-egui/src/backstage.rs': {
        'Browse in WordCraft…': 'Browse in this application…',
        "Open a file with WordCraft's own browser when the system file dialog doesn't appear.":
            "Open a file with the built-in browser when the system file dialog doesn't appear.",
    },
    'crates/ui-egui/src/backstage/tests.rs': {'Browse in WordCraft…': 'Browse in this application…'},
    'crates/ui-egui/src/print_page.rs': {'Browse in WordCraft…': 'Browse in this application…'},
    'crates/ui-egui/src/options/tests.rs': {'Show the Start screen when WordCraft starts': 'Show the Start screen when this application starts'},
    'crates/ui-egui/src/tests.rs': {'Make WordCraft the default for Word documents…': 'Make this application the default for Word documents…'},
    'crates/ui-egui/src/options.rs': {
        'Show the Start screen when WordCraft starts': 'Show the Start screen when this application starts',
        'On: WordCraft opens on File': 'On: this application opens on File',
        'AutoSave documents you have saved in WordCraft': 'AutoSave documents you have saved in this application',
        "{language}: WordCraft doesn't check spelling or grammar in this language yet.":
            "{{language}}: this application doesn't check spelling or grammar in this language yet.",
        'Applies the next time WordCraft starts.': 'Applies the next time this application starts.',
        'where you choose WordCraft for .docx': 'where you choose this application for .docx',
        'and Word templates with WordCraft from now on.': 'and Word templates with this application from now on.',
        'Make WordCraft the default for Word documents…': 'Make this application the default for Word documents…',
        'To open Word documents with WordCraft by default: select one in Finder, choose File › Get Info, pick WordCraft under Open with, then click Change All.':
            'To open Word documents with this application by default: select one in Finder, choose File › Get Info, pick this application under Open with, then click Change All.',
    },
    'crates/ui-egui/src/app/commands.rs': {
        'making WordCraft the default app needs a click': 'making this application the default app needs a click',
        "WordCraft can't change the default apps here": "This application can't change the default apps here",
        'In Default apps, choose WordCraft for the document types': 'In Default apps, choose this application for the document types',
        'WordCraft is now the default app for Word documents.': 'This application is now the default app for Word documents.',
        "Couldn't make WordCraft the default: {error}": "Couldn't make this application the default: {{error}}",
    },
    'crates/ui-egui/src/chrome.rs': {'WordCraft looks for the Hunspell dictionary': 'This application looks for the Hunspell dictionary'},
    'crates/ui-egui/src/file_browser.rs': {"so WordCraft shows its own.": 'so this application shows its own.'},
    'crates/ui-egui/src/language_packs.rs': {
        'WordCraft then downloads language packs and fonts from GitHub.': 'this application then downloads language packs and fonts from GitHub.',
        'The spelling and hyphenation data WordCraft uses, and their licences.': 'The spelling and hyphenation data this application uses, and their licences.',
    },
    'crates/ui-egui/src/ribbon/view.rs': {'No other WordCraft windows are open.': 'No other document editor windows are open.'},
    'apps/wordcraft/src/clipboard.rs': {"WordCraft can't decode its format": "This application can't decode its format"},
    'apps/wordcraft/src/default_apps.rs': {'choose WordCraft under Open With': 'choose this application under Open With'},
    'apps/wordcraft/src/print.rs': {'"WordCraft document"': '"{label} document"'},
    'apps/wordcraft-web/src/web.rs': {'<p>WordCraft failed to start: {e:?}</p>': '<p>{label} failed to start: {{e:?}}</p>'},
    'crates/ui-egui/src/zotero.rs': {
        'Zotero works with the WordCraft desktop app': 'Zotero works with the native document editor',
        'WordCraft closed the document': 'The document editor closed the document',
        'WordCraft replaced the document this command started in': 'The document editor replaced the document this command started in',
    },
    'crates/ui-egui/src/updates_ui.rs': {
        "Updates are off in this window: WordCraft was started with another program's AppImage settings. Start WordCraft from its own menu entry to update it.":
            "Updates are off in this window: the document editor was started with another program's AppImage settings. Start the editor from its own menu entry to update it.",
    },
}

# Original files outside the UI that have one deliberate product adapter/default change.
EXTRA = {
    'xtask/src/main.rs',
    'crates/docx/src/lib.rs', 'crates/pdf/src/metadata.rs', 'crates/pdf/src/tests.rs',
    'crates/engine/src/session/lifecycle.rs', 'crates/engine/src/tests.rs',
    'crates/docx/tests/it/roundtrip.rs',
    'crates/docx/tests/it/passthrough.rs',
    'crates/formats/src/rtf.rs', 'crates/formats/src/latex.rs', 'crates/formats/src/odt.rs', 'crates/formats/src/tests.rs',
}

WASM_OLD = '''fn wasm_set() -> Result<Vec<String>, String> {
    let crates = layers::from_metadata(&metadata()?)?;
    Ok(crates
        .into_iter()
        .filter(|c| match layers::classify(&c.name) {
            Some(layers::Class::Layer(l)) => l <= 5 || layers::short_name(&c.name) == "ui-egui",
            Some(layers::Class::Standalone) => true,
            _ => false,
        })
        .map(|c| c.name)
        .collect())
}'''

WASM_CURRENT = '''fn wasm_set() -> Result<Vec<String>, String> {
    wasm_set_from_metadata(&metadata()?)
}

fn wasm_set_from_metadata(meta: &serde_json::Value) -> Result<Vec<String>, String> {
    let packages = meta["packages"].as_array().ok_or("metadata: no packages array")?;
    let members = meta["workspace_members"].as_array().ok_or("metadata: no workspace members array")?;
    let mut selected = Vec::new();
    for member in members {
        let id = member.as_str().ok_or("workspace member without package ID")?;
        let package = packages.iter().find(|p| p["id"].as_str() == Some(id)).ok_or("workspace member missing from packages")?;
        let name = package["name"].as_str().ok_or("package without name")?;
        let include = match layers::classify(name) {
            Some(layers::Class::Layer(l)) => l <= 5 || layers::short_name(name) == "ui-egui",
            Some(layers::Class::Standalone) => true,
            _ => false,
        };
        if include {
            // Cargo's exact package ID distinguishes the owned writer from a
            // same-name/version Git dependency still required by spreadsheets.
            selected.push((name, id));
        }
    }
    selected.sort_unstable();
    Ok(selected.into_iter().map(|(_, id)| id.to_owned()).collect())
}'''

WASM_TESTS = '''
#[cfg(test)]
mod wasm_tests {
    use super::wasm_set_from_metadata;
    use serde_json::json;

    #[test]
    fn exact_workspace_specs_keep_wasm_scope_despite_matching_git_package_names() {
        let names = [
            "craft-docx",
            "craft-latex",
            "craft-odf",
            "craft-rtf",
            "wordcraft-control-key",
            "wordcraft-doc",
            "wordcraft-ui-egui",
            "wordcraft-cli",
            "wordcraft-testkit",
        ];
        let members: Vec<String> = names.iter().map(|name| format!("path+file:///workspace/{name}#0.1.0")).collect();
        let git_id = "git+https://github.com/storytold/craft-libs?rev=41fb227542efb8a7748caa1c659f271d8605303c#craft-odf@0.1.0";
        let mut packages = vec![json!({"name": "craft-odf", "id": git_id, "dependencies": []})];
        packages.extend(names.iter().zip(&members).map(|(name, id)| json!({"name": name, "id": id, "dependencies": []})));
        let metadata = json!({"workspace_members": members, "packages": packages});
        let actual = wasm_set_from_metadata(&metadata).unwrap();
        let expected: Vec<_> = names[..7].iter().map(|name| format!("path+file:///workspace/{name}#0.1.0")).collect();
        assert_eq!(actual, expected);
        assert!(!actual.iter().any(|id| id == git_id));
    }

    #[test]
    fn malformed_or_missing_workspace_package_ids_cannot_silently_drop_checks() {
        for metadata in [
            json!({"packages": []}),
            json!({"workspace_members": [17], "packages": []}),
            json!({"workspace_members": ["missing"], "packages": []}),
            json!({"workspace_members": ["without-name"], "packages": [{"id": "without-name"}]}),
        ] {
            assert!(wasm_set_from_metadata(&metadata).is_err(), "{metadata}");
        }
    }
}
'''


def purpose(relative):
    if relative == 'xtask/src/main.rs':
        return 'Use exact Cargo workspace IDs for complete WASM checks; retain same-name Git dependencies'
    if relative.startswith('crates/engine/'):
        return 'Neutral new-session author only; retain explicit saved names and document history'
    if relative.startswith('crates/pdf/'):
        return 'Product PDF generator label; preserve creator, export author and privacy options'
    if relative.startswith('crates/docx/'):
        return 'Product software identity through writer options; preserve authors, history and custom properties'
    if relative.startswith('crates/formats/'):
        return 'Product generator options for complete RTF, LaTeX and OpenDocument writers; preserve original document conversion'
    return 'Owner display labels and account icon; retain command IDs, features and upstream attribution'


def transform(relative, text, label, owner):
    changed = text
    for old, new in DISPLAY.get(relative, {}).items():
        # URLs remain exact protocol destinations. Only their visible captions change.
        if relative.endswith('dialogs/dispatch.rs') and old == 'getartcraft.com/apps/wordcraft':
            old, new = 'tl!("'+old+'")', 'tl!("'+new+'")'
        changed = changed.replace(old, new.format(label=label, owner=owner))
    if relative == 'xtask/src/main.rs':
        changed = changed.replace(WASM_OLD, WASM_CURRENT)
        if 'fn exact_workspace_specs_keep_wasm_scope_despite_matching_git_package_names()' not in changed:
            changed += WASM_TESTS
    elif relative == 'crates/engine/src/session/lifecycle.rs':
        changed = changed.replace('author: "WordCraft User".into()', 'author: "User".into()')
    elif relative == 'crates/engine/src/tests.rs':
        changed = changed.replace('(RevisionKind::Format, "WordCraft User")', '(RevisionKind::Format, "User")')
        changed = changed.replace('assert_eq!(s.author, "WordCraft User", "a refused name leaves the author alone")',
                                  'assert_eq!(s.author, "User", "a refused name leaves the author alone")')
    elif relative == 'crates/ui-egui/src/chrome.rs':
        changed = changed.replace('session.author == "WordCraft User"', 'session.author == "User"')
    elif relative == 'crates/ui-egui/src/tests.rs':
        changed = changed.replace('assert_eq!(session.author, "WordCraft User");', 'assert_eq!(session.author, "User");')
        changed = changed.replace('''    session.author = "WordCraft User".into();
    session.initials = "WU".into();''', '''    session.author = "WordCraft User".into();
    session.initials.clear();
    assert_eq!(crate::chrome::account_initials(&session).as_deref(), Some("WU"));
    session.initials = "WU".into();''')
    elif relative == 'crates/ui-egui/src/options/tests.rs':
        changed = changed.replace('.value("WordCraft User")', '.value("User")')
        if 'fn product_default_does_not_migrate_stored_authors_or_loaded_metadata()' not in changed:
            changed += '''
#[test]
fn product_default_does_not_migrate_stored_authors_or_loaded_metadata() {
    let fresh = app();
    assert_eq!(fresh.session.author, "User");
    for (author, initials) in [("WordCraft User", ""), ("Ana Lee", "AL"), ("", "X")] {
        let mut loaded = app();
        loaded.session.doc.core.creator = "Existing creator".into();
        loaded.session.doc.core.last_modified_by = "Existing editor".into();
        let before = loaded.session.doc.clone();
        let preferences = serde_json::to_vec(&json!({"author": author, "initials": initials})).unwrap();
        loaded.apply_prefs(UiState::from_json(&preferences).unwrap());
        assert_eq!(loaded.session.author, author);
        assert_eq!(loaded.session.initials, initials);
        assert_eq!(loaded.session.doc, before);
        let restored = loaded.prefs();
        assert_eq!(restored.author.as_deref(), Some(author));
        assert_eq!(restored.initials, initials);
    }
}
'''
    elif relative == 'crates/ui-egui/src/i18n/audit.rs':
        changed = changed.replace('"WordCraft User" | "User" | "User"', '"WordCraft User" | "User"')
        if '"WordCraft User" | "User"' not in changed:
            changed = changed.replace('"WordCraft" | "WordCraft User"', '"WordCraft" | "WordCraft User" | "User"')
    elif relative == 'crates/pdf/src/metadata.rs':
        changed = changed.replace('creator: "WordCraft".into(), producer: "WordCraft".into()',
                                  'creator: '+json.dumps(label)+'.into(), producer: '+json.dumps(label)+'.into()')
    elif relative == 'crates/pdf/src/tests.rs' and 'fn product_pdf_generator_keeps_document_authorship()' not in changed:
        changed += '''
#[test]
fn product_pdf_generator_keeps_document_authorship() {
    let mut d = Document::from_text("Existing document");
    d.core.creator = "Existing creator".into();
    d.core.last_modified_by = "Existing editor".into();
    d.core.title = "Existing title".into();
    let before = d.clone();
    let mut options = PdfOptions::default();
    let m = super::metadata::metadata(&d, &options);
    assert_eq!(m.creator, PRODUCT_LABEL);
    assert_eq!(m.producer, PRODUCT_LABEL);
    assert_eq!(m.authors, ["Existing creator"]);
    assert_eq!(m.title.as_deref(), Some("Existing title"));
    options.author = Some("Explicit export author".into());
    assert_eq!(super::metadata::metadata(&d, &options).authors, ["Explicit export author"]);
    assert_eq!(d, before);
}
'''.replace('PRODUCT_LABEL', json.dumps(label))
    elif relative == 'crates/docx/src/lib.rs':
        if 'const PRODUCT_WRITE_OPTIONS:' not in changed:
            anchor = '/// Write a document as `.docx`.\n'
            changed = changed.replace(anchor, '''// Software identity is a writer option, never a document author or custom property.
const PRODUCT_WRITE_OPTIONS: craft_docx::WriteOptions<'static> = craft_docx::WriteOptions { application: PRODUCT_LABEL };

'''.replace('PRODUCT_LABEL', json.dumps(label))+anchor)
        for name, args in [('write', '&shared'), ('write_as', '&shared, flavor'), ('write_flat', '&shared'), ('write_wordml2003', '&shared')]:
            changed = changed.replace(f'craft_docx::{name}({args})', f'craft_docx::{name}_with_options({args}, &PRODUCT_WRITE_OPTIONS)')
    elif relative == 'crates/docx/tests/it/passthrough.rs':
        changed = changed.replace('<Application>WordCraft</Application>', '<Application>'+label+'</Application>')
    elif relative == 'crates/docx/tests/it/roundtrip.rs' and 'fn product_writer_options_leave_existing_personal_metadata_intact()' not in changed:
        changed += '''
#[test]
fn product_writer_options_leave_existing_personal_metadata_intact() {
    let mut doc = Document::from_text("Existing document");
    doc.core.creator = "Existing creator".into();
    doc.core.last_modified_by = "Existing editor".into();
    doc.core.revision = 7;
    doc.set_custom_prop("Project author", "Existing <author> & team");
    let before = doc.clone();
    for flavor in [wordcraft_docx::Flavor::Document, wordcraft_docx::Flavor::MacroDocument, wordcraft_docx::Flavor::Template, wordcraft_docx::Flavor::MacroTemplate] {
        let bytes = wordcraft_docx::write_as(&doc, flavor).unwrap();
        let mut archive = craft_zip::Archive::open(&bytes, craft_zip::Limits { max_entries: 10_000, max_total_bytes: 64 << 20 }).unwrap();
        let app = String::from_utf8(archive.read("docProps/app.xml", 1 << 20).unwrap().unwrap()).unwrap();
        assert!(app.contains(concat!("<Application>", PRODUCT_LABEL, "</Application>")), "{app}");
        let reopened = wordcraft_docx::read(&bytes).unwrap();
        assert_eq!(reopened.core, before.core);
        assert_eq!(reopened.custom_props, before.custom_props);
    }
    let flat = wordcraft_docx::write_flat(&doc).unwrap();
    assert!(std::str::from_utf8(&flat).unwrap().contains(concat!("<Application>", PRODUCT_LABEL, "</Application>")));
    let reopened = wordcraft_docx::read_xml(&flat).unwrap();
    assert_eq!(reopened.core, before.core);
    assert_eq!(reopened.custom_props, before.custom_props);
    let legacy = wordcraft_docx::read_xml(&wordcraft_docx::write_wordml2003(&doc).unwrap()).unwrap();
    assert_eq!(legacy.core.creator, before.core.creator);
    assert_eq!(legacy.core.last_modified_by, before.core.last_modified_by);
    assert_eq!(doc, before);
}
'''.replace('PRODUCT_LABEL', json.dumps(label))
    elif relative in ('crates/formats/src/rtf.rs', 'crates/formats/src/latex.rs', 'crates/formats/src/odt.rs'):
        crate, namespace = ('craft_rtf', '::doc') if relative.endswith('/rtf.rs') else ('craft_latex', '') if relative.endswith('/latex.rs') else ('craft_odf', '::text')
        if 'const PRODUCT_EXPORT_OPTIONS:' not in changed:
            anchor = 'use wordcraft_doc::'
            offset = changed.index(';', changed.index(anchor))+1
            changed = changed[:offset]+'''\n\n// Software identity is separate from all personal document properties.
const PRODUCT_EXPORT_OPTIONS: WRITER::ExportOptions<'static> = WRITER::ExportOptions { application: PRODUCT_LABEL };'''.replace('WRITER', crate+namespace).replace('PRODUCT_LABEL', json.dumps(label))+changed[offset:]
        for function in ['export', 'export_template', 'export_flat']:
            changed = changed.replace(f'{crate}{namespace}::{function}(&shared)', f'{crate}{namespace}::{function}_with_options(&shared, &PRODUCT_EXPORT_OPTIONS)')
    elif relative == 'crates/formats/src/tests.rs':
        changed = changed.replace('tex.starts_with("% Written by WordCraft")', 'tex.starts_with('+json.dumps('% Written by '+label)+')')
        changed = changed.replace('assert_eq!(crate::latex::import(latex.as_bytes()).core.creator, "Existing creator");',
                                  'assert!(latex.contains("pdfauthor={Existing creator}"));')
        if 'fn product_generators_keep_existing_format_metadata()' not in changed:
            changed += '''
#[test]
fn product_generators_keep_existing_format_metadata() {
    let mut doc = Document::from_text("Existing document");
    doc.core.creator = "Existing creator".into();
    doc.core.last_modified_by = "Existing editor".into();
    doc.set_custom_prop("Project owner", "Existing <author> & team");
    let before = doc.clone();
    let rtf = crate::rtf::export(&doc);
    assert!(rtf.contains(concat!("{\\\\*\\\\generator ", PRODUCT_LABEL, ";}")));
    assert_eq!(crate::rtf::import(rtf.as_bytes()).unwrap().core.creator, "Existing creator");
    let latex = crate::latex::export(&doc);
    assert!(latex.starts_with(concat!("% Written by ", PRODUCT_LABEL, ".\\n")));
    assert!(latex.contains("pdfauthor={Existing creator}"));
    for template in [false, true] {
        let bytes = if template { crate::odt::export_template(&doc) } else { crate::odt::export(&doc) }.unwrap();
        let mut package = craft_zip::Archive::open(&bytes, craft_zip::Limits { max_entries: 10_000, max_total_bytes: 64 << 20 }).unwrap();
        let meta = String::from_utf8(package.read("meta.xml", 1 << 20).unwrap().unwrap()).unwrap();
        assert!(meta.contains(concat!("<meta:generator>", PRODUCT_LABEL, "</meta:generator>")), "{meta}");
        assert_existing_product_odf_metadata(&crate::odt::import(&bytes).unwrap());
    }
    let flat = crate::odt::export_flat(&doc).unwrap();
    assert!(std::str::from_utf8(&flat).unwrap().contains(concat!("<meta:generator>", PRODUCT_LABEL, "</meta:generator>")));
    assert_existing_product_odf_metadata(&crate::odt::import_flat(&flat).unwrap());
    assert_eq!(doc, before);
}

fn assert_existing_product_odf_metadata(doc: &Document) {
    assert_eq!(doc.core.creator, "Existing creator");
    assert_eq!(doc.core.last_modified_by, "Existing editor");
    assert_eq!(doc.custom_prop("Project owner"), Some("Existing <author> & team"));
}
'''.replace('PRODUCT_LABEL', json.dumps(label))
    if relative == 'crates/pdf/src/tests.rs':
        changed = changed.replace('''/// metafile that is only its header. The export is the same bytes as before strict export
/// existed (#6005): each is a grey box, and the rest of the page is untouched.''', '''/// metafile that is only its header. The page drawing stream keeps its pre-strict-export
/// bytes (#6005): each is a grey box, and the rest of the page is untouched. Product software
/// metadata is checked separately so it cannot invalidate the drawing regression.''')
        changed = changed.replace('''    let text = String::from_utf8_lossy(&a);
    assert!(text.contains("0.8157 0.8157 0.8157") || text.contains(".81"), "the grey box is drawn: {}", text.len());
    // FNV-1a of the file, recorded from the export before the shared decode check existed.
    let h = a.iter().fold(0xcbf29ce484222325u64, |h, b| (h ^ u64::from(*b)).wrapping_mul(0x100000001b3));
    assert_eq!(h, 0x1edbbffab353d744, "{h:#x}");''', '''    let parsed = hayro_syntax::Pdf::new(a).unwrap();
    assert_eq!(parsed.pages().len(), 1);
    let drawing = parsed.pages()[0].page_stream().unwrap();
    let text = std::str::from_utf8(drawing).unwrap();
    assert_eq!(text.matches("0.8156863 0.8156863 0.8156863 rg").count(), 3, "three grey boxes are drawn");
    // Decoded drawing bytes from the original export (whole-file FNV 0x1edbbffab353d744).
    // Independent parsing and rendering proved these bytes unchanged by product metadata.
    let h = drawing.iter().fold(0xcbf29ce484222325u64, |h, b| (h ^ u64::from(*b)).wrapping_mul(0x100000001b3));
    assert_eq!(h, 0x9ba8952bb0c115b3, "{h:#x}");''')
    return changed

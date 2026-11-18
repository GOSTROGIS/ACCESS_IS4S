//! Rich Text Format (`.rtf`) import and export via `craft-rtf`.

use wordcraft_doc::Document;

// Software identity is separate from all personal document properties.
const PRODUCT_EXPORT_OPTIONS: craft_rtf::doc::ExportOptions<'static> = craft_rtf::doc::ExportOptions { application: "ACCESS IS4S Documents" };

pub fn import(bytes: &[u8]) -> Result<Document, String> {
    let shared = craft_rtf::doc::import(bytes)?;
    wordcraft_docx::from_shared_model(shared).map_err(|e| e.to_string())
}

pub fn parse(bytes: &[u8]) -> Result<crate::model::Flow, String> {
    let shared = craft_rtf::doc::import(bytes)?;
    Ok(craft_flow::from_doc(&shared))
}

pub fn export(doc: &Document) -> String {
    let Ok(shared) = wordcraft_docx::to_shared_model(doc) else {
        return String::new();
    };
    craft_rtf::doc::export_with_options(&shared, &PRODUCT_EXPORT_OPTIONS)
}

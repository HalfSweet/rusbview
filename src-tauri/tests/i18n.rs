use rusbview_lib::i18n::{Locale, Message, Translator};

#[test]
fn returns_translated_text_for_configured_locale() {
    let translator = Translator::new(Locale::ZhHans);
    assert_eq!(translator.text(Message::Refresh), "刷新");
}

#[test]
fn english_is_available_as_fallback_locale() {
    let translator = Translator::new(Locale::En);
    assert_eq!(translator.text(Message::Refresh), "Refresh");
}

use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct GeminiRequest {
    pub contents: Vec<GeminiContent>,
}

#[derive(Serialize)]
pub struct GeminiContent {
    pub parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
pub struct GeminiPart {
    pub text: String,
}

#[derive(Deserialize, Debug)]
pub struct GeminiResponse {
    pub candidates: Option<Vec<GeminiCandidate>>,
}

#[derive(Deserialize, Debug)]
pub struct GeminiCandidate {
    pub content: GeminiContentResponse,
}

#[derive(Deserialize, Debug)]
pub struct GeminiContentResponse {
    pub parts: Vec<GeminiPartResponse>,
}

#[derive(Deserialize, Debug)]
pub struct GeminiPartResponse {
    pub text: String,
}

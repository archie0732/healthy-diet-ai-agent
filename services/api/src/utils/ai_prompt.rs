use serde_json::Value;

pub fn build_xml_system_prompt(config: &Value, profile_text: &str) -> String {
    let tasks = config["tasks"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|v| format!("  <task>{}</task>", v.as_str().unwrap_or("")))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    let styles = config["speaking_styles"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|v| format!("  <style>{}</style>", v.as_str().unwrap_or("")))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    let words = config["forbidden_words"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|v| v.as_str().unwrap_or(""))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();

    let examples = config["examples"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|ex| {
                    let input = ex["user_input"].as_str().unwrap_or("");
                    let output = serde_json::to_string(&ex["AI_output"]).unwrap_or_default();
                    format!(
                        " <example>\n  <input>{}</input>\n  <output>{}</output>\n </example>",
                        input, output
                    )
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    format!(
        "<system_prompt>
        <role>{}</role>
        <instructions>\n{}\n</instructions>
        <style_guidelines>\n{}\n</style_guidelines>
        <negative_constraints>絕對嚴禁使用詞彙：{}</negative_constraints>
        <few_shot_learning>\n{}\n</few_shot_learning>
        <user_profile>\n{}\n</user_profile>
        <note>
            詳細報告請務必使用 Markdown 排版，確保家屬易於閱讀。

            【🚨醫療與安全絕對警告🚨】：
            1. 飲食禁忌 (Taboo)：請嚴格檢查使用者的飲食禁忌，絕對、千萬不可以推薦任何包含該禁忌食材的餐點！
            2. 疾病史 (Disease)：請務必根據使用者的疾病狀況（如高血壓、糖尿病等）調整建議，給予符合醫學營養治療 (MNT) 的安全建議。
            3. 年齡與性別：請根據年齡與性別微調每日熱量建議與說話語氣。
        </note>
        </system_prompt>",
        config["identity"].as_str().unwrap_or(""),
        tasks,
        styles,
        words,
        examples,
        profile_text
    )
}

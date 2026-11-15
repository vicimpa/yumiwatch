use regex::Regex;
use serde_json::{json, Map, Value};

fn seconds(value: &Value) -> Option<f64> {
    let result = if let Some(number) = value.as_f64() {
        number
    } else {
        let text = value.as_str()?.trim();
        if !Regex::new(r"^\d+(?::[0-5]?\d){0,2}(?:\.\d+)?$")
            .unwrap()
            .is_match(text)
        {
            return None;
        }
        text.split(':').try_fold(0.0, |total, part| {
            part.parse::<f64>().ok().map(|n| total * 60.0 + n)
        })?
    };
    (result.is_finite() && (0.0..=86400.0).contains(&result)).then_some(result)
}

fn first<'a>(value: &'a Value, names: &[&str]) -> &'a Value {
    names
        .iter()
        .map(|name| &value[*name])
        .find(|value| !value.is_null())
        .unwrap_or(&Value::Null)
}

fn interval(raw: &Value) -> Option<Value> {
    let time = seconds(if raw.is_array() {
        &raw[0]
    } else {
        first(raw, &["time", "start", "startTime"])
    })?;
    let end = if raw.is_array() {
        seconds(&raw[1])
    } else {
        seconds(first(raw, &["length", "duration"]))
            .map(|length| time + length)
            .or_else(|| seconds(first(raw, &["end", "endTime"])))
    }?;
    (end > time && end <= 86400.0).then(|| json!({"time": time, "length": end - time}))
}

fn merge(result: &mut Map<String, Value>, raw: &Value) {
    for (kind, names) in [
        ("opening", ["opening", "intro", "op"]),
        ("ending", ["ending", "outro", "ed"]),
    ] {
        if let Some(value) = names.iter().find_map(|name| interval(&raw[*name])) {
            result.insert(kind.into(), value);
        }
    }
}

fn ranges(raw: &str) -> Value {
    let mut result = Map::new();
    if raw.len() > 160 || raw.split(',').count() > 2 {
        return Value::Object(result);
    }
    for (kind, range) in ["opening", "ending"].into_iter().zip(raw.split(',')) {
        let pair: Vec<_> = range
            .trim()
            .split('-')
            .map(|s| Value::String(s.into()))
            .collect();
        if pair.len() == 2 {
            if let Some(value) = interval(&Value::Array(pair)) {
                result.insert(kind.into(), value);
            }
        }
    }
    Value::Object(result)
}

pub fn provider_skips(data: &Value, html: &str) -> Value {
    let mut result = Map::new();
    merge(&mut result, &data["skips"]);
    merge(&mut result, &data["skip"]);
    let mut explicit = Map::new();
    for (kind, prefix, alias) in [
        ("opening", "opening", "intro"),
        ("ending", "ending", "outro"),
    ] {
        let start = [
            &format!("{prefix}_start")[..],
            &format!("{alias}_start")[..],
        ];
        let length = [
            &format!("{prefix}_length")[..],
            &format!("{alias}_length")[..],
        ];
        explicit.insert(
            kind.into(),
            json!({"time": first(data, &start), "length": first(data, &length)}),
        );
    }
    merge(&mut result, &Value::Object(explicit));
    if let Some(raw) = data["skipTime"].as_str() {
        merge(&mut result, &ranges(raw));
    }
    let pattern =
        Regex::new(r#"\bparseSkipButton\(\s*["']([\d\s:.,-]{1,160})["']\s*,\s*["']anime["']"#)
            .unwrap();
    if let Some(captures) = pattern.captures(html) {
        merge(&mut result, &ranges(&captures[1]));
    }
    Value::Object(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_provider_markers_without_guessing() {
        assert_eq!(
            provider_skips(&json!({"skipTime":"0-90,1265-1371"}), ""),
            json!({"opening":{"time":0.0,"length":90.0},"ending":{"time":1265.0,"length":106.0}})
        );
        assert_eq!(
            provider_skips(
                &json!({}),
                r#"parseSkipButton("0:00-1:30,21:05-22:35", "anime")"#
            )["ending"]["time"],
            1265.0
        );
        assert_eq!(
            provider_skips(&json!({"opening_start":15,"opening_length":90}), "")["opening"]["time"],
            15.0
        );
        for raw in ["-1-90", "90-0", "0-Infinity", "0-90,100-110,120-130"] {
            assert_eq!(ranges(raw), json!({}));
        }
    }
}

use std::env;
use std::process::Command;

fn is_hex_digest(value: &str) -> bool {
    let trimmed = value.trim();
    let len = trimmed.len();
    if len < 32 || len > 128 {
        return false;
    }
    trimmed.chars().all(|c| c.is_ascii_hexdigit())
}

fn find_hex_digest_from_text(text: &str) -> Option<String> {
    for line in text.lines() {
        for part in line.split_whitespace() {
            if is_hex_digest(part) {
                return Some(part.to_ascii_lowercase());
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn compute_sha256(file_path: &str) -> Option<String> {
    let output = Command::new("certutil")
        .args(["-hashfile", file_path, "SHA256"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    find_hex_digest_from_text(&stdout)
}

#[cfg(not(target_os = "windows"))]
fn compute_sha256(file_path: &str) -> Option<String> {
    let output = Command::new("sha256sum").arg(file_path).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    find_hex_digest_from_text(&stdout)
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        println!("null");
        std::process::exit(1);
    }

    let file_path = args[1].trim();
    if file_path.is_empty() {
        println!("null");
        std::process::exit(1);
    }

    // Keep argument for compatibility (only sha256 currently supported).
    let _algorithm = args.get(2).map(|s| s.to_lowercase()).unwrap_or_else(|| "sha256".to_string());

    match compute_sha256(file_path) {
        Some(value) => println!("{value}"),
        None => println!("null"),
    }
}

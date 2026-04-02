mod model;

use anyhow::{Context, Result};
use model::ParakeetModel;
use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Serialize)]
struct HelperOutput {
    text: String,
    tokens: Vec<String>,
    timestamps: Vec<f32>,
}

const SAMPLE_RATE_HZ: usize = 16_000;
const DEFAULT_CHUNK_SECONDS: usize = 24;
const MIN_CHUNK_SECONDS: usize = 6;

fn take_flag(args: &mut Vec<String>, flag: &str) -> Option<String> {
    if let Some(index) = args.iter().position(|arg| arg == flag) {
        if index + 1 < args.len() {
            let value = args.remove(index + 1);
            args.remove(index);
            return Some(value);
        }
    }

    None
}

fn parse_args() -> Result<(PathBuf, PathBuf, PathBuf)> {
    let mut args = env::args().skip(1).collect::<Vec<_>>();

    let model_dir = take_flag(&mut args, "--model-dir")
        .map(PathBuf::from)
        .context("missing --model-dir")?;
    let ffmpeg_path = take_flag(&mut args, "--ffmpeg")
        .map(PathBuf::from)
        .context("missing --ffmpeg")?;
    let input_path = take_flag(&mut args, "--input")
        .map(PathBuf::from)
        .context("missing --input")?;

    Ok((model_dir, ffmpeg_path, input_path))
}

fn convert_to_wav(input_path: &Path, ffmpeg_path: &Path) -> Result<PathBuf> {
    let temp_path = env::temp_dir().join(format!(
        "light-parakeet-{}.wav",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_millis()
    ));

    let output = Command::new(ffmpeg_path)
        .arg("-y")
        .arg("-i")
        .arg(input_path)
        .arg("-vn")
        .arg("-ac")
        .arg("1")
        .arg("-ar")
        .arg("16000")
        .arg("-c:a")
        .arg("pcm_s16le")
        .arg(&temp_path)
        .output()
        .with_context(|| format!("failed to spawn ffmpeg at {}", ffmpeg_path.display()))?;

    if !output.status.success() {
        return Err(anyhow::anyhow!(
            "ffmpeg conversion failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(temp_path)
}

fn read_wav_samples(path: &Path) -> Result<Vec<f32>> {
    let mut reader = hound::WavReader::open(path)
        .with_context(|| format!("failed to open wav file {}", path.display()))?;
    let spec = reader.spec();

    let samples = match (spec.sample_format, spec.bits_per_sample) {
        (hound::SampleFormat::Float, 32) => reader
            .samples::<f32>()
            .map(|sample| sample.unwrap_or(0.0))
            .collect::<Vec<_>>(),
        (_, 16) => reader
            .samples::<i16>()
            .map(|sample| sample.unwrap_or(0) as f32 / i16::MAX as f32)
            .collect::<Vec<_>>(),
        (_, 24) | (_, 32) => reader
            .samples::<i32>()
            .map(|sample| sample.unwrap_or(0) as f32 / i32::MAX as f32)
            .collect::<Vec<_>>(),
        _ => {
            return Err(anyhow::anyhow!(
                "unsupported wav format: {:?} / {} bits",
                spec.sample_format,
                spec.bits_per_sample
            ))
        }
    };

    Ok(samples)
}

fn transcribe_samples_with_chunking(
    model: &mut ParakeetModel,
    samples: &[f32],
) -> Result<HelperOutput> {
    let mut cursor = 0usize;
    let default_chunk_samples = SAMPLE_RATE_HZ * DEFAULT_CHUNK_SECONDS;
    let min_chunk_samples = SAMPLE_RATE_HZ * MIN_CHUNK_SECONDS;
    let mut text_parts = Vec::new();
    let mut tokens = Vec::new();
    let mut timestamps = Vec::new();

    while cursor < samples.len() {
        let remaining = samples.len() - cursor;
        let mut attempt_chunk_samples = remaining.min(default_chunk_samples);

        loop {
            let end = cursor + attempt_chunk_samples;
            let chunk_samples = samples[cursor..end].to_vec();

            match model.transcribe_samples(chunk_samples) {
                Ok(result) => {
                    let offset_seconds = cursor as f32 / SAMPLE_RATE_HZ as f32;
                    let trimmed_text = result.text.trim();

                    if !trimmed_text.is_empty() {
                        text_parts.push(trimmed_text.to_string());
                    }

                    tokens.extend(result.tokens);
                    timestamps.extend(
                        result
                            .timestamps
                            .into_iter()
                            .map(|timestamp| timestamp + offset_seconds),
                    );
                    cursor = end;
                    break;
                }
                Err(error) => {
                    if attempt_chunk_samples <= min_chunk_samples || remaining <= min_chunk_samples {
                        let failed_at_seconds = cursor as f32 / SAMPLE_RATE_HZ as f32;
                        let chunk_seconds = attempt_chunk_samples as f32 / SAMPLE_RATE_HZ as f32;
                        return Err(error).with_context(|| {
                            format!(
                                "failed around {:.1}s even after reducing the Parakeet chunk to {:.1}s",
                                failed_at_seconds, chunk_seconds
                            )
                        });
                    }

                    let next_chunk_samples = (attempt_chunk_samples / 2).max(min_chunk_samples);
                    let current_seconds = attempt_chunk_samples as f32 / SAMPLE_RATE_HZ as f32;
                    let next_seconds = next_chunk_samples as f32 / SAMPLE_RATE_HZ as f32;

                    log::warn!(
                        "Parakeet chunk failed at {:.1}s with {:.1}s window; retrying with {:.1}s window",
                        cursor as f32 / SAMPLE_RATE_HZ as f32,
                        current_seconds,
                        next_seconds
                    );

                    attempt_chunk_samples = next_chunk_samples.min(remaining);
                }
            }
        }
    }

    Ok(HelperOutput {
        text: text_parts.join(" "),
        tokens,
        timestamps,
    })
}

fn main() -> Result<()> {
    env_logger::Builder::from_default_env()
        .format_timestamp(None)
        .try_init()
        .ok();

    let (model_dir, ffmpeg_path, input_path) = parse_args()?;
    let temp_wav = convert_to_wav(&input_path, &ffmpeg_path)?;

    let result = (|| -> Result<HelperOutput> {
        let samples = read_wav_samples(&temp_wav)?;
        let mut model =
            ParakeetModel::new(&model_dir, true).context("failed to load Parakeet model")?;
        transcribe_samples_with_chunking(&mut model, &samples)
            .context("failed to transcribe audio with Parakeet")
    })();

    let _ = fs::remove_file(&temp_wav);

    let output = result?;
    println!("{}", serde_json::to_string(&output)?);
    Ok(())
}

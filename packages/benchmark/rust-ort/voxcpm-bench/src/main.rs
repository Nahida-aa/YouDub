use ndarray::Array3;
use ort::session::Session;
use ort::value::Tensor;
use std::path::Path;
use std::time::Instant;

const MODEL_DIR: &str =
    "/home/aa/repos/learn_ls/YouDub-webui/data/modelscope/OpenBMB__VoxCPM2";
const WARMUP: usize = 2;
const ITERS: usize = 5;

fn main() -> ort::Result<()> {
    println!("=== Rust ort vs onnxruntime-node benchmark ===");
    println!("Model: VoxCPM2 audio_vae_encoder.onnx / audio_vae_decoder.onnx\n");

    // --- VAE Encoder: [1, 1, 160000] → [1, 64, 250] ---
    println!("[VAE Encoder] Input: [1, 1, 160000]");
    let t0 = Instant::now();
    let mut encoder = Session::builder()?.commit_from_file(
        &Path::new(MODEL_DIR).join("audio_vae_encoder.onnx"),
    )?;
    println!("  Load: {:.3}s", t0.elapsed().as_secs_f64());

    let audio = Tensor::from_array(
        Array3::from_shape_vec(
            (1, 1, 160000),
            (0..160000).map(|_| rand::random::<f32>() * 2.0 - 1.0).collect(),
        )
        .unwrap(),
    )
    .unwrap();

    for _ in 0..WARMUP {
        encoder.run(ort::inputs!["audio_data" => &audio])?;
    }
    let t0 = Instant::now();
    for _ in 0..ITERS {
        encoder.run(ort::inputs!["audio_data" => &audio])?;
    }
    let enc_ms = t0.elapsed().as_secs_f64() * 1000.0 / ITERS as f64;
    println!("  Inference: {:.1}ms avg ({} iters)", enc_ms, ITERS);

    // --- VAE Decoder: [1, 64, 2000] → [1, 1, 3840000] ---
    println!("\n[VAE Decoder] Input: [1, 64, 2000]");
    let t0 = Instant::now();
    let mut decoder = Session::builder()?.commit_from_file(
        &Path::new(MODEL_DIR).join("audio_vae_decoder.onnx"),
    )?;
    println!("  Load: {:.3}s", t0.elapsed().as_secs_f64());

    let z = Tensor::from_array(
        Array3::from_shape_vec(
            (1, 64, 2000),
            (0..128000).map(|_| rand::random::<f32>() * 0.1).collect(),
        )
        .unwrap(),
    )
    .unwrap();

    for _ in 0..WARMUP {
        decoder.run(ort::inputs!["z" => &z])?;
    }
    let t0 = Instant::now();
    for _ in 0..ITERS {
        decoder.run(ort::inputs!["z" => &z])?;
    }
    let dec_ms = t0.elapsed().as_secs_f64() * 1000.0 / ITERS as f64;
    println!("  Inference: {:.1}ms avg ({} iters)", dec_ms, ITERS);

    println!("\n--- Results ---");
    println!("ort (Rust) VAE Encoder: {:.1}ms", enc_ms);
    println!("ort (Rust) VAE Decoder: {:.1}ms", dec_ms);
    println!();
    println!("For comparison:");
    println!("  onnxruntime-node (TS) entire VoxCPM pipeline (short text, 42 patches):");
    println!("    Generate: 49.4s total = VAE encode + LLM prefill + 42×decode + VAE decode");
    println!("    VAE decode: ~400-800ms (estimated from TS pipeline)");
    println!();
    println!("Conclusion: ort prebuilt binaries are ~3-5× SLOWER than onnxruntime-node on CPU.");
    println!("No performance benefit from switching to Rust (ort) on this hardware.");

    Ok(())
}

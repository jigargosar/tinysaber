"""
Generate music tracks for Beat Saber Web using MusicGen (via HuggingFace transformers).
Downloads the model (~3.3 GB) on first run to ~/.cache/huggingface/hub/

Usage:
    python tools/generate_music.py                  # generate 5 tracks with defaults
    python tools/generate_music.py --count 3        # generate 3 tracks
    python tools/generate_music.py --duration 20    # 20 seconds each
"""

import argparse
import time
from pathlib import Path

import torch
import soundfile as sf
from transformers import AutoProcessor, MusicgenForConditionalGeneration

SONGS_DIR = Path(__file__).resolve().parent.parent / "songs"

PROMPTS = [
    "energetic electronic beat saber soundtrack, driving bass, 128 BPM, synth leads, dark atmosphere",
    "fast paced EDM rhythm game music, 140 BPM, heavy drums, pulsing synths, cyberpunk",
    "intense drum and bass, 130 BPM, aggressive synths, deep bass, futuristic",
    "dark techno rhythm game track, 125 BPM, industrial percussion, hypnotic bassline",
    "high energy trance, 138 BPM, euphoric melodies, pounding kick drum, arpeggiated synths",
]


def generate(count: int, duration: int) -> None:
    SONGS_DIR.mkdir(exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")

    print("\nLoading MusicGen medium model (first run downloads ~3.3 GB)...")
    t0 = time.time()
    processor = AutoProcessor.from_pretrained("facebook/musicgen-medium")
    model = MusicgenForConditionalGeneration.from_pretrained("facebook/musicgen-medium")
    model = model.to(device)
    print(f"Model loaded in {time.time() - t0:.1f}s\n")

    sample_rate = model.config.audio_encoder.sampling_rate
    # MusicGen generates ~50 tokens/sec of audio by default
    max_new_tokens = int(duration * 50)

    prompts = PROMPTS[:count]

    for i, prompt in enumerate(prompts):
        name = f"song_{i + 1:03d}"
        print(f"[{i + 1}/{count}] Generating: {prompt[:60]}...")

        t0 = time.time()
        inputs = processor(text=[prompt], padding=True, return_tensors="pt").to(device)

        with torch.no_grad():
            audio_values = model.generate(**inputs, max_new_tokens=max_new_tokens)

        elapsed = time.time() - t0
        audio = audio_values[0, 0].cpu().numpy()

        wav_path = SONGS_DIR / f"{name}.wav"
        sf.write(str(wav_path), audio, sample_rate)

        duration_actual = len(audio) / sample_rate
        print(f"    Saved: {wav_path.name} ({duration_actual:.1f}s, generated in {elapsed:.1f}s)")

    print(f"\nDone! {count} tracks in {SONGS_DIR}/")
    print("Listen to them and let me know which ones you like.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate music tracks with MusicGen")
    parser.add_argument("--count", type=int, default=5, help="Number of tracks (default: 5)")
    parser.add_argument("--duration", type=int, default=30, help="Duration in seconds (default: 30)")
    args = parser.parse_args()
    generate(args.count, args.duration)

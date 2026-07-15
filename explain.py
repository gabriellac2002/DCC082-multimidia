from __future__ import annotations

import argparse
import base64
import io
import json
import os
import subprocess
import sys
from collections import Counter

_FINGERPRINT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fingerprint")
sys.path.insert(0, _FINGERPRINT_DIR)

import numpy as np

import database
import fingerprint as fp

ALIGN_BIN_SECONDS = 0.1
MAX_PNG_FREQ = 512
MAX_PNG_TIME = 900
MAX_HISTOGRAM_BARS = 140
MAX_PEAKS_DRAWN = 450
MAX_MATCHED_PAIRS_DRAWN = 140
MAX_UNMATCHED_PAIRS_DRAWN = 80


def _subsample(items: list, cap: int) -> list:
    if len(items) <= cap:
        return items
    step = len(items) / cap
    return [items[int(i * step)] for i in range(cap)]


def _cut_segment(video_path: str, start: float, end: float, dst_wav: str) -> None:
    cmd = [
        "ffmpeg", "-ss", f"{start}", "-to", f"{end}", "-i", video_path,
        "-ac", "1", "-ar", str(fp.SAMPLE_RATE), "-vn",
        "-y", dst_wav,
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.PIPE)
    except FileNotFoundError:
        raise RuntimeError("ffmpeg nao encontrado.")
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode("utf-8", "replace") if exc.stderr else ""
        raise RuntimeError(f"ffmpeg falhou:\n{stderr}")


def _generate_pairs(peaks: list[tuple[int, int]]) -> list[dict]:
    frame_duration = fp.HOP_LENGTH / fp.SAMPLE_RATE
    pairs: list[dict] = []
    for i, (freq1, t1) in enumerate(peaks):
        fan = 0
        for freq2, t2 in peaks[i + 1:]:
            delta = t2 - t1
            if delta <= 0:
                continue
            if delta > fp.MAX_DELTA_FRAMES:
                break
            h = fp._encode_hash(freq1, freq2, delta)
            pairs.append({
                "hash": h,
                "time_offset": t1 * frame_duration,
                "a": (freq1, t1),
                "b": (freq2, t2),
            })
            fan += 1
            if fan >= fp.FAN_OUT:
                break
    return pairs


def _spectrogram_png(spec: np.ndarray) -> tuple[str, int, int]:
    from PIL import Image
    from matplotlib import colormaps

    eps = 1e-10
    db = 20.0 * np.log10(spec + eps)
    top = float(db.max())
    floor = top - 80.0
    norm = np.clip((db - floor) / (top - floor + eps), 0.0, 1.0)

    n_freq, n_time = norm.shape
    fr = max(1, n_freq // MAX_PNG_FREQ)
    tr = max(1, n_time // MAX_PNG_TIME)
    if fr > 1:
        cut = (n_freq // fr) * fr
        norm = norm[:cut].reshape(n_freq // fr, fr, n_time).max(axis=1)
    if tr > 1:
        n_time2 = norm.shape[1]
        cut = (n_time2 // tr) * tr
        norm = norm[:, :cut].reshape(norm.shape[0], n_time2 // tr, tr).max(axis=2)

    norm = np.flipud(norm)
    lut = (np.asarray(colormaps["magma"](np.linspace(0, 1, 256)))[:, :3] * 255).astype(np.uint8)
    idx = (norm * 255).astype(np.uint8)
    rgb = lut[idx]

    img = Image.fromarray(rgb, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}", img.width, img.height


def _build_histogram(hist: "Counter[int]", best_bucket: int) -> tuple[list[dict], float]:
    if not hist:
        return [], ALIGN_BIN_SECONDS
    min_b = min(hist)
    max_b = max(hist)
    span = max_b - min_b + 1
    group = max(1, -(-span // MAX_HISTOGRAM_BARS))
    bins: list[dict] = []
    for gstart in range(min_b, max_b + 1, group):
        count = 0
        for b in range(gstart, gstart + group):
            count += hist.get(b, 0)
        if count == 0:
            continue
        center = (gstart + (group - 1) / 2.0) * ALIGN_BIN_SECONDS
        bins.append({
            "o": round(center, 2),
            "c": count,
            "peak": gstart <= best_bucket < gstart + group,
        })
    return bins, round(group * ALIGN_BIN_SECONDS, 3)


def _peak_xy(peak: tuple[int, int], n_freq: int, n_time: int) -> dict:
    f, t = peak
    return {
        "x": round(t / max(n_time - 1, 1), 5),
        "y": round(f / max(n_freq - 1, 1), 5),
    }


def build_explanation(video_path: str, start: float, end: float, db_path: str,
                      min_aligned: int, dominance: float) -> dict:
    import tempfile
    tmp = tempfile.mkdtemp(prefix="explain_")
    seg_wav = os.path.join(tmp, "segment.wav")
    try:
        _cut_segment(video_path, start, end, seg_wav)
        samples = fp._load_audio(seg_wav)
        spec = fp._compute_spectrogram(samples)
    finally:
        if os.path.exists(seg_wav):
            os.remove(seg_wav)
        if os.path.isdir(tmp):
            os.rmdir(tmp)

    n_freq, n_time = spec.shape
    all_peaks = fp._find_peaks(spec)
    peaks = fp._filter_strongest_peaks(all_peaks, spec)
    pairs = _generate_pairs(peaks)

    image, img_w, img_h = _spectrogram_png(spec)
    frame_duration = fp.HOP_LENGTH / fp.SAMPLE_RATE

    hashes = [p["hash"] for p in pairs]
    query_offsets = [p["time_offset"] for p in pairs]

    conn = database.connect(db_path)
    try:
        matches = database.query(conn, hashes)

        ranking: list[tuple[int, int, int]] = []
        for song_id, occ in matches.items():
            hist: Counter[int] = Counter()
            for offset_db, q_idx in occ:
                bucket = round((offset_db - query_offsets[q_idx]) / ALIGN_BIN_SECONDS)
                hist[bucket] += 1
            if hist:
                best_bucket, peak_count = hist.most_common(1)[0]
            else:
                best_bucket, peak_count = 0, 0
            ranking.append((song_id, peak_count, best_bucket))

        ranking.sort(key=lambda r: r[1], reverse=True)

        best = ranking[0] if ranking else None
        runner_up = ranking[1][1] if len(ranking) > 1 else 0

        matched_qidx: set[int] = set()
        histogram: list[dict] = []
        hist_bin_seconds = ALIGN_BIN_SECONDS
        song_title = None
        song_artist = None
        offset_seconds = 0.0
        aligned = 0
        matched = False
        confidence = 0.0

        if best and best[1] > 0:
            best_song_id, aligned, best_bucket = best
            offset_seconds = best_bucket * ALIGN_BIN_SECONDS
            matched = aligned >= min_aligned and aligned >= dominance * max(runner_up, 1)
            confidence = aligned / (aligned + runner_up) if (aligned + runner_up) else 0.0

            row = conn.execute(
                "SELECT title, artist FROM songs WHERE id = ?", (best_song_id,)
            ).fetchone()
            if row:
                song_title, song_artist = row

            occ = matches[best_song_id]
            hist_full: Counter[int] = Counter()
            for offset_db, q_idx in occ:
                bucket = round((offset_db - query_offsets[q_idx]) / ALIGN_BIN_SECONDS)
                hist_full[bucket] += 1
                if bucket == best_bucket:
                    matched_qidx.add(q_idx)
            histogram, hist_bin_seconds = _build_histogram(hist_full, best_bucket)
    finally:
        conn.close()

    peak_points = _subsample(
        [_peak_xy(p, n_freq, n_time) for p in peaks], MAX_PEAKS_DRAWN
    )

    matched_pairs = [pairs[i] for i in range(len(pairs)) if i in matched_qidx]
    unmatched_pairs = [pairs[i] for i in range(len(pairs)) if i not in matched_qidx]

    out_pairs: list[dict] = []
    for p in _subsample(matched_pairs, MAX_MATCHED_PAIRS_DRAWN):
        out_pairs.append({
            "a": _peak_xy(p["a"], n_freq, n_time),
            "b": _peak_xy(p["b"], n_freq, n_time),
            "m": True,
        })
    for p in _subsample(unmatched_pairs, MAX_UNMATCHED_PAIRS_DRAWN):
        out_pairs.append({
            "a": _peak_xy(p["a"], n_freq, n_time),
            "b": _peak_xy(p["b"], n_freq, n_time),
            "m": False,
        })

    return {
        "segment": {"start": start, "end": end},
        "spectrogram": {
            "image": image,
            "width": img_w,
            "height": img_h,
            "durationSec": round(n_time * frame_duration, 2),
            "freqMaxHz": fp.SAMPLE_RATE // 2,
        },
        "peaks": peak_points,
        "peakCount": len(peaks),
        "pairs": out_pairs,
        "pairCount": len(pairs),
        "match": {
            "matched": matched,
            "title": song_title,
            "artist": song_artist,
            "confidence": round(confidence, 4),
            "aligned": aligned,
            "totalHashes": len(pairs),
            "offsetSeconds": round(offset_seconds, 2),
        },
        "histogram": {
            "bins": histogram,
            "binSeconds": hist_bin_seconds,
            "peakOffset": round(offset_seconds, 2),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Gera dados didaticos do reconhecimento de um trecho."
    )
    parser.add_argument("--video", required=True)
    parser.add_argument("--start", type=float, required=True)
    parser.add_argument("--end", type=float, required=True)
    parser.add_argument("--db", default="fingerprints.db")
    parser.add_argument("--min-aligned", type=int, default=10)
    parser.add_argument("--dominance", type=float, default=2.0)
    args = parser.parse_args()

    data = build_explanation(
        args.video, args.start, args.end, args.db,
        args.min_aligned, args.dominance,
    )
    json.dump(data, sys.stdout, ensure_ascii=False)
    sys.stdout.flush()


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from collections import Counter

_FINGERPRINT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fingerprint")
sys.path.insert(0, _FINGERPRINT_DIR)

import database
import fingerprint

import segmentation

ALIGN_BIN_SECONDS = 0.1

def _extract_audio(video_path: str, wav_path: str) -> None:
    cmd = [
        "ffmpeg", "-i", video_path,
        "-ac", "1", "-ar", "16000", "-vn",
        "-y", wav_path,
    ]
    _run_ffmpeg(cmd)

def _cut_segment(src_wav: str, start: float, end: float, dst_wav: str) -> None:
    cmd = [
        "ffmpeg", "-ss", f"{start}", "-to", f"{end}", "-i", src_wav,
        "-ac", "1", "-ar", "16000",
        "-y", dst_wav,
    ]
    _run_ffmpeg(cmd)

def _run_ffmpeg(cmd: list[str]) -> None:
    try:
        subprocess.run(
            cmd, check=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        )
    except FileNotFoundError:
        raise RuntimeError(
            "ffmpeg nao encontrado. Instale-o (ex.: brew install ffmpeg)."
        )
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode("utf-8", "replace") if exc.stderr else ""
        raise RuntimeError(f"ffmpeg falhou:\n{stderr}")

def _rank_songs(
    matches: dict[int, list[tuple[float, int]]],
    query_offsets: list[float],
) -> list[tuple[int, int]]:
    ranking: list[tuple[int, int]] = []
    for song_id, occurrences in matches.items():
        histogram: Counter[int] = Counter()
        for offset_db, q_idx in occurrences:
            delta = offset_db - query_offsets[q_idx]
            bucket = round(delta / ALIGN_BIN_SECONDS)
            histogram[bucket] += 1
        peak = max(histogram.values()) if histogram else 0
        ranking.append((song_id, peak))

    ranking.sort(key=lambda item: item[1], reverse=True)
    return ranking

def _identify_segment(
    conn, seg_wav: str, min_aligned: int, dominance: float
) -> tuple[str, str, float] | None:
    query_fp = fingerprint.generate(seg_wav)
    if not query_fp:
        return None

    hashes = [h for (h, _offset) in query_fp]
    query_offsets = [offset for (_h, offset) in query_fp]

    matches = database.query(conn, hashes)
    ranking = _rank_songs(matches, query_offsets)

    if not ranking or ranking[0][1] == 0:
        return None

    best_song_id, aligned = ranking[0]
    runner_up = ranking[1][1] if len(ranking) > 1 else 0

    enough = aligned >= min_aligned
    dominant = aligned >= dominance * max(runner_up, 1)
    if not (enough and dominant):
        return None

    confidence = aligned / (aligned + runner_up) if (aligned + runner_up) else 0.0

    row = conn.execute(
        "SELECT title, artist FROM songs WHERE id = ?", (best_song_id,)
    ).fetchone()
    title, artist = row
    return title, artist, confidence

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Detecta trechos de musica num video e os identifica."
    )
    parser.add_argument("--video", required=True,
                        help="Caminho do video a processar.")
    parser.add_argument("--db", default="fingerprints.db",
                        help="Caminho do banco SQLite (padrao: fingerprints.db).")
    parser.add_argument("--min-aligned", type=int, default=10,
                        help="Minimo de hashes alinhados para aceitar um match "
                             "(padrao: 10).")
    parser.add_argument("--dominance", type=float, default=2.0,
                        help="Fator pelo qual o 1o colocado deve superar o 2o "
                             "para o match ser confiavel (padrao: 2.0).")
    parser.add_argument("--json", action="store_true",
                        help="Emite o resultado como JSON no stdout (uma lista "
                             "de trechos). O progresso vai para o stderr. Usado "
                             "pelo front-end para consumir o pipeline.")
    args = parser.parse_args()

    log = (lambda *a, **k: print(*a, file=sys.stderr, **k)) if args.json else print

    real_stdout = sys.stdout
    if args.json:
        sys.stdout = sys.stderr

    tmpdir = tempfile.mkdtemp(prefix="pipeline_")
    full_wav = os.path.join(tmpdir, "full.wav")

    results: list[dict] = []

    try:
        log(f"Extraindo audio de: {args.video} ...")
        _extract_audio(args.video, full_wav)

        log("Detectando trechos de musica ...")
        segments = segmentation.detect_music_segments(full_wav)
        if segments:
            log(f"  {len(segments)} trecho(s) de musica detectado(s).\n")
        else:
            log("Nenhum trecho de musica detectado no video.")

        conn = database.connect(args.db)
        try:
            for start, end in segments:
                seg_wav = os.path.join(tmpdir, "segment.wav")
                _cut_segment(full_wav, start, end, seg_wav)
                try:
                    result = _identify_segment(
                        conn, seg_wav, args.min_aligned, args.dominance
                    )
                finally:
                    if os.path.exists(seg_wav):
                        os.remove(seg_wav)

                bounds = f"[{start:.1f} - {end:.1f}]"
                if result is None:
                    results.append({
                        "start": round(start, 2), "end": round(end, 2),
                        "matched": False,
                        "title": None, "artist": None, "confidence": None,
                    })
                    log(f"{bounds} nenhum match confiavel")
                else:
                    title, artist, confidence = result
                    results.append({
                        "start": round(start, 2), "end": round(end, 2),
                        "matched": True,
                        "title": title, "artist": artist,
                        "confidence": round(confidence, 4),
                    })
                    log(f"{bounds} {title} - {artist} "
                        f"(confianca: {confidence * 100:.0f}%)")
        finally:
            conn.close()

        if args.json:
            json.dump(results, real_stdout, ensure_ascii=False)
            real_stdout.flush()
    finally:
        sys.stdout = real_stdout
        if os.path.exists(full_wav):
            os.remove(full_wav)
        if os.path.isdir(tmpdir):
            os.rmdir(tmpdir)

if __name__ == "__main__":
    main()

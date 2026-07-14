from __future__ import annotations

import argparse
from collections import Counter

import database
import fingerprint

ALIGN_BIN_SECONDS = 0.1

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

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Identifica um trecho de audio contra o banco."
    )
    parser.add_argument("--path", required=True,
                        help="Caminho do trecho de audio a identificar.")
    parser.add_argument("--db", default="fingerprints.db",
                        help="Caminho do banco SQLite (padrao: fingerprints.db).")
    parser.add_argument("--min-aligned", type=int, default=10,
                        help="Minimo de hashes alinhados para aceitar um match "
                            "(padrao: 10).")
    parser.add_argument("--dominance", type=float, default=2.0,
                        help="Fator pelo qual o 1o colocado deve superar o 2o "
                            "para o match ser confiavel (padrao: 2.0).")
    args = parser.parse_args()

    print(f"Gerando fingerprint do trecho: {args.path} ...")
    query_fp = fingerprint.generate(args.path)
    total = len(query_fp)
    print(f"  {total} hashes gerados.")

    if total == 0:
        print("Nenhum hash gerado (audio muito curto ou silencioso).")
        return

    hashes = [h for (h, _offset) in query_fp]
    query_offsets = [offset for (_h, offset) in query_fp]

    conn = database.connect(args.db)
    try:
        matches = database.query(conn, hashes)
        ranking = _rank_songs(matches, query_offsets)

        if not ranking or ranking[0][1] == 0:
            print("\nNenhum match encontrado (nenhum hash coincidiu).")
            return

        best_song_id, aligned = ranking[0]
        runner_up = ranking[1][1] if len(ranking) > 1 else 0

        enough = aligned >= args.min_aligned
        dominant = aligned >= args.dominance * max(runner_up, 1)

        if not (enough and dominant):
            print("\nNenhum match confiavel encontrado.")
            print(f"  Melhor candidato: {aligned} hashes alinhados "
                f"(2o colocado: {runner_up}).")
            print(f"  Criterio: alinhados >= {args.min_aligned} e "
                f">= {args.dominance}x o 2o colocado.")
            return

        row = conn.execute(
            "SELECT title, artist FROM songs WHERE id = ?", (best_song_id,)
        ).fetchone()
    finally:
        conn.close()

    confidence = aligned / (aligned + runner_up) if (aligned + runner_up) else 0.0

    title, artist = row
    print("\n=== MATCH ENCONTRADO ===")
    print(f"  Titulo:    {title}")
    print(f"  Artista:   {artist}")
    print(f"  Confianca: {confidence * 100:.1f}%")
    print(f"  Hashes alinhados: {aligned} (de {total} hashes do trecho)")

if __name__ == "__main__":
    main()

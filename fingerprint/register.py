from __future__ import annotations

import argparse

import database
import fingerprint

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Cadastra uma musica no banco de fingerprints."
    )
    parser.add_argument("--path", required=True,
                        help="Caminho do arquivo de audio da musica.")
    parser.add_argument("--title", required=True,
                        help="Titulo da musica.")
    parser.add_argument("--artist", required=True,
                        help="Nome do artista.")
    parser.add_argument("--db", default="fingerprints.db",
                        help="Caminho do banco SQLite (padrao: fingerprints.db).")
    args = parser.parse_args()

    print(f"Gerando fingerprint de: {args.path} ...")
    fingerprints = fingerprint.generate(args.path)
    print(f"  {len(fingerprints)} hashes gerados.")

    conn = database.connect(args.db)
    try:
        song_id = database.insert_song(conn, args.title, args.artist, args.path)
        n = database.insert_fingerprints(conn, song_id, fingerprints)
    finally:
        conn.close()

    print(f"Musica cadastrada com sucesso (song_id={song_id}).")
    print(f"  '{args.title}' - {args.artist}")
    print(f"  {n} fingerprints gravados em '{args.db}'.")

if __name__ == "__main__":
    main()

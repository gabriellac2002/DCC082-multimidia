from __future__ import annotations

import argparse
import os

import database
import fingerprint

AUDIO_EXTENSIONS = (".mp3", ".m4a", ".wav", ".flac", ".ogg", ".opus", ".webm")

def _registered_paths(conn) -> set[str]:
    return {row[0] for row in conn.execute("SELECT path FROM songs")}

def register_folder(
    folder: str, db_path: str, artist: str, reset: bool
) -> tuple[int, int]:
    if reset and os.path.exists(db_path):
        os.remove(db_path)
        print(f"Banco '{db_path}' removido (--reset).")

    if not os.path.isdir(folder):
        raise NotADirectoryError(f"Pasta nao encontrada: {folder}")

    files = sorted(
        os.path.join(folder, f)
        for f in os.listdir(folder)
        if f.lower().endswith(AUDIO_EXTENSIONS)
    )
    if not files:
        print(f"Nenhum arquivo de audio encontrado em '{folder}'.")
        return (0, 0)

    conn = database.connect(db_path)
    registered = 0
    skipped = 0
    try:
        existing = _registered_paths(conn)
        for path in files:
            title = os.path.splitext(os.path.basename(path))[0]

            if path in existing:
                print(f"[pulado] '{title}' ja cadastrado.")
                skipped += 1
                continue

            try:
                fingerprints = fingerprint.generate(path)
                song_id = database.insert_song(conn, title, artist, path)
                n = database.insert_fingerprints(conn, song_id, fingerprints)
                print(f"[ok] '{title}' -> {n} hashes (song_id={song_id}).")
                registered += 1
            except Exception as exc:
                print(f"[erro] '{title}': {exc}")
    finally:
        conn.close()

    return (registered, skipped)

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Cadastra todas as musicas de uma pasta no banco."
    )
    parser.add_argument("--dir", default="musics",
                        help="Pasta com os audios (padrao: musics).")
    parser.add_argument("--db", default="fingerprints.db",
                        help="Banco SQLite de destino (padrao: fingerprints.db).")
    parser.add_argument("--artist", default="Desconhecido",
                        help="Artista atribuido a todas as musicas "
                            "(padrao: Desconhecido).")
    parser.add_argument("--reset", action="store_true",
                        help="Apaga o banco antes de cadastrar (cadastro limpo).")
    args = parser.parse_args()

    registered, skipped = register_folder(
        args.dir, args.db, args.artist, args.reset
    )

    print(f"\nConcluido. {registered} musica(s) cadastrada(s), "
        f"{skipped} pulada(s). Banco: '{args.db}'.")

if __name__ == "__main__":
    main()

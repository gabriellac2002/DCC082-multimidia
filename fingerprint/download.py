from __future__ import annotations

import argparse
import os

import yt_dlp

def download_playlist(url: str, out_dir: str, audio_format: str = "mp3") -> int:
    os.makedirs(out_dir, exist_ok=True)

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": os.path.join(out_dir, "%(title)s.%(ext)s"),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": audio_format,
                "preferredquality": "192",
            }
        ],
        "ignoreerrors": True,
        "quiet": False,
        "no_warnings": False,
    }

    print(f"Baixando audio da playlist em: {out_dir} (formato {audio_format})")
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    files = [f for f in os.listdir(out_dir)
            if f.lower().endswith(("." + audio_format, ".mp3", ".m4a", ".wav",
                                    ".opus", ".webm"))]
    return len(files)

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Baixa todas as musicas de uma playlist do YouTube como audio."
    )
    parser.add_argument("url",
                        help="Link da playlist do YouTube (entre aspas).")
    parser.add_argument("--out", default="musics",
                        help="Pasta de destino dos audios (padrao: musics).")
    parser.add_argument("--format", default="mp3",
                        help="Formato do audio: mp3, m4a, wav... (padrao: mp3).")
    args = parser.parse_args()

    total = download_playlist(args.url, args.out, args.format)
    print(f"\nConcluido. {total} arquivo(s) de audio em '{args.out}'.")

if __name__ == "__main__":
    main()

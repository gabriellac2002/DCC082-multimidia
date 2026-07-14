from __future__ import annotations

import os

os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")

def _patch_numpy_compat() -> None:
    import types

    import numpy

    if not hasattr(numpy.lib, "pad"):
        numpy.lib.pad = numpy.pad

    if getattr(numpy.vstack, "_ina_compat", False):
        return

    def _make_seq_coercing(orig):
        def wrapper(tup, *args, **kwargs):
            if isinstance(tup, types.GeneratorType):
                tup = list(tup)
            return orig(tup, *args, **kwargs)
        wrapper._ina_compat = True
        return wrapper

    for name in ("vstack", "hstack", "stack", "column_stack", "dstack"):
        setattr(numpy, name, _make_seq_coercing(getattr(numpy, name)))

def detect_music_segments(
    audio_path: str, min_duration: float = 2.0
) -> list[tuple[float, float]]:
    from inaSpeechSegmenter import Segmenter

    _patch_numpy_compat()

    seg = Segmenter(detect_gender=False)

    segmentation = seg(audio_path)

    music_segments: list[tuple[float, float]] = []
    for label, start, end in segmentation:
        if label != "music":
            continue
        if end - start < min_duration:
            continue
        music_segments.append((start, end))

    return music_segments

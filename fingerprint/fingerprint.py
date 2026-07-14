from __future__ import annotations

import numpy as np
from scipy.ndimage import maximum_filter

SAMPLE_RATE = 16000
"""Taxa de amostragem alvo, em Hz.

Audio para 16 kHz mono. Pela teorema de Nyquist isso cobre
frequencias ate 8 kHz, faixa onde se concentra a maior parte da energia
perceptualmente relevante de musica e voz. Fixar a taxa garante que musicas
gravadas em qualidades diferentes gerem fingerprints comparaveis, e reduzir de
44.1 kHz para 16 kHz diminui bastante o custo da STFT. (TODO: tentar reduzir mais e ver o resultado)"""

N_FFT = 4096
"""Tamanho da janela (em amostras) de cada quadro da STFT.

Define a resolucao em frequencia: cada "bin" cobre SAMPLE_RATE / N_FFT =
16000 / 4096 ~= 3.9 Hz. Uma janela grande da boa resolucao em frequencia (picos
espectrais bem definidos), ao custo de pior resolucao temporal, aceitavel
aqui porque os picos sao estaveis ao longo de varios quadros."""

HOP_LENGTH = 512
"""Deslocamento (em amostras) entre quadros consecutivos da STFT.

Com 512 amostras a 16 kHz, cada quadro avanca 512 / 16000 = 32 ms. Como
HOP_LENGTH < N_FFT, ha sobreposicao entre janelas (overlap de 7/8), o que torna
a localizacao dos picos no tempo mais suave e robusta."""

PEAK_NEIGHBORHOOD_SIZE = 20
"""Lado (em bins) da vizinhanca quadrada usada na deteccao de maximos locais.

Um ponto do espectrograma e considerado pico se for o maximo dentro de uma
janela 20x20 (frequencia x tempo) centrada nele. Vizinhanca grande => menos
picos, porem mais distintivos e mais espacados; vizinhanca pequena => muitos
picos sensiveis a ruido. 20x20 e um meio-termo classico para esta resolucao."""

PEAK_AMP_MIN_PERCENTILE = 50
"""Percentil de energia usado como piso para descartar picos fracos.

Mesmo sendo maximo local, um pico com amplitude muito baixa provavelmente e
ruido. Mantemos apenas picos acima deste percentil da magnitude do
espectrograma, evitando popular o banco com hashes pouco confiaveis. Um piso
moderado (mediana) e importante para a robustez a ruido: pisos muito altos
sobem junto com o ruido de fundo e acabam descartando picos legitimos do trecho
gravado."""

PEAKS_PER_WINDOW = 8
"""Numero N de picos mais fortes mantidos por janela de tempo.

Para nao deixar trechos densos (refraos, percussao) dominarem o fingerprint,
agrupar os picos em janelas de tempo e ficar so com os N mais fortes de
cada uma. Isso espalha os picos de forma mais uniforme ao longo da musica.

quanto mais picos, maior a chance de que alguns sobrevivam a degradacao e coincidam
com os da musica original."""

PEAK_TIME_WINDOW = 5
"""Largura (em quadros) de cada janela de tempo usada por PEAKS_PER_WINDOW.

5 quadros ~= 0.16 s. Combinado com PEAKS_PER_WINDOW=8, da uma densidade-alvo de
~8 picos a cada 0.16 s (~50 picos/s): bem mais densa que o minimo teorico,
necessaria para robustez a gravacoes acusticas. Em fingerprinting de audio
DIGITAL puro (trecho extraido do mesmo arquivo) uma densidade bem menor ja
bastaria, mas aqui preciso priorizar o caso real de gravacao por microfone."""

FAN_OUT = 15
"""Numero K de picos-alvo combinados com cada pico-ancora.

Cada pico "ancora" e pareado com os K picos seguintes dentro da janela de
tempo. Fan-out maior => mais hashes (fingerprint mais robusto a ruido), porem
banco maior e busca mais lenta. K=15 e o valor sugerido na literatura. (TODO: confirmar fontes mais recentes)"""

MAX_DELTA_FRAMES = 200
"""Distancia temporal maxima (em quadros) entre ancora e alvo de um par.

200 quadros ~= 6.4 s. Limita a "janela alvo" a frente da ancora: pares muito
distantes no tempo sao menos confiaveis (o trecho pode nem conte-los) e
explodiriam o numero de combinacoes. Tambem precisa caber nos bits reservados
para delta_time no hash (8 bits => 0..255)."""

FREQ_QUANTIZE_BITS = 2
"""Bits de quantizacao do bin de frequencia (banding).

Cada bin e dividido por 2**FREQ_QUANTIZE_BITS = 4 antes de entrar no hash, ou
seja, bandas de ~4 bins ~= 15.6 Hz. Valor maior => mais robusto a desafinacao,
porem hashes menos distintivos. 2 e um bom equilibrio para gravacoes acusticas."""

_FREQ_BITS = 11
_DT_BITS = 8
_FREQ_MASK = (1 << _FREQ_BITS) - 1
_DT_MASK = (1 << _DT_BITS) - 1

def _load_audio(audio_path: str) -> np.ndarray:
    try:
        import librosa
        samples, _ = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)
        return samples.astype(np.float32)
    except ImportError:
        return _load_audio_fallback(audio_path)

def _load_audio_fallback(audio_path: str) -> np.ndarray:
    import soundfile as sf
    from scipy.signal import resample

    samples, sr = sf.read(audio_path, always_2d=True)
    mono = samples.mean(axis=1).astype(np.float32)
    if sr != SAMPLE_RATE:
        n_target = int(round(len(mono) * SAMPLE_RATE / sr))
        mono = resample(mono, n_target).astype(np.float32)
    return mono

def _compute_spectrogram(samples: np.ndarray) -> np.ndarray:
    try:
        import librosa
        stft = librosa.stft(samples, n_fft=N_FFT, hop_length=HOP_LENGTH,
                            window="hann")
        return np.abs(stft)
    except ImportError:
        from scipy.signal import stft as scipy_stft
        _f, _t, zxx = scipy_stft(
            samples, fs=SAMPLE_RATE, window="hann", nperseg=N_FFT,
            noverlap=N_FFT - HOP_LENGTH, boundary=None, padded=False,
        )
        return np.abs(zxx)

def _find_peaks(spectrogram: np.ndarray) -> list[tuple[int, int]]:
    local_max = maximum_filter(
        spectrogram, size=PEAK_NEIGHBORHOOD_SIZE) == spectrogram

    amp_floor = np.percentile(spectrogram, PEAK_AMP_MIN_PERCENTILE)
    detected = local_max & (spectrogram > amp_floor)

    freq_idx, time_idx = np.where(detected)
    return list(zip(freq_idx.tolist(), time_idx.tolist()))

def _filter_strongest_peaks(
    peaks: list[tuple[int, int]], spectrogram: np.ndarray
) -> list[tuple[int, int]]:
    windows: dict[int, list[tuple[int, int]]] = {}
    for freq, time in peaks:
        w = time // PEAK_TIME_WINDOW
        windows.setdefault(w, []).append((freq, time))

    strongest: list[tuple[int, int]] = []
    for group in windows.values():
        group.sort(key=lambda p: spectrogram[p[0], p[1]], reverse=True)
        strongest.extend(group[:PEAKS_PER_WINDOW])

    strongest.sort(key=lambda p: p[1])
    return strongest

def _encode_hash(freq1: int, freq2: int, delta_time: int) -> int:
    f1 = (freq1 >> FREQ_QUANTIZE_BITS) & _FREQ_MASK
    f2 = (freq2 >> FREQ_QUANTIZE_BITS) & _FREQ_MASK
    dt = delta_time & _DT_MASK
    return (f1 << (_FREQ_BITS + _DT_BITS)) | (f2 << _DT_BITS) | dt

def _generate_hashes(peaks: list[tuple[int, int]]) -> list[tuple[int, float]]:
    frame_duration = HOP_LENGTH / SAMPLE_RATE
    hashes: list[tuple[int, float]] = []

    for i, (freq1, t1) in enumerate(peaks):
        fan = 0
        for freq2, t2 in peaks[i + 1:]:
            delta = t2 - t1
            if delta <= 0:
                continue
            if delta > MAX_DELTA_FRAMES:
                break
            h = _encode_hash(freq1, freq2, delta)
            time_offset = t1 * frame_duration
            hashes.append((h, time_offset))
            fan += 1
            if fan >= FAN_OUT:
                break

    return hashes

def generate(audio_path: str) -> list[tuple[int, float]]:
    samples = _load_audio(audio_path)
    spectrogram = _compute_spectrogram(samples)
    peaks = _find_peaks(spectrogram)
    peaks = _filter_strongest_peaks(peaks, spectrogram)
    return _generate_hashes(peaks)

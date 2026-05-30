"""
Generate "FORA!" and "FAULT!" sound clips using TTS.

Usage:
    pip install gtts pydub
    python scripts/generate-sounds.py

Requires ffmpeg for pydub (or just use the gTTS mp3 directly).
"""

from gtts import gTTS

# "FORA!" in Portuguese
tts_out = gTTS("Fora!", lang="pt", slow=False)
tts_out.save("public/sounds/out.mp3")
print("Generated public/sounds/out.mp3")

# "FAULT!" in English
tts_fault = gTTS("Fault!", lang="en", slow=False)
tts_fault.save("public/sounds/fault.mp3")
print("Generated public/sounds/fault.mp3")

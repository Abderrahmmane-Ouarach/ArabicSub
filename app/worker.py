import subprocess, os

UPLOADS = "uploads"
OUTPUTS = "outputs"
os.makedirs(UPLOADS, exist_ok=True)
os.makedirs(OUTPUTS, exist_ok=True)

def transcribe_video(video_path: str, srt_path: str, model="small", max_chars=35):
    audio_path = video_path.rsplit(".", 1)[0] + "_audio.wav"
    
    # Extract lightweight audio track first
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
        audio_path
    ], check=True)

    subprocess.run([
        "stable-ts", audio_path,   # <-- audio, not video
        "--language", "Arabic",
        "--model", model,
        "--device", "cpu",
        "--max_chars", str(max_chars),
        "--regroup", "True",
        "--word_level", "False",
        "--vad", "True",
        "--output", srt_path
    ], check=True)

    os.remove(audio_path)  # cleanup

def burn_subtitles(
    video_path, srt_path, ass_path, out_path,
    font_name="Cairo", font_size=32,
    primary_color="&H00FFFFFF", outline_color="&H00000000",
    back_color="&H00000000", bold="-1",
    outline=3, shadow=0, margin_v=30
):
    # SRT → ASS
    subprocess.run(["ffmpeg", "-y", "-i", srt_path, ass_path], check=True)

    # Inject custom style into ASS file
    style_line = (
        f"Style: Default,{font_name},{font_size},"
        f"{primary_color},&H000000FF,{outline_color},{back_color},"
        f"{bold},0,0,0,100,100,0,0,1,{outline},{shadow},2,30,30,{margin_v},1"
    )
    with open(ass_path) as f:
        content = f.read()
    content = "\n".join(
        style_line if line.startswith("Style: Default") else line
        for line in content.splitlines()
    )
    with open(ass_path, "w") as f:
        f.write(content)

    # Burn into video
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-vf", f"ass='{ass_path}'",
        "-preset", "ultrafast",   # <-- biggest speed gain
        "-crf", "23",             # optional: quality control (18=high, 28=low)
        out_path
    ], check=True)

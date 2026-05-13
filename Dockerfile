FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    apache2-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Download Cairo font (Google Fonts) so ffmpeg/ASS can use it
RUN mkdir -p /usr/share/fonts/truetype/cairo \
    && wget -q "https://github.com/google/fonts/raw/main/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf" \
       -O /usr/share/fonts/truetype/cairo/Cairo.ttf \
    && fc-cache -fv

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p uploads outputs jobs

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

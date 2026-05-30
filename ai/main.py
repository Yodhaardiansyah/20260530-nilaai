import cv2
import time  
import httpx 
import threading
import os
import sys
from pathlib import Path 
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from ultralytics import YOLO

app = FastAPI()
templates = Jinja2Templates(directory="templates")

# --- Muat Model YOLO ---
print("Memuat model YOLO...")
model = YOLO('best.pt') 

# --- Konfigurasi Server Laravel ---
LARAVEL_HOST = "http://10.28.144.94:8000"
API_FISH_COUNT = f"{LARAVEL_HOST}/api/machine/fish-count"
API_CHECK_COMMAND = f"{LARAVEL_HOST}/api/machine/check-command"
MACHINE_TOKEN = "token-rahasia-mesin-123"

# --- Variabel Kontrol ---
last_report_time = 0
REPORT_INTERVAL = 5  # Kirim data hitungan tiap 5 detik
resolution_toggle = False # Flag untuk memicu perubahan resolusi

# =======================================================
# 1. THREAD PENERIMA PERINTAH (Berjalan di Latar Belakang)
# =======================================================
def command_listener():
    """Fungsi ini akan terus berjalan di background mengecek API perintah"""
    global resolution_toggle
    
    while True:
        try:
            with httpx.Client() as client:
                response = client.get(
                    API_CHECK_COMMAND,
                    headers={"Authorization": f"Bearer {MACHINE_TOKEN}"},
                    timeout=3.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    command = data.get("command")
                    
                    if command == "restart":
                        print("🔄 [PERINTAH DITERIMA] Memicu Uvicorn Auto-Reload...")
                        
                        # Trik ajaib untuk Uvicorn dengan --reload:
                        # "Sentuh" file ini agar sistem mengira ada kode yang diubah.
                        # Uvicorn akan otomatis membersihkan RAM, mematikan kamera, 
                        # dan merestart semuanya dari awal dengan sangat rapi!
                        Path(__file__).touch()
                        
                    elif command == "resolusi":
                        print("⚙️ [PERINTAH DITERIMA] Mengubah resolusi kamera...")
                        resolution_toggle = True 
                        
        except Exception as e:
            pass 
            
        time.sleep(5)

# Jalankan thread saat FastAPI pertama kali menyala
@app.on_event("startup")
def startup_event():
    thread = threading.Thread(target=command_listener, daemon=True)
    thread.start()
    print("📡 Listener perintah IoT berjalan di latar belakang...")


# =======================================================
# 2. GENERATOR VIDEO & AI VISION
# =======================================================
def generate_frames():
    global last_report_time, resolution_toggle
    
    camera = cv2.VideoCapture(0)
    
    is_high_res = True
    camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    try: # <-- Tambahkan blok TRY di sini
        while True:
            if resolution_toggle:
                is_high_res = not is_high_res
                if is_high_res:
                    camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                else:
                    camera.set(cv2.CAP_PROP_FRAME_WIDTH, 320)
                    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 240)
                resolution_toggle = False 

            success, frame = camera.read()
            if not success:
                break
            else:
                results = model(frame, conf=0.85, verbose=False)
                boxes = results[0].boxes
                jumlah_nila = len(boxes) 
                
                frame_annotated = results[0].plot()
                
                cv2.putText(frame_annotated, f"Jumlah Terdeteksi: {jumlah_nila}", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2, cv2.LINE_AA)
                
                current_time = time.time()
                if current_time - last_report_time > REPORT_INTERVAL:
                    try:
                        with httpx.Client() as client:
                            client.post(
                                API_FISH_COUNT,
                                json={"fish_count": jumlah_nila},
                                headers={"Authorization": f"Bearer {MACHINE_TOKEN}"},
                                timeout=2.0
                            )
                        last_report_time = current_time
                    except Exception as e:
                        pass
                
                ret, buffer = cv2.imencode('.jpg', frame_annotated)
                frame_bytes = buffer.tobytes()
                
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

    except Exception as e:
        # Menangkap error saat HP memutus koneksi (ClientDisconnect)
        print("Koneksi klien diputus, me-reset stream...")
        
    finally: # <-- Tambahkan FINALLY di sini
        # Pastikan kamera SELALU dilepas apapun yang terjadi
        camera.release()
        print("Kamera dilepas untuk koneksi baru.")
    camera.release()

# =======================================================
# 3. ROUTE FASTAPI
# =======================================================
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(
        generate_frames(), 
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
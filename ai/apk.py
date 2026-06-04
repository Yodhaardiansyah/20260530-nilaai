import os
# Matikan log internal OpenCV yang berisik
os.environ["OPENCV_LOG_LEVEL"] = "SILENT" 
os.environ["OPENCV_VIDEOIO_PRIORITY_MSMF"] = "0"

import cv2
import time
import httpx
import threading
import sys
from pathlib import Path
import customtkinter as ctk
from tkinter import filedialog
from PIL import Image
from ultralytics import YOLO
from dotenv import load_dotenv, set_key
import uvicorn
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

# ==========================================
# UTILITAS LOGGING GUI
# ==========================================
class OutputRedirector:
    def __init__(self, textbox, app_instance):
        self.textbox = textbox
        self.app = app_instance 

    def write(self, string):
        self.app.after(0, self._write_thread_safe, string)

    def _write_thread_safe(self, string):
        self.textbox.insert("end", string)
        self.textbox.see("end")

    def flush(self):
        pass

# ==========================================
# INITIALIZE FASTAPI (SERVICE LOKAL)
# ==========================================
fastapi_app = FastAPI()
app_reference = None 

@fastapi_app.get("/")
def index():
    global app_reference
    if app_reference:
        return {
            "status": "running",
            "camera_active": app_reference.is_camera_running,
            "fish_count": app_reference.fish_count
        }
    return {"status": "initializing"}

def network_video_generator():
    """Generator stream video anti-delay untuk web"""
    global app_reference
    while True:
        if app_reference and app_reference.is_camera_running:
            frame_to_send = None
            
            # Ambil frame PALING BARU saja, kunci sekilas lalu lepas
            with app_reference.frame_lock:
                if app_reference.current_frame is not None:
                    frame_to_send = app_reference.current_frame.copy()
            
            if frame_to_send is not None:
                # Kompresi JPEG ke 60% agar super ringan dikirim ke browser (mengurangi lag)
                encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 60]
                ret, buffer = cv2.imencode('.jpg', frame_to_send, encode_param)
                
                if ret:
                    frame_bytes = buffer.tobytes()
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        
        # Batasi kecepatan stream maksimal ~20 FPS agar jaringan stabil
        time.sleep(0.05) 

@fastapi_app.get("/video_feed")
def video_feed():
    return StreamingResponse(
        network_video_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

# ==========================================
# KONFIGURASI TEMA GUI
# ==========================================
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

class AIVisionApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        global app_reference
        app_reference = self 

        self.title("AI Vision Edge - Desktop App")
        self.geometry("1100x750")

        # --- INISIALISASI VARIABEL & ENV ---
        load_dotenv(override=True)
        self.env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
        
        self.laravel_host = os.getenv("LARAVEL_HOST", "http://127.0.0.1:8000")
        self.machine_token = os.getenv("MACHINE_TOKEN", "token-default")
        self.app_port = os.getenv("APP_PORT", "8080") 
        self.yolo_model_path = os.getenv("YOLO_MODEL_PATH", "best.pt")
        self.camera_index = int(os.getenv("CAMERA_INDEX", "0"))
        self.camera_resolution = os.getenv("CAMERA_RESOLUTION", "640x480")
        self.confidence_level = float(os.getenv("AI_CONFIDENCE", "0.85"))
        
        # --- STATE APLIKASI ---
        self.camera = None
        self.is_camera_running = False
        self.thread_running = False
        self.fish_count = 0
        self.current_frame = None
        self.frame_lock = threading.Lock()
        self.last_report_time = 0
        self.report_interval = 5
        self.available_cameras = ["Pindai ulang..."]

        self.setup_ui()
        
        sys.stdout = OutputRedirector(self.log_textbox, self)
        sys.stderr = OutputRedirector(self.log_textbox, self)
        
        print("Sistem Memulai...")

        threading.Thread(target=self.scan_cameras, daemon=True).start()

        print(f"Memuat model YOLO dari: {self.yolo_model_path} ...")
        try:
            self.model = YOLO(self.yolo_model_path)
            print("✅ Model YOLO berhasil dimuat!")
        except Exception as e:
            print(f"❌ Peringatan: Model {self.yolo_model_path} gagal dimuat. {e}")
            self.model = None

        self.start_fastapi_service()

        self.listener_active = True
        self.listener_thread = threading.Thread(target=self.command_listener, daemon=True)
        self.listener_thread.start()

        self.update_gui()

    # ==========================================
    # BAGIAN 1: PEMBUATAN USER INTERFACE
    # ==========================================
    def setup_ui(self):
        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(1, weight=1)

        self.sidebar = ctk.CTkFrame(self, width=220, corner_radius=0)
        self.sidebar.grid(row=0, column=0, sticky="nsew")
        self.sidebar.grid_rowconfigure(5, weight=1)

        self.logo_label = ctk.CTkLabel(self.sidebar, text="Menu Sistem", font=ctk.CTkFont(size=22, weight="bold"))
        self.logo_label.grid(row=0, column=0, padx=20, pady=(30, 20))

        self.btn_home = ctk.CTkButton(self.sidebar, text="🏠 Home", command=self.show_home)
        self.btn_home.grid(row=1, column=0, padx=20, pady=10)

        self.btn_camera = ctk.CTkButton(self.sidebar, text="📷 Kamera", command=self.show_camera)
        self.btn_camera.grid(row=2, column=0, padx=20, pady=10)

        self.btn_setting = ctk.CTkButton(self.sidebar, text="⚙️ Setting", command=self.show_setting)
        self.btn_setting.grid(row=3, column=0, padx=20, pady=10)

        self.btn_log = ctk.CTkButton(self.sidebar, text="📜 Log Sistem", command=self.show_log)
        self.btn_log.grid(row=4, column=0, padx=20, pady=10)

        self.home_frame = ctk.CTkFrame(self, corner_radius=10)
        self.camera_frame = ctk.CTkFrame(self, corner_radius=10)
        self.setting_frame = ctk.CTkScrollableFrame(self, corner_radius=10)
        self.log_frame = ctk.CTkFrame(self, corner_radius=10)

        self.build_home_frame()
        self.build_camera_frame()
        self.build_setting_frame()
        self.build_log_frame()

        self.show_home()

    def build_home_frame(self):
        self.home_frame.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(self.home_frame, text="Dashboard Utama", font=ctk.CTkFont(size=28, weight="bold")).pack(pady=(40, 10))
        self.lbl_status_kamera = ctk.CTkLabel(self.home_frame, text="Status Kamera: Tidak Aktif", font=("Arial", 18), text_color="red")
        self.lbl_status_kamera.pack(pady=5)
        self.lbl_home_count = ctk.CTkLabel(self.home_frame, text="Total Deteksi Saat Ini: 0", font=ctk.CTkFont(size=40, weight="bold"), text_color="#2FA572")
        self.lbl_home_count.pack(pady=30)
        self.lbl_local_service = ctk.CTkLabel(self.home_frame, text=f"Service Lokal Berjalan di: http://localhost:{self.app_port}", font=("Arial", 14, "italic"), text_color="cyan")
        self.lbl_local_service.pack(pady=5)
        self.lbl_server_status = ctk.CTkLabel(self.home_frame, text=f"Target Backend Laravel: {self.laravel_host}", font=("Arial", 14))
        self.lbl_server_status.pack(pady=5)

    def build_camera_frame(self):
        self.camera_frame.grid_rowconfigure(1, weight=1)
        self.camera_frame.grid_columnconfigure(0, weight=1)
        self.camera_frame.grid_columnconfigure(1, weight=1)

        # Panel Kontrol Kamera (Kiri)
        control_panel = ctk.CTkFrame(self.camera_frame)
        control_panel.grid(row=0, column=0, columnspan=2, pady=10, padx=20, sticky="ew")
        
        ctk.CTkLabel(control_panel, text="Pilih Kamera:").pack(side="left", padx=(10, 5))
        self.combo_kamera = ctk.CTkComboBox(control_panel, values=self.available_cameras, width=150)
        self.combo_kamera.set(f"Kamera {self.camera_index}")
        self.combo_kamera.pack(side="left", padx=5)

        ctk.CTkLabel(control_panel, text="Resolusi:").pack(side="left", padx=(15, 5))
        self.combo_resolusi = ctk.CTkComboBox(control_panel, values=["320x240", "640x480", "800x600", "1280x720"], width=100)
        self.combo_resolusi.set(self.camera_resolution)
        self.combo_resolusi.pack(side="left", padx=5)

        # Slider Threshold AI
        self.lbl_conf = ctk.CTkLabel(control_panel, text=f"Sensitivitas AI: {self.confidence_level:.2f}")
        self.lbl_conf.pack(side="left", padx=(15, 5))
        self.slider_conf = ctk.CTkSlider(control_panel, from_=0.1, to=1.0, width=120, command=self.update_confidence)
        self.slider_conf.set(self.confidence_level)
        self.slider_conf.pack(side="left", padx=5)

        self.btn_apply_cam = ctk.CTkButton(control_panel, text="Terapkan", width=80, command=self.apply_camera_settings)
        self.btn_apply_cam.pack(side="right", padx=10)

        # Area Video Feed
        self.video_label = ctk.CTkLabel(self.camera_frame, text="Video Feed Offline", bg_color="black")
        self.video_label.grid(row=1, column=0, columnspan=2, padx=20, pady=5, sticky="nsew")

        self.btn_toggle_cam = ctk.CTkButton(self.camera_frame, text="Mulai Kamera", font=("Arial", 16, "bold"), command=self.toggle_camera, fg_color="green", hover_color="darkgreen")
        self.btn_toggle_cam.grid(row=2, column=0, columnspan=2, pady=(10, 20))

    def build_setting_frame(self):
        ctk.CTkLabel(self.setting_frame, text="Konfigurasi Server & Model", font=ctk.CTkFont(size=24, weight="bold")).pack(pady=(20, 20))

        ctk.CTkLabel(self.setting_frame, text="Path File Model YOLO (.pt):", font=("Arial", 14)).pack(anchor="w", padx=50)
        frame_model = ctk.CTkFrame(self.setting_frame, fg_color="transparent")
        frame_model.pack(fill="x", padx=50, pady=5)
        self.entry_model = ctk.CTkEntry(frame_model, width=300, font=("Arial", 14))
        self.entry_model.insert(0, self.yolo_model_path)
        self.entry_model.pack(side="left", padx=(0, 10))
        ctk.CTkButton(frame_model, text="Cari File", width=80, command=self.browse_model_file).pack(side="left")

        ctk.CTkLabel(self.setting_frame, text="Port Service Aplikasi Ini:", font=("Arial", 14)).pack(anchor="w", padx=50, pady=(15, 0))
        self.entry_port = ctk.CTkEntry(self.setting_frame, width=390, font=("Arial", 14))
        self.entry_port.insert(0, self.app_port)
        self.entry_port.pack(pady=5, padx=50, anchor="w")

        ctk.CTkLabel(self.setting_frame, text="Laravel Host URL Backend:", font=("Arial", 14)).pack(anchor="w", padx=50)
        self.entry_host = ctk.CTkEntry(self.setting_frame, width=390, font=("Arial", 14))
        self.entry_host.insert(0, self.laravel_host)
        self.entry_host.pack(pady=5, padx=50, anchor="w")

        ctk.CTkLabel(self.setting_frame, text="Machine Token API:", font=("Arial", 14)).pack(anchor="w", padx=50)
        self.entry_token = ctk.CTkEntry(self.setting_frame, width=390, font=("Arial", 14))
        self.entry_token.insert(0, self.machine_token)
        self.entry_token.pack(pady=5, padx=50, anchor="w")

        self.btn_save_setting = ctk.CTkButton(self.setting_frame, text="Simpan Pengaturan Inti", font=("Arial", 16, "bold"), command=self.save_core_settings, fg_color="#2B7B5A")
        self.btn_save_setting.pack(pady=30)
        
        self.lbl_save_notif = ctk.CTkLabel(self.setting_frame, text="", font=("Arial", 14), text_color="green")
        self.lbl_save_notif.pack()

    def build_log_frame(self):
        self.log_frame.grid_rowconfigure(1, weight=1)
        self.log_frame.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(self.log_frame, text="Terminal Log Real-time", font=ctk.CTkFont(size=20, weight="bold")).grid(row=0, column=0, pady=10, padx=20, sticky="w")
        self.log_textbox = ctk.CTkTextbox(self.log_frame, font=("Consolas", 12), text_color="#00FF00", fg_color="#1E1E1E")
        self.log_textbox.grid(row=1, column=0, padx=20, pady=(0, 20), sticky="nsew")

    # ==========================================
    # BAGIAN 2: LOGIKA ANTARMUKA
    # ==========================================
    def show_home(self):
        self.camera_frame.grid_forget()
        self.setting_frame.grid_forget()
        self.log_frame.grid_forget()
        self.home_frame.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)

    def show_camera(self):
        self.home_frame.grid_forget()
        self.setting_frame.grid_forget()
        self.log_frame.grid_forget()
        self.camera_frame.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)

    def show_setting(self):
        self.home_frame.grid_forget()
        self.camera_frame.grid_forget()
        self.log_frame.grid_forget()
        self.setting_frame.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)

    def show_log(self):
        self.home_frame.grid_forget()
        self.camera_frame.grid_forget()
        self.setting_frame.grid_forget()
        self.log_frame.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)

    def browse_model_file(self):
        filename = filedialog.askopenfilename(title="Pilih Model YOLO", filetypes=[("YOLO Files", "*.pt"), ("All Files", "*.*")])
        if filename:
            self.entry_model.delete(0, "end")
            self.entry_model.insert(0, filename)

    def scan_cameras(self):
        print("🔍 Memindai perangkat keras kamera... Mohon tunggu.")
        available = []
        for i in range(3):
            cap = cv2.VideoCapture(i) 
            if cap.isOpened():
                available.append(f"Kamera {i}")
                cap.release()
        
        if available:
            self.available_cameras = available
            print(f"✅ Kamera ditemukan: {', '.join(available)}")
        else:
            self.available_cameras = ["Kamera 0 (Default)"]
            print("⚠️ Tidak ada kamera keras terdeteksi. Menggunakan Default 0.")
            
        self.combo_kamera.configure(values=self.available_cameras)
        if f"Kamera {self.camera_index}" in self.available_cameras:
            self.combo_kamera.set(f"Kamera {self.camera_index}")
        else:
            self.combo_kamera.set(self.available_cameras[0])

    def update_confidence(self, value):
        self.confidence_level = round(float(value), 2)
        self.lbl_conf.configure(text=f"Sensitivitas AI: {self.confidence_level:.2f}")
        
        if not os.path.exists(self.env_path):
            open(self.env_path, 'w').close()
        set_key(self.env_path, "AI_CONFIDENCE", str(self.confidence_level))

    def apply_camera_settings(self):
        self.camera_resolution = self.combo_resolusi.get()
        cam_str = self.combo_kamera.get()
        self.camera_index = int(''.join(filter(str.isdigit, cam_str)) or 0)
        
        if not os.path.exists(self.env_path):
            open(self.env_path, 'w').close()
        set_key(self.env_path, "CAMERA_INDEX", str(self.camera_index))
        set_key(self.env_path, "CAMERA_RESOLUTION", self.camera_resolution)
        
        print(f"📷 Kamera diset ke Index {self.camera_index}, Resolusi {self.camera_resolution}")
        
        if self.is_camera_running:
            self.toggle_camera()
            self.after(500, self.toggle_camera)

    # ==========================================
    # BAGIAN 3: LOGIKA BACKGROUND & SERVICE
    # ==========================================
    def start_fastapi_service(self):
        def run_server():
            try:
                print(f"🚀 Memulai Service FastAPI di port {self.app_port}...")
                uvicorn.run(fastapi_app, host="0.0.0.0", port=int(self.app_port), log_config=None)
            except Exception as e:
                print(f"❌ Gagal menjalankan service: {e}")

        self.service_thread = threading.Thread(target=run_server, daemon=True)
        self.service_thread.start()

    def save_core_settings(self):
        old_port = self.app_port
        old_model = self.yolo_model_path
        
        self.app_port = self.entry_port.get()
        self.laravel_host = self.entry_host.get()
        self.machine_token = self.entry_token.get()
        self.yolo_model_path = self.entry_model.get()
        
        if not os.path.exists(self.env_path):
            open(self.env_path, 'w').close()
            
        set_key(self.env_path, "APP_PORT", self.app_port)
        set_key(self.env_path, "LARAVEL_HOST", self.laravel_host)
        set_key(self.env_path, "MACHINE_TOKEN", self.machine_token)
        set_key(self.env_path, "YOLO_MODEL_PATH", self.yolo_model_path)
        
        self.lbl_server_status.configure(text=f"Target Backend Laravel: {self.laravel_host}")
        self.lbl_local_service.configure(text=f"Service Lokal Berjalan di: http://localhost:{self.app_port}")
        
        if old_port != self.app_port or old_model != self.yolo_model_path:
            self.lbl_save_notif.configure(text="Membutuhkan Restart Aplikasi...", text_color="orange")
            print("🔄 Membutuhkan Restart Sistem...")
            self.after(2000, self.restart_app)
        else:
            self.lbl_save_notif.configure(text="Pengaturan berhasil disimpan!", text_color="green")
            self.after(3000, lambda: self.lbl_save_notif.configure(text=""))

    def command_listener(self):
        while self.listener_active:
            url_check = f"{self.laravel_host}/api/machine/check-command"
            try:
                with httpx.Client() as client:
                    response = client.get(url_check, headers={"Authorization": f"Bearer {self.machine_token}"}, timeout=3.0)
                    if response.status_code == 200:
                        data = response.json()
                        command = data.get("command")
                        
                        if command == "restart":
                            print("🔄 [API] Perintah Restart Diterima dari Backend.")
                            self.restart_app()
                        elif command == "resolusi":
                            print("⚙️ [API] Perintah Resolusi Diterima.")
                            # Ubah resolusi bergiliran (Toggle)
                            if self.camera_resolution == "640x480":
                                self.combo_resolusi.set("320x240")
                            else:
                                self.combo_resolusi.set("640x480")
                            # Panggil fungsi apply untuk menyimpan & merefresh kamera
                            self.after(100, self.apply_camera_settings)
            except Exception:
                pass
            time.sleep(5)

    def restart_app(self):
        self.listener_active = False
        self.thread_running = False
        if self.camera:
            self.camera.release()
        
        import subprocess
        subprocess.Popen([sys.executable] + sys.argv)
        self.destroy()
        os._exit(0)

    def send_fish_count(self, count):
        url_post = f"{self.laravel_host}/api/machine/fish-count"
        try:
            with httpx.Client() as client:
                client.post(url_post, json={"fish_count": count}, headers={"Authorization": f"Bearer {self.machine_token}"}, timeout=2.0)
        except Exception:
            pass

    # ==========================================
    # BAGIAN 4: LOGIKA KAMERA & AI VISION
    # ==========================================
    def toggle_camera(self):
        if not self.is_camera_running:
            self.camera = cv2.VideoCapture(self.camera_index)
            
            if not self.camera.isOpened():
                print(f"❌ Gagal membuka kamera pada indeks {self.camera_index}!")
                return
            
            res_w, res_h = map(int, self.camera_resolution.split('x'))
            self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, res_w)
            self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, res_h)
            
            print(f"✅ Kamera menyala (Resolusi: {res_w}x{res_h}, Conf: {self.confidence_level})")
            
            self.is_camera_running = True
            self.thread_running = True
            self.btn_toggle_cam.configure(text="Matikan Kamera", fg_color="red", hover_color="darkred")
            self.lbl_status_kamera.configure(text="Status Kamera: Aktif", text_color="green")
            
            threading.Thread(target=self.vision_processing, daemon=True).start()
        else:
            self.is_camera_running = False
            self.thread_running = False
            self.btn_toggle_cam.configure(text="Mulai Kamera", fg_color="green", hover_color="darkgreen")
            self.lbl_status_kamera.configure(text="Status Kamera: Tidak Aktif", text_color="red")
            
            if self.camera:
                self.camera.release()
            self.video_label.configure(image="")
            self.video_label.configure(text="Video Feed Offline")
            with self.frame_lock:
                self.current_frame = None

    def vision_processing(self):
        while self.thread_running:
            success, frame = self.camera.read()
            if not success:
                print("❌ Gagal membaca frame kamera.")
                break

            if self.model:
                # Menggunakan variabel self.confidence_level dari slider
                results = self.model(frame, conf=self.confidence_level, verbose=False)
                jumlah_deteksi = len(results[0].boxes)
                frame_annotated = results[0].plot()
                cv2.putText(frame_annotated, f"Deteksi: {jumlah_deteksi}", (20, 50), 
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2, cv2.LINE_AA)
            else:
                frame_annotated = frame
                jumlah_deteksi = 0
                cv2.putText(frame_annotated, "MODE RAW", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2, cv2.LINE_AA)

            self.fish_count = jumlah_deteksi

            current_time = time.time()
            if current_time - self.last_report_time > self.report_interval:
                threading.Thread(target=self.send_fish_count, args=(self.fish_count,), daemon=True).start()
                self.last_report_time = current_time

            with self.frame_lock:
                self.current_frame = frame_annotated.copy()
                
            time.sleep(0.01)

    def update_gui(self):
        self.lbl_home_count.configure(text=f"Total Deteksi Saat Ini: {self.fish_count}")

        if self.is_camera_running:
            with self.frame_lock:
                if self.current_frame is not None:
                    frame_rgb = cv2.cvtColor(self.current_frame, cv2.COLOR_BGR2RGB)
                    img = Image.fromarray(frame_rgb)
                    img = img.resize((640, 480))
                    imgtk = ctk.CTkImage(light_image=img, dark_image=img, size=(640, 480))
                    self.video_label.imgtk = imgtk
                    self.video_label.configure(image=imgtk, text="")

        self.after(30, self.update_gui)

    def on_closing(self):
        print("Sistem mematikan semua layanan...")
        self.listener_active = False
        self.thread_running = False
        if self.camera:
            self.camera.release()
        
        sys.stdout = sys.__stdout__
        sys.stderr = sys.__stderr__
        
        self.destroy()
        os._exit(0)

if __name__ == "__main__":
    app = AIVisionApp()
    app.protocol("WM_DELETE_WINDOW", app.on_closing)
    app.mainloop()
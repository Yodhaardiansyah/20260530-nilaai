from ultralytics import YOLO

def main():
    # 1. Load model dasar YOLOv8 nano (ringan untuk real-time webcam)
    model = YOLO('yolov8n.pt')

    # 2. Jalankan proses training
    # YOLO otomatis mendeteksi jika laptopmu memiliki GPU NVIDIA (CUDA)
    model.train(
        data='./dataset/data.yaml',   # Path ke file konfigurasi dataset
        epochs=50,                    # Jumlah iterasi (mulai dengan 50 dulu)
        imgsz=640,                    # Ukuran resolusi gambar standar YOLO
        batch=16,                     # Jumlah gambar per batch (turunkan ke 8 jika memori/VRAM tidak cukup)
        workers=2,                    # Jumlah worker untuk loading data (di Windows disarankan 2 atau 0)
        device=0,                     # Gunakan GPU jika tersedia (0 untuk GPU pertama, 'cpu' untuk paksa CPU)
        name='yolov8_nila'            # Nama folder hasil training nanti
    )

if __name__ == '__main__':
    main()
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <RTClib.h>
#include <ESP32Servo.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>

// ===========================================
// ======== KONFIGURASI PENGGUNA ==============
// ===========================================
const char* WIFI_SSID = "DESKTOP-CPC9IFS 3294";
const char* WIFI_PASSWORD = "5U418,0o";

// Ganti IP ini dengan IP Laravel kamu
const String API_URL = "http://10.28.144.94:8000/api/device"; 
const String DEVICE_TOKEN = "token-rahasia-mesin-123"; 

#define SERVO_PIN 13
const int POSISI_TUTUP = 0;    
const int POSISI_BUKA = 90;   
// ===========================================

WiFiClient client;
hd44780_I2Cexp lcd;
RTC_DS3231 rtc;
Servo myServo; 

unsigned long lastApiCheck = 0;
const unsigned long API_CHECK_INTERVAL = 5000; // Cek server tiap 5 detik

// --- Variabel Penyimpanan Jadwal Dinamis ---
const int MAX_SCHEDULES = 10;
int scheduleHours[MAX_SCHEDULES];
int scheduleMinutes[MAX_SCHEDULES];
bool scheduleExecuted[MAX_SCHEDULES];
int totalSchedules = 0;

void setup() {
  Serial.begin(115200);
  Wire.begin(); 
  
  lcd.begin(16, 2);
  lcd.backlight();
  lcd.print("Memulai Sistem");

  myServo.attach(SERVO_PIN);
  myServo.write(POSISI_TUTUP); 
  delay(500);
  myServo.detach(); 
  
  if (!rtc.begin()) {
    Serial.println("RTC Gagal!");
    lcd.setCursor(0, 1);
    lcd.print("RTC Gagal!");
    while (1);
  }

  lcd.clear();
  lcd.print("Connect WiFi...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  configTime(7 * 3600, 0, "pool.ntp.org");
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    rtc.adjust(DateTime(timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday, timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec));
  }

  lcd.clear();
  lcd.print("Sistem Siap!");
  delay(2000);
  lcd.clear();
}

void loop() {
  DateTime now = rtc.now();

  // 1. Ambil data JSON dari Laravel
  if (millis() - lastApiCheck > API_CHECK_INTERVAL) {
    if (WiFi.status() == WL_CONNECTED) {
      cekPerintahServer();
    }
    lastApiCheck = millis();
  }

  // 2. Eksekusi Jadwal
  cekJadwalPakan(now);

  // 3. Update Tampilan LCD
  updateLCD(now);
  
  delay(100); 
}

// ==========================================================
// ===== FUNGSI KOMUNIKASI & AKSI ===========================
// ==========================================================

void cekPerintahServer() {
  HTTPClient http;
  String url = API_URL + "/check-command";
  
  http.begin(client, url);
  http.addHeader("Authorization", "Bearer " + DEVICE_TOKEN);
  
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String payload = http.getString();
    
    // Alokasikan memori JSON
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload);
    
    if (!error) {
      // 1. Cek Perintah Manual
      bool feedNow = doc["feed_now"]; 
      if (feedNow) {
        Serial.println("Pakan Manual!");
        beriPakan();
        laporStatusServer("Pakan manual berhasil diberikan.");
      }
      
      // 2. Tarik Array Jadwal dari Laravel
      JsonArray schedules = doc["schedules"].as<JsonArray>();
      
      int index = 0;
      for (JsonVariant v : schedules) {
        if (index < MAX_SCHEDULES) {
          // Hanya update jika datanya benar-benar berubah, agar status "Executed" tidak reset terus
          if (scheduleHours[index] != v["h"].as<int>() || scheduleMinutes[index] != v["m"].as<int>()) {
             scheduleHours[index] = v["h"].as<int>();
             scheduleMinutes[index] = v["m"].as<int>();
             scheduleExecuted[index] = false; // Jadwal baru, siap dieksekusi
          }
          index++;
        }
      }
      totalSchedules = index; // Simpan total jadwal aktif saat ini
    }
  }
  http.end();
}

void laporStatusServer(String pesan) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = API_URL + "/log";
    
    http.begin(client, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + DEVICE_TOKEN);
    
    JsonDocument doc;
    doc["status"] = pesan;
    String jsonOutput;
    serializeJson(doc, jsonOutput);
    
    http.POST(jsonOutput);
    http.end();
  }
}

void beriPakan() {
  myServo.attach(SERVO_PIN); 
  delay(500); 
  lcd.clear();
  lcd.print("Memberi Pakan!");
  myServo.write(POSISI_BUKA); 
  delay(1500);                
  myServo.write(POSISI_TUTUP); 
  delay(500);
  myServo.detach(); 
  lcd.clear();
}

void cekJadwalPakan(DateTime now) {
  // Reset semua status eksekusi tepat jam 00:00 tengah malam
  if (now.hour() == 0 && now.minute() == 0 && now.second() == 0) {
    for (int i = 0; i < MAX_SCHEDULES; i++) {
      scheduleExecuted[i] = false;
    }
  }

  // Cek secara dinamis berdasarkan total jadwal aktif
  for (int i = 0; i < totalSchedules; i++) {
    if (now.hour() == scheduleHours[i] && now.minute() == scheduleMinutes[i] && !scheduleExecuted[i]) {
      beriPakan();
      scheduleExecuted[i] = true;
      String pesanLog = "Pakan otomatis berhasil (Jadwal " + String(scheduleHours[i]) + ":" + String(scheduleMinutes[i]) + ")";
      laporStatusServer(pesanLog);
    }
  }
}

void updateLCD(DateTime now) {
  char timeBuffer[6];
  sprintf(timeBuffer, "%02d:%02d", now.hour(), now.minute());
  
  lcd.setCursor(0, 0);
  lcd.print("Waktu: ");
  lcd.print(timeBuffer);
  
  lcd.setCursor(0, 1);
  lcd.print("Jdwl Aktif: ");
  lcd.print(totalSchedules);
  lcd.print("   "); 
}
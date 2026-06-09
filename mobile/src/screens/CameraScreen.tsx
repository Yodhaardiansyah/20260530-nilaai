import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Dimensions, ActivityIndicator, 
  Alert, TouchableOpacity, ScrollView 
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/axios';

const { width } = Dimensions.get('window');
// Membuat rasio video 4:3 menyesuaikan lebar layar
const VIDEO_HEIGHT = (width - 40) * (3 / 4); 
const PRIMARY_COLOR = '#007BFF';

export default function CameraScreen() {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  
  // State untuk data AI dan UI interaktif
  const [fishCount, setFishCount] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<string>('-');
  const [isRefreshingVideo, setIsRefreshingVideo] = useState(false);
  const [sendingCmd, setSendingCmd] = useState<string | null>(null);

  const webViewRef = useRef<WebView>(null);

  // Ambil URL kamera saat layar pertama kali dirender
  useEffect(() => {
    fetchConfig();
  }, []);

  // Polling data ikan tiap 5 detik selama layar ini aktif dibuka
  useFocusEffect(
    useCallback(() => {
      fetchVisionData();
      const intervalId = setInterval(() => {
        fetchVisionData();
      }, 5000);
      return () => clearInterval(intervalId);
    }, [])
  );

  const fetchConfig = async () => {
    try {
      const response = await api.get('/system-config');
      if (response.data.python_stream_url) {
        setStreamUrl(response.data.python_stream_url);
      }
    } catch (error) {
      console.log('Gagal ambil config URL stream');
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const fetchVisionData = async () => {
    try {
      const response = await api.get(`/dashboard/summary?t=${new Date().getTime()}`);
      if (response.data.success) {
        setFishCount(response.data.data.fish_count);
        setLastUpdate(response.data.data.last_vision_update);
      }
    } catch (error) {
      console.log('Error ambil data vision');
    }
  };

  const handleRefreshStream = () => {
    setIsRefreshingVideo(true);
    
    // Trik "Cache Busting": Jangan gunakan webViewRef.reload() untuk stream MJPEG.
    // Kita ubah URL-nya sedikit dengan menambahkan timestamp agar WebView dipaksa
    // membuka jalur koneksi TCP yang benar-benar baru ke server Python.
    if (streamUrl) {
      const baseUrl = streamUrl.split('?')[0]; // Buang timestamp lama (jika ada)
      setStreamUrl(`${baseUrl}?t=${new Date().getTime()}`);
    }
    
    setTimeout(() => setIsRefreshingVideo(false), 1500); 
  };

  // Fungsi universal pengirim perintah ke Laravel
  const sendAiCommand = async (cmdTarget: string, alertMessage: string) => {
    setSendingCmd(cmdTarget);
    try {
      const response = await api.post('/device/ai-command', { command: cmdTarget });
      if (response.data.success) {
        Alert.alert('Terkirim', alertMessage);
      }
    } catch (error) {
      Alert.alert('Gagal', 'Tidak dapat mengirim perintah ke server.');
    } finally {
      setSendingCmd(null);
    }
  };

  const handleRestartEngine = () => {
    Alert.alert(
      'Restart AI Engine', 
      'Yakin ingin merestart modul YOLOv8 di server AI? Video akan terputus selama beberapa detik.',
      [
        { text: 'Batal', style: 'cancel' },
        { 
          text: 'Restart', 
          style: 'destructive',
          onPress: () => sendAiCommand('restart', 'Perintah restart telah dikirim ke Node AI.') 
        }
      ]
    );
  };

  const handleResolution = () => {
    sendAiCommand('resolusi', 'Perintah ubah resolusi telah dikirim ke Node AI.');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* --- HEADER --- */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Live Vision AI</Text>
          <Text style={styles.headerSub}>Pantauan langsung dari edge device</Text>
        </View>
        
        {/* --- KARTU VIDEO --- */}
        <View style={styles.videoCard}>
          <View style={styles.videoHeader}>
            <View style={styles.statusIndicator}>
              <View style={[styles.dot, { backgroundColor: streamUrl ? '#ff4d4f' : '#ccc' }]} />
              <Text style={styles.statusText}>{streamUrl ? 'LIVE' : 'OFFLINE'}</Text>
            </View>
            <Text style={styles.fpsText}>YOLOv8 Node</Text>
          </View>

          <View style={styles.videoBox}>
            {isLoadingConfig ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={PRIMARY_COLOR} />
                <Text style={styles.loadingText}>Menghubungkan ke Kamera...</Text>
              </View>
            ) : streamUrl ? (
              <WebView
                ref={webViewRef}
                source={{ uri: streamUrl }}
                style={styles.webview}
                scrollEnabled={false}
                bounces={false}
                onLoadEnd={() => setIsRefreshingVideo(false)}
              />
            ) : (
              <View style={styles.centerLoading}>
                <Ionicons name="videocam-off-outline" size={48} color="#555" />
                <Text style={styles.errorText}>Kamera Tidak Terhubung</Text>
              </View>
            )}
            
            {/* Overlay saat video di-refresh */}
            {isRefreshingVideo && (
              <View style={styles.refreshOverlay}>
                <ActivityIndicator size="large" color="white" />
              </View>
            )}
          </View>
        </View>

        {/* --- KARTU STATISTIK AI --- */}
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statsIconBg}>
              <Ionicons name="scan" size={24} color={PRIMARY_COLOR} />
            </View>
            <View style={styles.statsInfo}>
              <Text style={styles.statsLabel}>Total Deteksi Saat Ini</Text>
              <Text style={styles.statsSub}>Terakhir: {lastUpdate}</Text>
            </View>
            <Text style={styles.statsValue}>{fishCount}</Text>
          </View>
        </View>

        {/* --- TOMBOL AKSI KAMERA --- */}
        <Text style={styles.sectionTitle}>KONTROL PERANGKAT</Text>
        <View style={styles.actionGrid}>
          
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={handleRefreshStream} 
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconBg, { backgroundColor: '#e6f2ff' }]}>
              <Ionicons name="refresh-outline" size={22} color={PRIMARY_COLOR} />
            </View>
            <Text style={styles.actionText}>Muat Ulang</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={handleRestartEngine} 
            activeOpacity={0.7}
            disabled={sendingCmd !== null}
          >
            <View style={[styles.actionIconBg, { backgroundColor: '#fff1f0' }]}>
              {sendingCmd === 'restart' ? (
                <ActivityIndicator size="small" color="#ff4d4f" />
              ) : (
                <Ionicons name="power-outline" size={22} color="#ff4d4f" />
              )}
            </View>
            <Text style={styles.actionText}>Restart AI</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={handleResolution} 
            activeOpacity={0.7}
            disabled={sendingCmd !== null}
          >
            <View style={[styles.actionIconBg, { backgroundColor: '#f6ffed' }]}>
              {sendingCmd === 'resolusi' ? (
                <ActivityIndicator size="small" color="#52c41a" />
              ) : (
                <Ionicons name="settings-outline" size={22} color="#52c41a" />
              )}
            </View>
            <Text style={styles.actionText}>Resolusi</Text>
          </TouchableOpacity>

        </View>

        {/* --- INFO FOOTER --- */}
        <View style={styles.footerCard}>
          <View style={styles.footerHeader}>
            <Ionicons name="information-circle-outline" size={20} color="#888" />
            <Text style={styles.footerTitle}>Info Sistem Vision</Text>
          </View>
          <Text style={styles.footerText}>
            Kamera memproses klasifikasi objek menggunakan arsitektur YOLOv8 secara real-time. Hitungan dikirimkan ke server utama setiap ada perubahan untuk akurasi data.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ==========================================
// STYLING
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10 },
  
  header: { marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#1c1c1e', letterSpacing: 0.5 },
  headerSub: { fontSize: 14, color: '#8e8e93', marginTop: 4 },

  videoCard: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 15,
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  videoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 5,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff1f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: 'bold', color: '#ff4d4f', letterSpacing: 1 },
  fpsText: { fontSize: 12, color: '#888', fontWeight: '600' },
  videoBox: {
    width: '100%',
    height: VIDEO_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1c1c1e',
    position: 'relative',
  },
  webview: { flex: 1, backgroundColor: 'black' },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#888', marginTop: 10, fontSize: 13 },
  errorText: { color: '#ff4d4f', fontWeight: '600', marginTop: 10 },
  refreshOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  statsCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    marginBottom: 25,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statsIconBg: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: '#e6f2ff',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 15,
  },
  statsInfo: { flex: 1 },
  statsLabel: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 2 },
  statsSub: { fontSize: 12, color: '#8e8e93' },
  statsValue: { fontSize: 36, fontWeight: '900', color: '#1c1c1e' },

  sectionTitle: { fontSize: 12, color: '#8e8e93', fontWeight: 'bold', marginBottom: 12, letterSpacing: 1.2 },
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  actionButton: {
    backgroundColor: 'white',
    width: (width - 40 - 20) / 3, 
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
  },
  actionIconBg: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  actionText: { fontSize: 12, fontWeight: '600', color: '#333' },

  footerCard: {
    backgroundColor: '#fafafa',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 20,
  },
  footerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  footerTitle: { fontSize: 14, fontWeight: 'bold', color: '#555', marginLeft: 8 },
  footerText: { fontSize: 13, color: '#888', lineHeight: 20 }
});
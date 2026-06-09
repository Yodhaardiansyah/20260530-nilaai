import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, ActivityIndicator, ScrollView, 
  RefreshControl, TouchableOpacity, Alert, Dimensions 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/axios';

const { width } = Dimensions.get('window');
const PRIMARY_COLOR = '#007BFF';

interface DashboardData {
  fish_count: number;
  last_vision_update: string;
  next_feeding: string;
  device_status: string;
  last_seen: string;
}

export default function DashboardScreen() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFeeding, setIsFeeding] = useState(false);

  const fetchSummary = async () => {
    try {
      const response = await api.get(`/dashboard/summary?t=${new Date().getTime()}`);
      if (response.data.success) {
        setData(response.data.data);
      }
    } catch (error) {
      console.log('Error ambil summary:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchSummary();
      const intervalId = setInterval(() => {
        fetchSummary();
      }, 5000);
      return () => clearInterval(intervalId);
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchSummary();
  };

  const handleFeedNow = async () => {
    setIsFeeding(true);
    try {
      const response = await api.post('/device/feed-now');
      if (response.data.success) {
        Alert.alert('Terkirim', 'Perintah pakan manual berhasil dikirim ke antrean server.');
      }
    } catch (error) {
      Alert.alert('Gagal', 'Tidak dapat mengirim perintah ke perangkat.');
    } finally {
      setIsFeeding(false);
    }
  };

  if (isLoading && !data) {
    return (
      <View style={styles.centerLoading}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        <Text style={styles.loadingText}>Memuat data sistem...</Text>
      </View>
    );
  }

  const isOnline = data?.device_status === 'Online';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY_COLOR} />}
      >
        {/* Header Section */}
        <View style={styles.header}>
          <Text style={styles.headerGreeting}>Pantauan Sistem</Text>
          <Text style={styles.headerSub}>Monitoring Kolam NilaAI Real-time</Text>
        </View>

        {/* Kartu Utama: Jumlah Ikan */}
        <View style={styles.mainCard}>
          <View style={styles.mainCardHeader}>
            <View style={styles.iconBackground}>
              <Ionicons name="camera-outline" size={24} color={PRIMARY_COLOR} />
            </View>
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>Live Vision</Text>
            </View>
          </View>
          
          <Text style={styles.mainCardLabel}>Total Ikan Terdeteksi</Text>
          <View style={styles.valueRow}>
            <Text style={styles.mainValue}>{data?.fish_count || 0}</Text>
            <Text style={styles.mainUnit}>Ekor</Text>
          </View>
          
          <View style={styles.footerRow}>
            <Ionicons name="time-outline" size={14} color="#888" />
            <Text style={styles.subText}> Update: {data?.last_vision_update || '-'}</Text>
          </View>
        </View>

        {/* Grid Section: Jadwal & Perangkat */}
        <View style={styles.gridContainer}>
          
          {/* Kartu Kiri: Jadwal */}
          <View style={styles.gridCard}>
            <View style={[styles.iconBackground, { backgroundColor: '#fffbe6' }]}>
              <Ionicons name="calendar-outline" size={20} color="#faad14" />
            </View>
            <Text style={styles.gridLabel}>Pakan Berikutnya</Text>
            <Text style={styles.gridValue}>{data?.next_feeding || '-'}</Text>
          </View>

          {/* Kartu Kanan: Status IoT */}
          <View style={styles.gridCard}>
            <View style={[styles.iconBackground, { backgroundColor: isOnline ? '#f6ffed' : '#fff1f0' }]}>
              <Ionicons name="hardware-chip-outline" size={20} color={isOnline ? '#52c41a' : '#ff4d4f'} />
            </View>
            <Text style={styles.gridLabel}>Status Node IoT</Text>
            <Text style={[styles.gridValue, { color: isOnline ? '#52c41a' : '#ff4d4f' }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
            <Text style={styles.gridSubText} numberOfLines={1}>
              {data?.last_seen || '-'}
            </Text>
          </View>

        </View>

        {/* Area Aksi: Tombol Pakan Manual */}
        <Text style={styles.sectionTitle}>TINDAKAN CEPAT</Text>
        <TouchableOpacity 
          style={styles.feedNowButton} 
          onPress={handleFeedNow}
          disabled={isFeeding}
          activeOpacity={0.8}
        >
          {isFeeding ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="water" size={20} color="white" style={{ marginRight: 8 }} />
              <Text style={styles.feedNowText}>Beri Pakan Manual</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F4F6F8', // Warna background abu-abu sangat muda ala aplikasi modern
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 10,
  },
  centerLoading: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#F4F6F8'
  },
  loadingText: {
    marginTop: 12,
    color: '#888',
    fontWeight: '500'
  },
  
  // Header
  header: {
    marginBottom: 20,
  },
  headerGreeting: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1c1c1e',
  },
  headerSub: {
    fontSize: 14,
    color: '#8e8e93',
    marginTop: 4,
  },

  // Kartu Utama
  mainCard: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  mainCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconBackground: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#e6f2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeContainer: {
    backgroundColor: '#f0f0f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  mainCardLabel: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
    marginBottom: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  mainValue: {
    fontSize: 48,
    fontWeight: '900',
    color: '#1c1c1e',
  },
  mainUnit: {
    fontSize: 18,
    fontWeight: '600',
    color: '#888',
    marginLeft: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f5',
    paddingTop: 16,
  },
  subText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },

  // Grid (Jadwal & IoT)
  gridContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  gridCard: {
    width: (width - 40 - 15) / 2, // 2 kolom dengan jarak di tengah
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  gridLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 4,
  },
  gridValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1c1c1e',
  },
  gridSubText: {
    fontSize: 10,
    color: '#aaa',
    marginTop: 4,
  },

  // Tombol Aksi
  sectionTitle: {
    fontSize: 12,
    color: '#8e8e93',
    fontWeight: 'bold',
    marginBottom: 12,
    letterSpacing: 1.2,
  },
  feedNowButton: {
    backgroundColor: PRIMARY_COLOR,
    flexDirection: 'row',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  feedNowText: { 
    color: 'white', 
    fontSize: 16, 
    fontWeight: '700',
    letterSpacing: 0.5
  }
});
import React, { useEffect, useState } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  TextInput, Switch, Alert, ActivityIndicator, Platform, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker'; 
import api from '../api/axios';

const PRIMARY_COLOR = '#007BFF';

interface Schedule {
  id: number;
  label: string;
  time: string;
  is_active: boolean | number;
}

export default function ScheduleScreen() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  
  const [newLabel, setNewLabel] = useState('');
  const [pickerTime, setPickerTime] = useState(new Date()); 
  const [showPicker, setShowPicker] = useState(false); 

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      const response = await api.get('/schedules');
      setSchedules(response.data.data);
    } catch (error) {
      Alert.alert('Error', 'Gagal memuat jadwal pakan');
    } finally {
      setIsLoading(false);
    }
  };

  const onTimeChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (selectedDate) {
      setPickerTime(selectedDate);
    }
  };

  const handleAddSchedule = async () => {
    const hours = String(pickerTime.getHours()).padStart(2, '0');
    const minutes = String(pickerTime.getMinutes()).padStart(2, '0');
    const formattedTime = `${hours}:${minutes}`;

    setIsAdding(true);
    try {
      const response = await api.post('/schedules', {
        time: formattedTime,
        label: newLabel || 'Jadwal Pakan'
      });
      
      setSchedules([...schedules, response.data.data]);
      setNewLabel('');
      setPickerTime(new Date()); 
    } catch (error) {
      Alert.alert('Error', 'Gagal menambahkan jadwal');
    } finally {
      setIsAdding(false);
    }
  };

  const toggleSchedule = async (id: number) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_active: !s.is_active } : s));
    try {
      await api.put(`/schedules/${id}/toggle`);
    } catch (error) {
      fetchSchedules();
      Alert.alert('Error', 'Gagal mengubah status jadwal');
    }
  };

  const deleteSchedule = (id: number) => {
    Alert.alert('Hapus Jadwal', 'Yakin ingin menghapus jadwal ini?', [
      { text: 'Batal', style: 'cancel' },
      { 
        text: 'Hapus', style: 'destructive', 
        onPress: async () => {
          try {
            await api.delete(`/schedules/${id}`);
            setSchedules(schedules.filter(s => s.id !== id));
          } catch (error) {
            Alert.alert('Error', 'Gagal menghapus jadwal');
          }
        } 
      }
    ]);
  };

  const renderScheduleItem = ({ item }: { item: Schedule }) => {
    const formattedTime = item.time.substring(0, 5); 
    const isActive = !!item.is_active;

    return (
      <View style={[styles.scheduleCard, !isActive && styles.scheduleCardInactive]}>
        <View style={styles.scheduleInfo}>
          <Text style={[styles.timeText, !isActive && styles.textInactive]}>{formattedTime}</Text>
          <Text style={styles.labelText}>{item.label}</Text>
        </View>
        
        <View style={styles.actions}>
          <Switch 
            value={isActive} 
            onValueChange={() => toggleSchedule(item.id)}
            trackColor={{ false: "#e5e5ea", true: "#34C759" }}
            thumbColor="white"
            ios_backgroundColor="#e5e5ea"
          />
          <TouchableOpacity onPress={() => deleteSchedule(item.id)} style={styles.deleteBtn}>
            <View style={styles.deleteIconBg}>
              <Ionicons name="trash" size={16} color="#ff4d4f" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const displayHours = String(pickerTime.getHours()).padStart(2, '0');
  const displayMinutes = String(pickerTime.getMinutes()).padStart(2, '0');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Jadwal Pakan</Text>
        <Text style={styles.headerSub}>Atur waktu alat memberi makan otomatis</Text>
      </View>
      
      {/* Kartu Form Tambah Jadwal */}
      <View style={styles.formContainer}>
        <View style={styles.inputRow}>
          <TouchableOpacity 
            style={styles.timePickerButton} 
            onPress={() => setShowPicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="time" size={20} color={PRIMARY_COLOR} style={{ marginRight: 8 }} />
            <Text style={styles.timePickerText}>
              {displayHours}:{displayMinutes}
            </Text>
          </TouchableOpacity>

          <View style={styles.textInputWrapper}>
            <TextInput 
              style={styles.inputLabel} 
              placeholder="Label (Mis: Pagi)" 
              placeholderTextColor="#aaa"
              value={newLabel}
              onChangeText={setNewLabel}
            />
          </View>
        </View>

        <TouchableOpacity 
          style={styles.addButton} 
          onPress={handleAddSchedule} 
          disabled={isAdding}
          activeOpacity={0.8}
        >
          {isAdding ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="add-circle" size={20} color="white" style={{ marginRight: 8 }} />
              <Text style={styles.addButtonText}>Simpan Jadwal Baru</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Modal Waktu Khusus iOS (agar spinner rapi di bawah) */}
      {Platform.OS === 'ios' && (
        <Modal visible={showPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Text style={styles.modalCancelBtn}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Text style={styles.modalDoneBtn}>Pilih</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={pickerTime}
                mode="time"
                is24Hour={true}
                display="spinner"
                onChange={onTimeChange}
                textColor="black"
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Picker Android bawaan (sudah berupa pop-up dialog dari sistem) */}
      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          value={pickerTime}
          mode="time"
          is24Hour={true}
          display="spinner"
          onChange={onTimeChange}
        />
      )}

      {/* Daftar Jadwal */}
      <Text style={styles.sectionTitle}>DAFTAR JADWAL AKTIF</Text>
      {isLoading ? (
        <ActivityIndicator size="large" color={PRIMARY_COLOR} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={schedules}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderScheduleItem}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-clear-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>Belum ada jadwal tersimpan</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 100 }} 
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F4F6F8', 
    paddingHorizontal: 20 
  },
  header: {
    marginTop: 10,
    marginBottom: 20,
  },
  headerTitle: { 
    fontSize: 28, 
    fontWeight: '800', 
    color: '#1c1c1e',
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 14,
    color: '#8e8e93',
    marginTop: 4,
  },
  
  // Form Area
  formContainer: { 
    backgroundColor: 'white', 
    padding: 20, 
    borderRadius: 24, 
    marginBottom: 25, 
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  inputRow: { 
    flexDirection: 'row', 
    marginBottom: 16, 
    alignItems: 'center' 
  },
  timePickerButton: { 
    flex: 1, 
    flexDirection: 'row',
    backgroundColor: '#e6f2ff',
    borderRadius: 16, 
    padding: 16, 
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  timePickerText: { 
    color: PRIMARY_COLOR, 
    fontWeight: '800', 
    fontSize: 18 
  },
  textInputWrapper: {
    flex: 1.2, 
    backgroundColor: '#fafafa',
    borderWidth: 1, 
    borderColor: '#e5e5ea', 
    borderRadius: 16, 
    height: '100%',
  },
  inputLabel: { 
    flex: 1,
    paddingHorizontal: 16, 
    fontSize: 15,
    color: '#333'
  },
  addButton: { 
    backgroundColor: '#34C759', // Hijau segar untuk tombol tambah
    flexDirection: 'row',
    paddingVertical: 16, 
    borderRadius: 16, 
    alignItems: 'center',
    justifyContent: 'center'
  },
  addButtonText: { 
    color: 'white', 
    fontWeight: '700',
    fontSize: 16 
  },

  // Modal Waktu iOS
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalCancelBtn: { color: '#888', fontSize: 16 },
  modalDoneBtn: { color: PRIMARY_COLOR, fontSize: 16, fontWeight: 'bold' },

  // List Jadwal
  sectionTitle: {
    fontSize: 12,
    color: '#8e8e93',
    fontWeight: 'bold',
    marginBottom: 12,
    letterSpacing: 1.2,
  },
  scheduleCard: { 
    flexDirection: 'row', 
    backgroundColor: 'white', 
    padding: 20, 
    borderRadius: 20, 
    marginBottom: 15, 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  scheduleCardInactive: {
    opacity: 0.6,
  },
  scheduleInfo: { 
    flex: 1 
  },
  timeText: { 
    fontSize: 32, 
    fontWeight: '900', 
    color: '#1c1c1e',
    letterSpacing: 1,
  },
  textInactive: {
    color: '#8e8e93',
  },
  labelText: { 
    fontSize: 14, 
    color: '#8e8e93', 
    fontWeight: '500',
    marginTop: 4 
  },
  actions: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  deleteBtn: { 
    marginLeft: 15 
  },
  deleteIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff1f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Empty State
  emptyContainer: { 
    alignItems: 'center', 
    justifyContent: 'center',
    marginTop: 40,
  },
  emptyText: { 
    color: '#8e8e93', 
    marginTop: 10,
    fontSize: 15,
    fontWeight: '500'
  }
});
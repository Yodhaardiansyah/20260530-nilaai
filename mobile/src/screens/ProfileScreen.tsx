import React, { useEffect, useState } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Alert, 
  ActivityIndicator, TextInput, ScrollView, KeyboardAvoidingView, Platform, Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useAuthStore } from '../store/useAuthStore';
import api from '../api/axios';

const PRIMARY_COLOR = '#007BFF';
const ACCENT_RED = '#ff4d4f';

interface UserData {
  id: number;
  name: string;
  email: string;
}

export default function ProfileScreen() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // State untuk form edit
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState(''); 
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  // State Notifikasi
  const [isPushEnabled, setIsPushEnabled] = useState(false);

  const { logout, setUser } = useAuthStore();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await api.get('/user');
      setUserData(response.data);
      setEditName(response.data.name);
      setEditEmail(response.data.email);
      
      // Jika dari backend mengembalikan info bahwa user punya expo_token, nyalakan saklar
      if (response.data.expo_token) {
        setIsPushEnabled(true);
      }
    } catch (error) {
      Alert.alert('Gagal', 'Tidak dapat mengambil data profil.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!editName || !editEmail) {
      Alert.alert('Error', 'Nama dan Email tidak boleh kosong!');
      return;
    }

    setIsSaving(true);
    try {
      const response = await api.put('/user', {
        name: editName,
        email: editEmail,
        password: editPassword 
      });

      if (response.data.success) {
        Alert.alert('Sukses', 'Profil berhasil diperbarui');
        setUserData(response.data.user);
        setUser(response.data.user);
        setIsEditing(false); 
        setEditPassword(''); 
      }
    } catch (error: any) {
      const errMsg = error.response?.data?.message || 'Gagal update profil';
      Alert.alert('Gagal', errMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleNotification = async (value: boolean) => {
    setIsPushEnabled(value);

    if (value) {
      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        if (finalStatus !== 'granted') {
          Alert.alert('Izin Ditolak', 'Silakan aktifkan izin notifikasi di pengaturan HP Anda.');
          setIsPushEnabled(false);
          return;
        }

        try {
          // Ambil Expo Push Token
          const tokenData = await Notifications.getExpoPushTokenAsync();
          const expoPushToken = tokenData.data;

          await api.post('/user/push-token', { token: expoPushToken });
          Alert.alert('Aktif', 'Notifikasi berhasil diaktifkan!');
        } catch (error) {
          console.log(error);
          Alert.alert('Error', 'Gagal mendapatkan token perangkat.');
          setIsPushEnabled(false);
        }
      } else {
        Alert.alert('Peringatan', 'Notifikasi fisik hanya berfungsi di perangkat HP asli.');
        setIsPushEnabled(false);
      }
    } else {
      try {
        await api.post('/user/remove-push-token');
      } catch (error) {
        console.log('Gagal menghapus token');
      }
    }
  };

  const handleLogout = async () => {
    Alert.alert("Konfirmasi", "Keluar dari aplikasi?", [
      { text: "Batal", style: "cancel" },
      { 
        text: "Keluar", style: "destructive",
        onPress: async () => {
          try { await api.post('/logout'); } catch (e) {} 
          finally { logout(); }
        }
      }
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        <Text style={styles.loadingText}>Memuat Profil...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardWrap}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Profil Akun</Text>
            <Text style={styles.headerSub}>Kelola data personal dan keamanan</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.avatarSection}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {userData?.name ? userData.name.substring(0, 2).toUpperCase() : 'US'}
                </Text>
              </View>
            </View>

            {!isEditing ? (
              <View style={styles.viewModeContainer}>
                <Text style={styles.name}>{userData?.name}</Text>
                <Text style={styles.email}>{userData?.email}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Administrator</Text>
                </View>

                <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)} activeOpacity={0.8}>
                  <Ionicons name="pencil" size={16} color="white" style={{ marginRight: 8 }} />
                  <Text style={styles.editButtonText}>Edit Profil</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.formContainer}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Nama Lengkap</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="person-outline" size={20} color="#888" style={styles.inputIcon} />
                    <TextInput style={styles.input} value={editName} onChangeText={setEditName} />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Alamat Email</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="mail-outline" size={20} color="#888" style={styles.inputIcon} />
                    <TextInput style={styles.input} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Kata Sandi Baru</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed-outline" size={20} color="#888" style={styles.inputIcon} />
                    <TextInput style={styles.input} value={editPassword} onChangeText={setEditPassword} secureTextEntry={!isPasswordVisible} placeholder="Kosongkan jika tidak diubah" />
                    <TouchableOpacity style={styles.eyeButton} onPress={() => setIsPasswordVisible(!isPasswordVisible)}>
                      <Ionicons name={isPasswordVisible ? "eye-off-outline" : "eye-outline"} size={20} color="#888" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.buttonRow}>
                  <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={() => setIsEditing(false)}>
                    <Text style={styles.cancelButtonText}>Batal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={handleUpdateProfile} disabled={isSaving}>
                    {isSaving ? <ActivityIndicator color="white" /> : <Text style={styles.saveButtonText}>Simpan</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <View style={styles.settingsGroup}>
            <Text style={styles.sectionTitle}>PENGATURAN</Text>
            
            {/* Togle Notifikasi */}
            <View style={styles.settingItem}>
              <View style={styles.settingIconBg}>
                <Ionicons name="notifications-outline" size={20} color="#555" />
              </View>
              <Text style={styles.settingText}>Notifikasi Sistem</Text>
              <Switch 
                value={isPushEnabled} 
                onValueChange={handleToggleNotification}
                trackColor={{ false: "#e5e5ea", true: "#34C759" }}
                thumbColor="white"
                ios_backgroundColor="#e5e5ea"
              />
            </View>
            
            <TouchableOpacity style={styles.settingItem} activeOpacity={0.7}>
              <View style={styles.settingIconBg}>
                <Ionicons name="help-buoy-outline" size={20} color="#555" />
              </View>
              <Text style={styles.settingText}>Bantuan & Laporan</Text>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={20} color={ACCENT_RED} />
              <Text style={styles.logoutText}>Keluar dari Akun</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  keyboardWrap: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F6F8' },
  loadingText: { marginTop: 12, color: '#888', fontWeight: '500' },
  header: { marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#1c1c1e', letterSpacing: 0.5 },
  headerSub: { fontSize: 14, color: '#8e8e93', marginTop: 4 },
  card: { backgroundColor: 'white', padding: 24, borderRadius: 24, alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 10, marginBottom: 25 },
  avatarSection: { position: 'relative', marginBottom: 20 },
  avatarCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#1c1c1e', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#F4F6F8' },
  avatarText: { color: 'white', fontSize: 32, fontWeight: 'bold', letterSpacing: 1 },
  viewModeContainer: { alignItems: 'center', width: '100%' },
  name: { fontSize: 22, fontWeight: '800', color: '#1c1c1e' },
  email: { fontSize: 14, color: '#8e8e93', marginTop: 4 },
  badge: { backgroundColor: '#e6f2ff', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 8 },
  badgeText: { color: PRIMARY_COLOR, fontSize: 12, fontWeight: 'bold' },
  editButton: { flexDirection: 'row', marginTop: 24, backgroundColor: '#1c1c1e', paddingVertical: 14, paddingHorizontal: 30, borderRadius: 16, alignItems: 'center' },
  editButtonText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  formContainer: { width: '100%', marginTop: 10 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, color: '#555', marginBottom: 6, fontWeight: '600', marginLeft: 4 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e5e5ea', borderRadius: 16, height: 52 },
  inputIcon: { paddingHorizontal: 15 },
  input: { flex: 1, height: '100%', fontSize: 15, color: '#333' },
  eyeButton: { paddingHorizontal: 15, height: '100%', justifyContent: 'center' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  actionButton: { flex: 1, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cancelButton: { backgroundColor: '#f0f0f5', marginRight: 8 },
  saveButton: { backgroundColor: PRIMARY_COLOR, marginLeft: 8 },
  cancelButtonText: { color: '#555', fontWeight: 'bold', fontSize: 15 },
  saveButtonText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  settingsGroup: { width: '100%' },
  sectionTitle: { fontSize: 12, color: '#8e8e93', fontWeight: 'bold', marginBottom: 12, letterSpacing: 1.2 },
  settingItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 10 },
  settingIconBg: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f5f5f7', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  settingText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#333' },
  logoutButton: { flexDirection: 'row', width: '100%', backgroundColor: '#fff1f0', padding: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ffccc7', marginTop: 10 },
  logoutText: { color: ACCENT_RED, fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
});
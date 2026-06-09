import React, { useEffect, useState } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, Modal, 
  Dimensions, Platform, TouchableWithoutFeedback, Alert 
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from './src/store/useAuthStore';

// Import Screens
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import CameraScreen from './src/screens/CameraScreen';
import ScheduleScreen from './src/screens/ScheduleScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const { width } = Dimensions.get('window');

// Komponen kosong untuk tab "Menu"
const DummyScreen = () => <View style={{ flex: 1, backgroundColor: 'white' }} />;

const PRIMARY_COLOR = '#007BFF'; 
const ACCENT_RED = '#ff4d4f';

// ==========================================
// 1. KOMPONEN CUSTOM TAB BAR
// ==========================================
const CustomTabBar = ({ state, descriptors, navigation, setMenuVisible }: any) => {
  return (
    <SafeAreaView edges={['bottom']} style={styles.tabBarWrapper}>
      <View style={styles.tabBarContainer}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const label = route.name;
          const isFocused = state.index === index;
          
          const isCameraFAB = label === 'Kamera';
          const isMenuTrigger = label === 'Menu';

          const onPress = () => {
            if (isMenuTrigger) {
              setMenuVisible(true); 
              return;
            }
            
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          let iconName: keyof typeof Ionicons.glyphMap = 'cube';
          if (label === 'Dashboard') iconName = isFocused ? 'grid' : 'grid-outline';
          else if (label === 'Jadwal') iconName = isFocused ? 'calendar-number' : 'calendar-number-outline';
          else if (label === 'Profil') iconName = isFocused ? 'person' : 'person-outline';
          else if (label === 'Menu') iconName = 'ellipsis-horizontal-circle-outline';

          // --- TOMBOL KAMERA (SUDAH DIGANTI IKONNYA) ---
          if (isCameraFAB) {
            return (
              <TouchableOpacity key={route.key} onPress={onPress} style={styles.fabContainer} activeOpacity={0.9}>
                <View style={styles.fabButton}>
                  <Ionicons name="camera" size={28} color="white" />
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity key={route.key} onPress={onPress} style={styles.tabItem}>
              <Ionicons name={iconName} size={24} color={isFocused ? PRIMARY_COLOR : '#8e8e93'} />
              <Text style={[styles.tabLabel, { color: isFocused ? PRIMARY_COLOR : '#8e8e93' }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
};

// ==========================================
// 2. KOMPONEN MENU MODAL (DENGAN PERULANGAN)
// ==========================================
const MenuModal = ({ visible, onClose, navigation }: { visible: boolean, onClose: () => void, navigation: any }) => {
  const { setToken, user } = useAuthStore(); 

  const handleLogout = async () => {
    Alert.alert('Keluar', 'Yakin ingin keluar dari sistem?', [
      { text: 'Batal', style: 'cancel' },
      { 
        text: 'Keluar', style: 'destructive', 
        onPress: async () => {
          await SecureStore.deleteItemAsync('userToken');
          setToken(null);
          onClose();
        } 
      }
    ]);
  };

  const navigateTo = (screen: string) => {
    onClose(); 
    navigation.navigate('Main', { screen: screen });
  };

  // --- ARRAY UNTUK PERULANGAN MENU ---
  // Kamu cukup menambah/menghapus baris di array ini jika ada layar baru nantinya
  const menuItems = [
    { name: 'Dashboard', icon: 'grid-outline', screen: 'Dashboard' },
    { name: 'AI Kamera', icon: 'camera-outline', screen: 'Kamera' },
    { name: 'Jadwal Pakan', icon: 'calendar-number-outline', screen: 'Jadwal' },
    { name: 'Profil Anda', icon: 'person-outline', screen: 'Profil' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay} />
      </TouchableWithoutFeedback>

      <View style={styles.modalContent}>
        
        <View style={styles.modalHeader}>
          <View style={styles.modalTitleArea}>
            <Ionicons name="fish" size={24} color={PRIMARY_COLOR} />
            <Text style={styles.modalTitle}>NilaAI System</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeModalBtn}>
            <Ionicons name="close" size={20} color="#555" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>SISTEM MENU</Text>

        {/* --- PERULANGAN (MAPPING) MENU DI SINI --- */}
        <View style={styles.menuGrid}>
          {menuItems.map((item, index) => (
            <TouchableOpacity key={index} style={styles.gridItem} onPress={() => navigateTo(item.screen)}>
              <View style={styles.gridIconBackground}>
                <Ionicons name={item.icon as any} size={20} color={PRIMARY_COLOR} />
              </View>
              <Text style={styles.gridText}>{item.name}</Text>
              <Ionicons name="chevron-forward" size={16} color="#ccc" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name ? user.name.substring(0, 2).toUpperCase() : 'US'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || 'User Pembudidaya'}</Text>
            <Text style={styles.profileRole}>{user?.email || 'Akun Personal'}</Text>
          </View>
          <TouchableOpacity onPress={() => navigateTo('Profil')}>
            <Ionicons name="settings-outline" size={20} color={PRIMARY_COLOR} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={ACCENT_RED} />
          <Text style={styles.logoutText}>Keluar Sistem</Text>
        </TouchableOpacity>

      </View>
    </Modal>
  );
};

// ==========================================
// 3. NAVIGATOR TAB UTAMA
// ==========================================
function MainTabs({ navigation }: any) {
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <>
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} setMenuVisible={setMenuVisible} />}
        screenOptions={{ headerShown: false }}
        initialRouteName="Dashboard"
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Jadwal" component={ScheduleScreen} />
        <Tab.Screen name="Kamera" component={CameraScreen} />
        <Tab.Screen name="Profil" component={ProfileScreen} />
        <Tab.Screen name="Menu" component={DummyScreen} />
      </Tab.Navigator>

      <MenuModal 
        visible={menuVisible} 
        onClose={() => setMenuVisible(false)} 
        navigation={navigation} 
      />
    </>
  );
}

// ==========================================
// 4. ROOT APP CONFIG
// ==========================================
export default function App() {
  const { token, setToken } = useAuthStore();

  useEffect(() => {
    const checkToken = async () => {
      const savedToken = await SecureStore.getItemAsync('userToken');
      if (savedToken) setToken(savedToken);
    };
    checkToken();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {token == null ? (
            <Stack.Screen name="Login" component={LoginScreen} />
          ) : (
            <Stack.Screen name="Main" component={MainTabs} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

// ==========================================
// 5. STYLING
// ==========================================
const styles = StyleSheet.create({
  tabBarWrapper: {
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f2',
    elevation: 20, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  tabBarContainer: {
    flexDirection: 'row',
    height: 65,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  fabContainer: {
    width: 70,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    top: -18, 
    elevation: 8,
    shadowColor: PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    borderWidth: 4,
    borderColor: 'white', 
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)', 
  },
  modalContent: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: 'white',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 25,
    paddingBottom: Platform.OS === 'ios' ? 40 : 25,
    elevation: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitleArea: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 10,
  },
  closeModalBtn: {
    backgroundColor: '#f5f5f7',
    padding: 8,
    borderRadius: 20,
  },
  sectionTitle: {
    fontSize: 12,
    color: '#8e8e93',
    fontWeight: 'bold',
    marginBottom: 15,
    letterSpacing: 1.2,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  gridItem: {
    width: (width - 50 - 15) / 2, 
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#f0f0f2',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  gridIconBackground: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#e6f0ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  gridText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fafafa',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 16,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#333', 
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  avatarText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  profileRole: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    backgroundColor: '#fff1f0', 
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffccc7',
  },
  logoutText: {
    color: ACCENT_RED,
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 10,
  },
});
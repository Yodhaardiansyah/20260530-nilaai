import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface User {
  id: number;
  name: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void; // <-- Tambahkan definisi ini
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  
  setToken: (token) => {
    if (token) {
      SecureStore.setItemAsync('userToken', token);
    } else {
      SecureStore.deleteItemAsync('userToken');
    }
    set({ token });
  },

  // <-- Tambahkan implementasi fungsi setUser di sini
  setUser: (user) => set({ user }), 

  logout: async () => {
    await SecureStore.deleteItemAsync('userToken');
    // Bersihkan juga data user saat logout agar kembali kosong
    set({ token: null, user: null }); 
  }
}));